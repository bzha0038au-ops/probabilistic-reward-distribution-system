import { createHash } from 'node:crypto';
import {
  adminActions,
  authEvents,
  saasApiKeys,
  saasLedgerEntries,
  saasPlayers,
  saasProjects,
  saasTenants,
  saasTenantMemberships,
} from '@reward/database';
import { desc, eq } from '@reward/database/orm';

import {
  buildAdminCookieHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  seedAdminAccount,
} from './integration-test-support';

const DEFAULT_SCOPES = [
  'catalog:read',
  'fairness:read',
  'draw:write',
  'ledger:read',
] as const;
const LEDGER_SCOPES = ['ledger:read'] as const;

let prizeEngineFixtureCounter = 1;

const hashApiKey = (value: string) =>
  createHash('sha256').update(value.trim()).digest('hex');

const seedPrizeEngineTenantProject = async (label: string) => {
  const database = getDb();
  const suffix = prizeEngineFixtureCounter++;

  const [tenant] = await database
    .insert(saasTenants)
    .values({
      slug: `${label}-tenant-${suffix}`,
      name: `${label} Tenant ${suffix}`,
      status: 'active',
    })
    .returning();

  const [project] = await database
    .insert(saasProjects)
    .values({
      tenantId: tenant.id,
      slug: `${label}-project-${suffix}`,
      name: `${label} Project ${suffix}`,
      environment: 'sandbox',
      status: 'active',
      currency: 'USD',
    })
    .returning();

  return {
    tenant,
    project,
  };
};

