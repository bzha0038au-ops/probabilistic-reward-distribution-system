import {
  SECURITY_ADMIN_PERMISSION_KEYS,
  buildAdminCookieHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
} from './integration-test-support';
import { adminActions, amlChecks, freezeRecords } from '@reward/database';
import { and, desc, eq } from '@reward/database/orm';

const seedPendingAmlHit = async (email: string) => {
  const user = await seedUserWithWallet({ email });
  const { screenUserWithdrawal } = await import('../modules/aml/service');

  await expect(
    screenUserWithdrawal(user.id, {
      amlMockResult: 'hit',
      amlMockTerm: 'ofac',
    })
  ).rejects.toMatchObject({
    statusCode: 423,
  });

  const [amlCheck] = await getDb()
    .select()
    .from(amlChecks)
    .where(eq(amlChecks.userId, user.id))
    .orderBy(desc(amlChecks.id))
    .limit(1);

  const [freeze] = await getDb()
    .select()
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.userId, user.id),
        eq(freezeRecords.scope, 'account_lock'),
        eq(freezeRecords.status, 'active')
      )
    )
    .orderBy(desc(freezeRecords.id))
    .limit(1);

  expect(amlCheck).toBeTruthy();
  expect(freeze).toBeTruthy();

  return {
    user,
    amlCheck: amlCheck!,
    freeze: freeze!,
  };
};

describeIntegrationSuite('backend aml integration', () => {
  it(
    'lists pending AML hits and confirms them to account_lock with audit',
    { tag: 'critical' },
    async () => {
    const adminEmail = 'aml-confirm-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email: adminEmail });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: adminEmail,
      password,
    });

    const { user, amlCheck } = await seedPendingAmlHit(
      'aml-confirm-user@example.com'
    );

    const listResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/aml-checks',
      headers: buildAdminCookieHeaders(adminSession.token),
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toMatchObject({
      items: [
        expect.objectContaining({
          id: amlCheck.id,
          userId: user.id,
          reviewStatus: 'pending',
          result: 'hit',
          providerPayload: expect.any(Object),
          activeFreezeReason: 'aml_review',
        }),
      ],
      summary: expect.objectContaining({
        pendingCount: 1,
      }),
    });

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/aml-checks/${amlCheck.id}/confirm`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        totpCode: adminSession.totpCode,
        note: 'confirmed sanctions match',
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toMatchObject({
      amlCheckId: amlCheck.id,
      userId: user.id,
      reviewStatus: 'confirmed',
      activeFreezeReason: 'account_lock',
    });

    const [updatedCheck] = await getDb()
      .select({
        reviewStatus: amlChecks.reviewStatus,
        reviewedByAdminId: amlChecks.reviewedByAdminId,
        reviewNotes: amlChecks.reviewNotes,
      })
      .from(amlChecks)
      .where(eq(amlChecks.id, amlCheck.id))
      .limit(1);

    expect(updatedCheck).toMatchObject({
      reviewStatus: 'confirmed',
      reviewedByAdminId: admin.id,
      reviewNotes: 'confirmed sanctions match',
    });

    const [updatedFreeze] = await getDb()
      .select({
        reason: freezeRecords.reason,
        status: freezeRecords.status,
      })
      .from(freezeRecords)
      .where(
        and(
          eq(freezeRecords.userId, user.id),
          eq(freezeRecords.scope, 'account_lock'),
          eq(freezeRecords.status, 'active')
        )
      )
      .orderBy(desc(freezeRecords.id))
      .limit(1);

    expect(updatedFreeze).toMatchObject({
      reason: 'account_lock',
      status: 'active',
    });

    const [auditAction] = await getDb()
      .select({
        action: adminActions.action,
        targetId: adminActions.targetId,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(eq(adminActions.action, 'aml_hit_confirm'))
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(auditAction).toMatchObject({
      action: 'aml_hit_confirm',
      targetId: amlCheck.id,
      metadata: expect.objectContaining({
        userId: user.id,
        reviewStatus: 'confirmed',
      }),
    });
    }
  );

  it('clears pending AML hits and releases the AML review freeze', async () => {
    const adminEmail = 'aml-clear-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email: adminEmail });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: adminEmail,
      password,
    });

    const { user, amlCheck, freeze } = await seedPendingAmlHit(
      'aml-clear-user@example.com'
    );

    const clearResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/aml-checks/${amlCheck.id}/clear`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        totpCode: adminSession.totpCode,
        note: 'false positive',
      },
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json().data).toMatchObject({
      amlCheckId: amlCheck.id,
      userId: user.id,
      reviewStatus: 'cleared',
    });

    const [releasedFreeze] = await getDb()
      .select({
        status: freezeRecords.status,
        releasedAt: freezeRecords.releasedAt,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.id, freeze.id))
      .limit(1);

    expect(releasedFreeze).toMatchObject({
      status: 'released',
      releasedAt: expect.any(Date),
    });
  });

  it('escalates pending AML hits and keeps the account frozen', async () => {
    const adminEmail = 'aml-escalate-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email: adminEmail });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: adminEmail,
      password,
    });

    const { user, amlCheck } = await seedPendingAmlHit(
      'aml-escalate-user@example.com'
    );

    const escalateResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/aml-checks/${amlCheck.id}/escalate`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        totpCode: adminSession.totpCode,
        note: 'send to compliance queue',
      },
    });

    expect(escalateResponse.statusCode).toBe(200);
    expect(escalateResponse.json().data).toMatchObject({
      amlCheckId: amlCheck.id,
      userId: user.id,
      reviewStatus: 'escalated',
      activeFreezeReason: 'aml_review',
    });

    const [updatedCheck] = await getDb()
      .select({
        reviewStatus: amlChecks.reviewStatus,
        escalatedAt: amlChecks.escalatedAt,
      })
      .from(amlChecks)
      .where(eq(amlChecks.id, amlCheck.id))
      .limit(1);

    expect(updatedCheck).toMatchObject({
      reviewStatus: 'escalated',
      escalatedAt: expect.any(Date),
    });
  });
});