const seedPrizeEngineProject = async (
  label: string,
  options?: {
    scopes?: readonly string[];
  },
) => {
  const database = getDb();
  const { tenant, project } = await seedPrizeEngineTenantProject(label);
  const keyPrefix = `pe_test_${label}_${project.id}`;
  const plainKey = `${keyPrefix}_secret`;

  await database.insert(saasApiKeys).values({
    projectId: project.id,
    label: `${label} ledger key`,
    keyPrefix,
    keyHash: hashApiKey(plainKey),
    scopes: [...(options?.scopes ?? LEDGER_SCOPES)],
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  return {
    tenant,
    project,
    apiKey: plainKey,
  };
};

const seedProjectPlayerLedger = async (params: {
  projectId: number;
  externalPlayerId: string;
  displayName: string;
  balance: string;
  entries: Array<{
    entryType: string;
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
  }>;
}) => {
  const database = getDb();
  const [player] = await database
    .insert(saasPlayers)
    .values({
      projectId: params.projectId,
      externalPlayerId: params.externalPlayerId,
      displayName: params.displayName,
      balance: params.balance,
      pityStreak: 0,
    })
    .returning();

  await database.insert(saasLedgerEntries).values(
    params.entries.map((entry) => ({
      projectId: params.projectId,
      playerId: player.id,
      entryType: entry.entryType,
      amount: entry.amount,
      balanceBefore: entry.balanceBefore,
      balanceAfter: entry.balanceAfter,
      referenceType: 'integration',
      metadata: {
        source: 'cross-tenant-test',
      },
    }))
  );

  return player;
};

const seedConfigAdminSession = async (email: string) => {
  const seeded = await seedAdminAccount({ email });
  await grantAdminPermissions(seeded.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
  const session = await enrollAdminMfa({ email, password: seeded.password });

  return {
    ...seeded,
    session,
    headers: {
      ...buildAdminCookieHeaders(session.token),
      'x-admin-totp-code': session.totpCode,
    },
  };
};

const grantTenantOwnerMembership = async (tenantId: number, adminId: number) => {
  await getDb()
    .insert(saasTenantMemberships)
    .values({
      tenantId,
      adminId,
      role: 'tenant_owner',
      createdByAdminId: adminId,
    })
    .onConflictDoNothing();
};

describeIntegrationSuite('backend prize engine integration', () => {
  it(
    'returns 404 when a project API key requests a player that only exists in another tenant',
    { tag: 'critical' },
    async () => {
      const projectA = await seedPrizeEngineProject('alpha');
      const projectB = await seedPrizeEngineProject('bravo');

      await seedProjectPlayerLedger({
        projectId: projectB.project.id,
        externalPlayerId: 'shared-player',
        displayName: 'Tenant B Player',
        balance: '80.00',
        entries: [
          {
            entryType: 'prize_reward',
            amount: '80.00',
            balanceBefore: '0.00',
            balanceAfter: '80.00',
          },
        ],
      });

      const response = await getApp().inject({
        method: 'GET',
        url: '/v1/engine/ledger?playerId=shared-player',
        headers: {
          authorization: `Bearer ${projectA.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'PROJECT_PLAYER_NOT_FOUND',
        },
      });
    }
  );

  it(
    'returns only the authenticated project ledger when external player ids collide across tenants',
    { tag: 'critical' },
    async () => {
      const projectA = await seedPrizeEngineProject('alpha');
      const projectB = await seedPrizeEngineProject('bravo');

      await seedProjectPlayerLedger({
        projectId: projectA.project.id,
        externalPlayerId: 'collision-player',
        displayName: 'Tenant A Player',
        balance: '12.00',
        entries: [
          {
            entryType: 'draw_cost',
            amount: '-3.00',
            balanceBefore: '15.00',
            balanceAfter: '12.00',
          },
          {
            entryType: 'prize_reward',
            amount: '15.00',
            balanceBefore: '0.00',
            balanceAfter: '15.00',
          },
        ],
      });

      await seedProjectPlayerLedger({
        projectId: projectB.project.id,
        externalPlayerId: 'collision-player',
        displayName: 'Tenant B Player',
        balance: '200.00',
        entries: [
          {
            entryType: 'prize_reward',
            amount: '200.00',
            balanceBefore: '0.00',
            balanceAfter: '200.00',
          },
        ],
      });

      const response = await getApp().inject({
        method: 'GET',
        url: '/v1/engine/ledger?playerId=collision-player&limit=10',
        headers: {
          authorization: `Bearer ${projectA.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          player: {
            projectId: projectA.project.id,
            externalPlayerId: 'collision-player',
            displayName: 'Tenant A Player',
            balance: '12.00',
          },
          entries: [
            {
              entryType: 'prize_reward',
              amount: '15.00',
              balanceAfter: '15.00',
            },
            {
              entryType: 'draw_cost',
              amount: '-3.00',
              balanceAfter: '12.00',
            },
          ],
        },
      });

      const payload = response.json();
      expect(payload.data.entries).toHaveLength(2);
      expect(
        payload.data.entries.every((entry: { amount: string }) => entry.amount !== '200.00')
      ).toBe(true);
    }
  );

  it('issues expiring API keys and audits the effective granted scopes', async () => {
    const { tenant, project } = await seedPrizeEngineTenantProject('issue');
    const admin = await seedConfigAdminSession('saas-issue-admin@example.com');
    await grantTenantOwnerMembership(tenant.id, admin.admin.id);

    const response = await getApp().inject({
      method: 'POST',
      url: `/admin/saas/projects/${project.id}/keys`,
      headers: admin.headers,
      payload: {
        label: 'Primary integration key',
      },
    });

    expect(response.statusCode).toBe(201);
    const issued = response.json().data as {
      id: number;
      apiKey: string;
      keyPrefix: string;
      scopes: string[];
      expiresAt: string;
    };
    expect(issued.scopes).toEqual([...DEFAULT_SCOPES]);

    const [issuedRow] = await getDb()
      .select()
      .from(saasApiKeys)
      .where(eq(saasApiKeys.id, issued.id))
      .limit(1);

    expect(issuedRow?.expiresAt).toBeTruthy();
    expect(issuedRow!.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 80 * 24 * 60 * 60 * 1000,
    );

    const [issueAudit] = await getDb()
      .select()
      .from(adminActions)
      .where(eq(adminActions.action, 'saas_api_key_issue'))
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(issueAudit).toBeTruthy();
    expect(issueAudit?.targetId).toBe(issued.id);
    expect(issueAudit?.metadata).toMatchObject({
      projectId: project.id,
      keyPrefix: issued.keyPrefix,
      scopes: [...DEFAULT_SCOPES],
    });

    const activeResponse = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
      },
    });
    expect(activeResponse.statusCode).toBe(200);

    await getDb()
      .update(saasApiKeys)
      .set({
        expiresAt: new Date(Date.now() - 60 * 1000),
      })
      .where(eq(saasApiKeys.id, issued.id));

    const expiredResponse = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
      },
    });
    expect(expiredResponse.statusCode).toBe(401);
  });

  it('rotates API keys with explicit overlap and predecessor/successor linkage', async () => {
    const seededProject = await seedPrizeEngineProject('rotate', {
      scopes: DEFAULT_SCOPES,
    });
    const admin = await seedConfigAdminSession('saas-rotate-admin@example.com');
    await grantTenantOwnerMembership(seededProject.tenant.id, admin.admin.id);

    const [existingKey] = await getDb()
      .select()
      .from(saasApiKeys)
      .where(eq(saasApiKeys.keyHash, hashApiKey(seededProject.apiKey)))
      .limit(1);

    expect(existingKey).toBeTruthy();

    const rotateResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/saas/projects/${seededProject.project.id}/keys/${existingKey!.id}/rotate`,
      headers: admin.headers,
      payload: {
        overlapSeconds: 60,
        reason: 'integration-rotation',
      },
    });

    expect(rotateResponse.statusCode).toBe(201);
    const rotation = rotateResponse.json().data as {
      previousKey: {
        id: number;
        rotatedToApiKeyId: number | null;
        expiresAt: string;
      };
      issuedKey: {
        id: number;
        apiKey: string;
        rotatedFromApiKeyId: number | null;
      };
      overlapEndsAt: string;
      reason: string | null;
    };

    expect(rotation.reason).toBe('integration-rotation');
    expect(rotation.previousKey.rotatedToApiKeyId).toBe(rotation.issuedKey.id);
    expect(rotation.issuedKey.rotatedFromApiKeyId).toBe(rotation.previousKey.id);
    expect(new Date(rotation.overlapEndsAt).getTime()).toBeGreaterThan(Date.now());

    const oldKeyBeforeExpiry = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
    });
    expect(oldKeyBeforeExpiry.statusCode).toBe(200);

    const newKeyBeforeExpiry = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${rotation.issuedKey.apiKey}`,
      },
    });
    expect(newKeyBeforeExpiry.statusCode).toBe(200);

    await getDb()
      .update(saasApiKeys)
      .set({
        expiresAt: new Date(Date.now() - 60 * 1000),
      })
      .where(eq(saasApiKeys.id, rotation.previousKey.id));

    const oldKeyAfterExpiry = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
    });
    expect(oldKeyAfterExpiry.statusCode).toBe(401);

    const newKeyAfterExpiry = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: `Bearer ${rotation.issuedKey.apiKey}`,
      },
    });
    expect(newKeyAfterExpiry.statusCode).toBe(200);

    const [rotatedRow] = await getDb()
      .select()
      .from(saasApiKeys)
      .where(eq(saasApiKeys.id, rotation.previousKey.id))
      .limit(1);
    const [issuedRow] = await getDb()
      .select()
      .from(saasApiKeys)
      .where(eq(saasApiKeys.id, rotation.issuedKey.id))
      .limit(1);

    expect(rotatedRow?.rotatedToApiKeyId).toBe(rotation.issuedKey.id);
    expect(issuedRow?.rotatedFromApiKeyId).toBe(rotation.previousKey.id);
  });

  it('records failed API key authentication attempts with request context', async () => {
    const missingResponse = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        'user-agent': 'integration-missing-agent',
      },
    });
    expect(missingResponse.statusCode).toBe(401);

    const invalidResponse = await getApp().inject({
      method: 'GET',
      url: '/v1/engine/overview',
      headers: {
        authorization: 'Bearer pe_test_invalid_secret',
        'user-agent': 'integration-invalid-agent',
      },
    });
    expect(invalidResponse.statusCode).toBe(401);

    const [failedEvent] = await getDb()
      .select()
      .from(authEvents)
      .where(eq(authEvents.eventType, 'saas_api_key_auth_failed'))
      .orderBy(desc(authEvents.id))
      .limit(1);
    const [missingEvent] = await getDb()
      .select()
      .from(authEvents)
      .where(eq(authEvents.eventType, 'saas_api_key_auth_missing'))
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(failedEvent?.userAgent).toBe('integration-invalid-agent');
    expect(failedEvent?.metadata).toMatchObject({
      reason: 'authentication_rejected',
      method: 'GET',
      route: '/v1/engine/overview',
      apiKeyHint: 'pe_test_invalid',
    });

    expect(missingEvent?.userAgent).toBe('integration-missing-agent');
    expect(missingEvent?.metadata).toMatchObject({
      reason: 'missing_api_key',
      method: 'GET',
      route: '/v1/engine/overview',
      apiKeyHint: null,
    });
  });
});
