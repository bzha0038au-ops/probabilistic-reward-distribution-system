import { createHash, createHmac } from "node:crypto";
import {
  agentBlocklist,
  agentRiskState,
  adminActions,
  auditEvents,
  authEvents,
  saasApiKeys,
  saasAgents,
  saasAgentGroupCorrelations,
  saasDrawRecords,
  saasLedgerEntries,
  saasOutboundWebhookDeliveries,
  saasOutboundWebhooks,
  saasPlayers,
  saasProjectPrizes,
  saasProjects,
  saasRewardEnvelopes,
  saasTenants,
  saasTenantMemberships,
} from "@reward/database";
import { and, desc, eq } from "@reward/database/orm";

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
} from "./integration-test-support";
import { afterEach, vi } from "vitest";
import { runSaasOutboundWebhookDeliveryCycle } from "../modules/saas/service";

const DEFAULT_SCOPES = [
  "catalog:read",
  "fairness:read",
  "reward:write",
  "ledger:read",
] as const;
const LEDGER_SCOPES = ["ledger:read"] as const;

let prizeEngineFixtureCounter = 1;

afterEach(() => {
  vi.unstubAllGlobals();
});

const hashApiKey = (value: string) =>
  createHash("sha256").update(value.trim()).digest("hex");

const prizeEngineUrl = (
  path: string,
  environment: "sandbox" | "live" = "sandbox",
) => `${path}${path.includes("?") ? "&" : "?"}environment=${environment}`;

const prizeEnginePayload = <T extends Record<string, unknown>>(
  payload: T,
  environment: "sandbox" | "live" = "sandbox",
) => ({
  environment,
  ...payload,
});

const seedPrizeEngineTenantProject = async (
  label: string,
  environment: "sandbox" | "live" = "sandbox",
) => {
  const database = getDb();
  const suffix = prizeEngineFixtureCounter++;

  const [tenant] = await database
    .insert(saasTenants)
    .values({
      slug: `${label}-tenant-${suffix}`,
      name: `${label} Tenant ${suffix}`,
      status: "active",
    })
    .returning();

  const [project] = await database
    .insert(saasProjects)
    .values({
      tenantId: tenant.id,
      slug: `${label}-project-${suffix}`,
      name: `${label} Project ${suffix}`,
      environment,
      status: "active",
      currency: "USD",
      prizePoolBalance: "100.00",
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
    environment?: "sandbox" | "live";
  },
) => {
  const database = getDb();
  const environment = options?.environment ?? "sandbox";
  const { tenant, project } = await seedPrizeEngineTenantProject(
    label,
    environment,
  );
  const keyPrefix =
    environment === "live"
      ? `pe_live_${label}_${project.id}`
      : `pe_test_${label}_${project.id}`;
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

const seedPrizeEngineDrawProject = async (
  label: string,
  options?: {
    agentId?: string;
  },
) => {
  const seeded = await seedPrizeEngineProject(label, {
    scopes: DEFAULT_SCOPES,
  });

  await getDb()
    .update(saasProjects)
    .set({
      drawCost: "0.00",
      prizePoolBalance: "100.00",
      maxDrawCount: 1,
      missWeight: 0,
      updatedAt: new Date(),
    })
    .where(eq(saasProjects.id, seeded.project.id));

  await seedProjectPrize({
    projectId: seeded.project.id,
    name: `${label} Prize`,
    rewardAmount: "1.00",
    stock: 100,
    weight: 1,
  });

  const callDraw = (payload: Record<string, unknown>) =>
    getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seeded.apiKey}`,
        "content-type": "application/json",
        ...(options?.agentId ? { "x-agent-id": options.agentId } : {}),
      },
      payload: prizeEnginePayload(payload),
    });

  const callReward = (payload: Record<string, unknown>) =>
    getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/rewards"),
      headers: {
        authorization: `Bearer ${seeded.apiKey}`,
        "content-type": "application/json",
        ...(options?.agentId ? { "x-agent-id": options.agentId } : {}),
      },
      payload: prizeEnginePayload(payload),
    });

  return {
    ...seeded,
    callDraw,
    callReward,
  };
};

const seedAgentControl = async (params: {
  tenantId: number;
  agentId: string;
  mode: "blocked" | "throttled";
  reason: string;
  budgetMultiplier?: string | null;
}) => {
  const [control] = await getDb()
    .insert(agentBlocklist)
    .values({
      tenantId: params.tenantId,
      agentId: params.agentId,
      mode: params.mode,
      reason: params.reason,
      budgetMultiplier: params.budgetMultiplier ?? null,
    })
    .returning();

  return control;
};

const seedProjectPrize = async (params: {
  projectId: number;
  name: string;
  rewardAmount: string;
  stock?: number;
  weight?: number;
}) => {
  const [prize] = await getDb()
    .insert(saasProjectPrizes)
    .values({
      projectId: params.projectId,
      name: params.name,
      rewardAmount: params.rewardAmount,
      stock: params.stock ?? 1,
      weight: params.weight ?? 1,
      isActive: true,
    })
    .returning();

  return prize;
};

type DrawRiskAdjustmentSnapshot = {
  inputRisk: number;
  previousAccumulatedRisk: number;
  decayedAccumulatedRisk: number;
  effectiveRisk: number;
  weightDecayAlpha: number;
  riskStateHalfLifeSeconds: number;
  weightMultiplier: number;
  basePrizeWeightTotal: number;
  adjustedPrizeWeightTotal: number;
};

const readDrawRiskAdjustment = (response: { json: () => unknown }) => {
  const payload = response.json() as {
    data?: {
      result?: {
        fairness?: {
          risk?: DrawRiskAdjustmentSnapshot | null;
        } | null;
      } | null;
    } | null;
  };
  const risk = payload.data?.result?.fairness?.risk ?? null;
  expect(risk).toBeTruthy();
  return risk as DrawRiskAdjustmentSnapshot;
};

const seedRewardEnvelope = async (params: {
  tenantId: number;
  projectId?: number | null;
  window: "minute" | "hour" | "day";
  onCapHitStrategy: "reject" | "mute";
  budgetCap: string;
  expectedPayoutPerCall: string;
  varianceCap: string;
  currentConsumed?: string;
  currentCallCount?: number;
  currentWindowStartedAt?: Date;
}) => {
  const [envelope] = await getDb()
    .insert(saasRewardEnvelopes)
    .values({
      tenantId: params.tenantId,
      projectId: params.projectId ?? null,
      window: params.window,
      onCapHitStrategy: params.onCapHitStrategy,
      budgetCap: params.budgetCap,
      expectedPayoutPerCall: params.expectedPayoutPerCall,
      varianceCap: params.varianceCap,
      currentConsumed: params.currentConsumed ?? "0.0000",
      currentCallCount: params.currentCallCount ?? 0,
      currentWindowStartedAt: params.currentWindowStartedAt ?? new Date(),
    })
    .returning();

  return envelope;
};

const seedProjectPlayerLedger = async (params: {
  projectId: number;
  environment?: "sandbox" | "live";
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
      environment: params.environment ?? "sandbox",
      entryType: entry.entryType,
      amount: entry.amount,
      balanceBefore: entry.balanceBefore,
      balanceAfter: entry.balanceAfter,
      referenceType: "integration",
      metadata: {
        source: "cross-tenant-test",
      },
    })),
  );

  return player;
};

const seedProjectPlayer = async (params: {
  projectId: number;
  externalPlayerId: string;
  displayName: string;
}) => {
  const [player] = await getDb()
    .insert(saasPlayers)
    .values({
      projectId: params.projectId,
      externalPlayerId: params.externalPlayerId,
      displayName: params.displayName,
      balance: "0.00",
      pityStreak: 0,
    })
    .returning();

  return player;
};

const seedProjectDrawRecord = async (params: {
  projectId: number;
  playerId: number;
  environment?: "sandbox" | "live";
  agentId?: string | null;
  groupId?: string | null;
  prizeId?: number | null;
  drawCost?: string;
  rewardAmount: string;
  expectedRewardAmount?: string;
  status: "won" | "miss";
}) => {
  const [player] = await getDb()
    .select({
      externalPlayerId: saasPlayers.externalPlayerId,
    })
    .from(saasPlayers)
    .where(eq(saasPlayers.id, params.playerId))
    .limit(1);

  const [record] = await getDb()
    .insert(saasDrawRecords)
    .values({
      projectId: params.projectId,
      playerId: params.playerId,
      environment: params.environment ?? "sandbox",
      agentId:
        params.agentId ?? player?.externalPlayerId ?? `player-${params.playerId}`,
      groupId: params.groupId ?? null,
      prizeId: params.prizeId ?? null,
      drawCost: params.drawCost ?? "10.00",
      rewardAmount: params.rewardAmount,
      expectedRewardAmount: params.expectedRewardAmount ?? params.rewardAmount,
      status: params.status,
      metadata: {
        source: "observability-test",
      },
    })
    .returning();

  return record;
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
      "x-admin-totp-code": session.totpCode,
    },
  };
};

const grantTenantOwnerMembership = async (
  tenantId: number,
  adminId: number,
) => {
  await getDb()
    .insert(saasTenantMemberships)
    .values({
      tenantId,
      adminId,
      role: "tenant_owner",
      createdByAdminId: adminId,
    })
    .onConflictDoNothing();
};

describeIntegrationSuite("backend prize engine integration", () => {
  it("applies epsilon-greedy project strategy when creating prize-engine draws", async () => {
    const seededProject = await seedPrizeEngineProject("epsilon-draw", {
      scopes: DEFAULT_SCOPES,
    });

    await getDb()
      .update(saasProjects)
      .set({
        strategy: "epsilon_greedy",
        strategyParams: {
          epsilon: 0,
        },
      })
      .where(eq(saasProjects.id, seededProject.project.id));

    const [highMeanPrize, fallbackPrize] = await getDb()
      .insert(saasProjectPrizes)
      .values([
        {
          projectId: seededProject.project.id,
          name: "High mean prize",
          stock: 10,
          weight: 1,
          rewardAmount: "5.00",
          isActive: true,
        },
        {
          projectId: seededProject.project.id,
          name: "Fallback prize",
          stock: 10,
          weight: 1,
          rewardAmount: "20.00",
          isActive: true,
        },
      ])
      .returning();

    const historyPlayer = await seedProjectPlayer({
      projectId: seededProject.project.id,
      externalPlayerId: "history-player",
      displayName: "History Player",
    });

    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: historyPlayer.id,
      prizeId: highMeanPrize.id,
      rewardAmount: "50.00",
      status: "won",
    });
    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: historyPlayer.id,
      prizeId: highMeanPrize.id,
      rewardAmount: "50.00",
      status: "won",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
        "x-agent-id": "epsilon-agent",
      },
      payload: prizeEnginePayload({
        groupId: "strategy-alpha",
        agent: {
          fingerprint: "fp-epsilon",
          correlationGroup: "strategy-alpha",
          metadata: {
            owner: "lab",
          },
        },
        player: {
          playerId: "current-player",
          displayName: "Current Player",
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        agent: {
          agentId: "epsilon-agent",
          groupId: "strategy-alpha",
          fingerprint: "fp-epsilon",
          status: "active",
        },
        result: {
          prizeId: highMeanPrize.id,
          rewardAmount: "5.00",
          fairness: {
            strategy: "epsilon_greedy",
            epsilon: 0,
            decision: "exploit",
            selectedArmId: highMeanPrize.id,
            selectedArmKind: "prize",
            candidateCount: 2,
          },
        },
      },
    });

    const [record] = await getDb()
      .select()
      .from(saasDrawRecords)
      .where(eq(saasDrawRecords.projectId, seededProject.project.id))
      .orderBy(desc(saasDrawRecords.id))
      .limit(1);

    expect(record?.prizeId).toBe(highMeanPrize.id);
    expect(record?.groupId).toBe("strategy-alpha");
    expect(record?.metadata).toMatchObject({
      fairness: {
        strategy: "epsilon_greedy",
        decision: "exploit",
      },
    });
    const [trackedAgent] = await getDb()
      .select()
      .from(saasAgents)
      .where(
        and(
          eq(saasAgents.projectId, seededProject.project.id),
          eq(saasAgents.externalId, "epsilon-agent"),
        ),
      )
      .orderBy(desc(saasAgents.id))
      .limit(1);
    expect(trackedAgent).toMatchObject({
      externalId: "epsilon-agent",
      groupId: "strategy-alpha",
      fingerprint: "fp-epsilon",
      status: "active",
      ownerMetadata: {
        owner: "lab",
      },
    });
    expect(fallbackPrize.id).not.toBe(highMeanPrize.id);
  });

  it("mutes reward issuance when a project reward envelope budget cap is exceeded", async () => {
    const seededProject = await seedPrizeEngineProject("mute-budget", {
      scopes: DEFAULT_SCOPES,
    });
    const prize = await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Muted Prize",
      rewardAmount: "5.00",
      stock: 10,
      weight: 1,
    });

    await seedRewardEnvelope({
      tenantId: seededProject.tenant.id,
      projectId: seededProject.project.id,
      window: "minute",
      onCapHitStrategy: "mute",
      budgetCap: "3.0000",
      expectedPayoutPerCall: "5.0000",
      varianceCap: "999.0000",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "muted-player",
          displayName: "Muted Player",
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          rewardAmount: "0.00",
          status: "miss",
          envelope: {
            mode: "mute",
            triggered: [
              {
                scope: "project",
                window: "minute",
                reason: "budget_cap",
                strategy: "mute",
              },
            ],
          },
          prize: null,
        },
      },
    });

    const [prizeRow] = await getDb()
      .select()
      .from(saasProjectPrizes)
      .where(eq(saasProjectPrizes.id, prize.id))
      .limit(1);
    expect(prizeRow?.stock).toBe(prize.stock);

    const [drawRecord] = await getDb()
      .select()
      .from(saasDrawRecords)
      .where(eq(saasDrawRecords.projectId, seededProject.project.id))
      .orderBy(desc(saasDrawRecords.id))
      .limit(1);
    expect(drawRecord?.metadata).toMatchObject({
      envelope: {
        mode: "mute",
      },
    });
  });

  it("rejects reward issuance when a tenant reward envelope is configured to reject", async () => {
    const seededProject = await seedPrizeEngineProject("reject-budget", {
      scopes: DEFAULT_SCOPES,
    });
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Reject Prize",
      rewardAmount: "2.00",
      stock: 10,
      weight: 1,
    });

    await seedRewardEnvelope({
      tenantId: seededProject.tenant.id,
      window: "minute",
      onCapHitStrategy: "reject",
      budgetCap: "1.0000",
      expectedPayoutPerCall: "2.0000",
      varianceCap: "999.0000",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "reject-player",
        },
      }),
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: "REWARD_ENVELOPE_LIMIT_EXCEEDED",
      },
    });
  });

  it("mutes oversized payouts when the variance cap is breached after prize selection", async () => {
    const seededProject = await seedPrizeEngineProject("mute-variance", {
      scopes: DEFAULT_SCOPES,
    });
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Variance Prize",
      rewardAmount: "4.00",
      stock: 5,
      weight: 1,
    });

    await seedRewardEnvelope({
      tenantId: seededProject.tenant.id,
      projectId: seededProject.project.id,
      window: "minute",
      onCapHitStrategy: "mute",
      budgetCap: "999.0000",
      expectedPayoutPerCall: "0.5000",
      varianceCap: "0.2500",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "variance-player",
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          rewardAmount: "0.00",
          status: "miss",
          envelope: {
            mode: "mute",
            triggered: [
              {
                scope: "project",
                window: "minute",
                reason: "variance_cap",
                strategy: "mute",
              },
            ],
          },
        },
      },
    });
  });

  it("enqueues and signs outbound reward webhooks after a completed reward", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => "accepted",
    });
    vi.stubGlobal("fetch", fetchMock);

    const seededProject = await seedPrizeEngineProject("outbound-webhook", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        prizePoolBalance: "25.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Webhook Prize",
      rewardAmount: "5.00",
    });
    await getDb()
      .insert(saasOutboundWebhooks)
      .values({
        projectId: seededProject.project.id,
        url: "https://customer.example/webhooks/reward",
        secret: "whsec_reward_success",
        events: ["reward.completed"],
        isActive: true,
      });

    const rewardResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: {
        environment: "sandbox",
        player: {
          playerId: "outbound-player-1",
          displayName: "Outbound Player",
        },
      },
    });

    expect(rewardResponse.statusCode).toBe(200);

    const [queuedDelivery] = await getDb()
      .select()
      .from(saasOutboundWebhookDeliveries)
      .where(
        eq(saasOutboundWebhookDeliveries.projectId, seededProject.project.id),
      )
      .limit(1);

    expect(queuedDelivery?.status).toBe("pending");
    expect(queuedDelivery?.eventType).toBe("reward.completed");

    await runSaasOutboundWebhookDeliveryCycle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      {
        body: string;
        headers: Record<string, string>;
        method: string;
      },
    ];
    expect(url).toBe("https://customer.example/webhooks/reward");
    expect(init.method).toBe("POST");
    expect(init.headers["x-reward-webhook-event"]).toBe("reward.completed");
    expect(init.headers["x-reward-webhook-event-id"]).toBe(
      queuedDelivery?.eventId,
    );
    expect(init.headers["x-reward-webhook-delivery-id"]).toBe(
      String(queuedDelivery?.id),
    );

    const signatureHeader = init.headers["x-reward-webhook-signature"];
    const signatureMatch = /^t=(\d+),v1=([a-f0-9]+)$/.exec(signatureHeader);
    expect(signatureMatch).toBeTruthy();
    expect(signatureMatch?.[2]).toBe(
      createHmac("sha256", "whsec_reward_success")
        .update(`${signatureMatch?.[1]}.${init.body}`)
        .digest("hex"),
    );

    expect(JSON.parse(init.body)).toMatchObject({
      type: "reward.completed",
      project: {
        id: seededProject.project.id,
        tenantId: seededProject.tenant.id,
      },
      data: {
        result: {
          status: "won",
          rewardAmount: "5.00",
        },
      },
    });

    const [delivered] = await getDb()
      .select()
      .from(saasOutboundWebhookDeliveries)
      .where(eq(saasOutboundWebhookDeliveries.id, queuedDelivery!.id))
      .limit(1);

    expect(delivered).toMatchObject({
      status: "delivered",
      attempts: 1,
      lastHttpStatus: 202,
    });
  });

  it("retries outbound reward webhooks after transient delivery failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "temporary upstream failure",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    const seededProject = await seedPrizeEngineProject("outbound-retry", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        prizePoolBalance: "30.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Retry Prize",
      rewardAmount: "6.00",
    });
    await getDb()
      .insert(saasOutboundWebhooks)
      .values({
        projectId: seededProject.project.id,
        url: "https://customer.example/webhooks/retry",
        secret: "whsec_reward_retry",
        events: ["reward.completed"],
        isActive: true,
      });

    const rewardResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: {
        environment: "sandbox",
        player: {
          playerId: "outbound-player-2",
          displayName: "Retry Player",
        },
      },
    });

    expect(rewardResponse.statusCode).toBe(200);

    await runSaasOutboundWebhookDeliveryCycle();

    const [failedDelivery] = await getDb()
      .select()
      .from(saasOutboundWebhookDeliveries)
      .where(
        eq(saasOutboundWebhookDeliveries.projectId, seededProject.project.id),
      )
      .limit(1);

    expect(failedDelivery?.status).toBe("failed");
    expect(failedDelivery?.attempts).toBe(1);
    expect(failedDelivery?.lastHttpStatus).toBe(500);
    expect(failedDelivery?.lastError).toContain("status 500");

    await getDb()
      .update(saasOutboundWebhookDeliveries)
      .set({
        nextAttemptAt: new Date(Date.now() - 1_000),
      })
      .where(eq(saasOutboundWebhookDeliveries.id, failedDelivery!.id));

    await runSaasOutboundWebhookDeliveryCycle();

    const [deliveredDelivery] = await getDb()
      .select()
      .from(saasOutboundWebhookDeliveries)
      .where(eq(saasOutboundWebhookDeliveries.id, failedDelivery!.id))
      .limit(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deliveredDelivery).toMatchObject({
      status: "delivered",
      attempts: 2,
      lastHttpStatus: 204,
    });
  });

  it(
    "returns 404 when a project API key requests a player that only exists in another tenant",
    { tag: "critical" },
    async () => {
      const projectA = await seedPrizeEngineProject("alpha");
      const projectB = await seedPrizeEngineProject("bravo");

      await seedProjectPlayerLedger({
        projectId: projectB.project.id,
        externalPlayerId: "shared-player",
        displayName: "Tenant B Player",
        balance: "80.00",
        entries: [
          {
            entryType: "prize_reward",
            amount: "80.00",
            balanceBefore: "0.00",
            balanceAfter: "80.00",
          },
        ],
      });

      const response = await getApp().inject({
        method: "GET",
        url: prizeEngineUrl("/v1/engine/ledger?playerId=shared-player"),
        headers: {
          authorization: `Bearer ${projectA.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: "PROJECT_PLAYER_NOT_FOUND",
        },
      });
    },
  );

  it(
    "returns only the authenticated project ledger when external player ids collide across tenants",
    { tag: "critical" },
    async () => {
      const projectA = await seedPrizeEngineProject("alpha");
      const projectB = await seedPrizeEngineProject("bravo");

      await seedProjectPlayerLedger({
        projectId: projectA.project.id,
        externalPlayerId: "collision-player",
        displayName: "Tenant A Player",
        balance: "12.00",
        entries: [
          {
            entryType: "draw_cost",
            amount: "-3.00",
            balanceBefore: "15.00",
            balanceAfter: "12.00",
          },
          {
            entryType: "prize_reward",
            amount: "15.00",
            balanceBefore: "0.00",
            balanceAfter: "15.00",
          },
        ],
      });

      await seedProjectPlayerLedger({
        projectId: projectB.project.id,
        externalPlayerId: "collision-player",
        displayName: "Tenant B Player",
        balance: "200.00",
        entries: [
          {
            entryType: "prize_reward",
            amount: "200.00",
            balanceBefore: "0.00",
            balanceAfter: "200.00",
          },
        ],
      });

      const response = await getApp().inject({
        method: "GET",
        url: prizeEngineUrl(
          "/v1/engine/ledger?playerId=collision-player&limit=10",
        ),
        headers: {
          authorization: `Bearer ${projectA.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          agent: {
            projectId: projectA.project.id,
            agentId: "collision-player",
            status: "active",
          },
          player: {
            projectId: projectA.project.id,
            externalPlayerId: "collision-player",
            displayName: "Tenant A Player",
            balance: "12.00",
          },
          entries: [
            {
              entryType: "prize_reward",
              amount: "15.00",
              balanceAfter: "15.00",
            },
            {
              entryType: "draw_cost",
              amount: "-3.00",
              balanceAfter: "12.00",
            },
          ],
        },
      });

      const payload = response.json();
      expect(payload.data.entries).toHaveLength(2);
      expect(
        payload.data.entries.every(
          (entry: { amount: string }) => entry.amount !== "200.00",
        ),
      ).toBe(true);
      const [trackedAgent] = await getDb()
        .select()
        .from(saasAgents)
        .where(
          and(
            eq(saasAgents.projectId, projectA.project.id),
            eq(saasAgents.externalId, "collision-player"),
          ),
        )
        .orderBy(desc(saasAgents.id))
        .limit(1);
      expect(trackedAgent).toMatchObject({
        externalId: "collision-player",
        status: "active",
      });
    },
  );

  it("issues expiring API keys and audits the effective granted scopes", async () => {
    const { tenant, project } = await seedPrizeEngineTenantProject("issue");
    const admin = await seedConfigAdminSession("saas-issue-admin@example.com");
    await grantTenantOwnerMembership(tenant.id, admin.admin.id);

    const response = await getApp().inject({
      method: "POST",
      url: `/admin/saas/projects/${project.id}/keys`,
      headers: admin.headers,
      payload: {
        label: "Primary integration key",
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
      .where(eq(adminActions.action, "saas_api_key_issue"))
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
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
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
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
      },
    });
    expect(expiredResponse.statusCode).toBe(401);
  });

  it("returns project-scoped distribution observability with hit rate and payout drift", async () => {
    const scopedProject = await seedPrizeEngineProject("distribution", {
      scopes: DEFAULT_SCOPES,
    });
    const otherProject = await seedPrizeEngineProject("distribution-other", {
      scopes: DEFAULT_SCOPES,
    });

    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "10.00",
        missWeight: 2,
      })
      .where(eq(saasProjects.id, scopedProject.project.id));

    const bronzePrize = await seedProjectPrize({
      projectId: scopedProject.project.id,
      name: "Bronze",
      rewardAmount: "1.00",
      stock: 100,
      weight: 3,
    });
    await seedProjectPrize({
      projectId: scopedProject.project.id,
      name: "Gold",
      rewardAmount: "5.00",
      stock: 100,
      weight: 1,
    });

    const scopedPlayerA = await seedProjectPlayer({
      projectId: scopedProject.project.id,
      externalPlayerId: "dist-player-a",
      displayName: "Distribution Player A",
    });
    const scopedPlayerB = await seedProjectPlayer({
      projectId: scopedProject.project.id,
      externalPlayerId: "dist-player-b",
      displayName: "Distribution Player B",
    });

    await seedProjectDrawRecord({
      projectId: scopedProject.project.id,
      playerId: scopedPlayerA.id,
      prizeId: bronzePrize.id,
      rewardAmount: "1.00",
      status: "won",
    });
    await seedProjectDrawRecord({
      projectId: scopedProject.project.id,
      playerId: scopedPlayerB.id,
      prizeId: bronzePrize.id,
      rewardAmount: "1.00",
      status: "won",
    });
    await seedProjectDrawRecord({
      projectId: scopedProject.project.id,
      playerId: scopedPlayerA.id,
      rewardAmount: "0.00",
      status: "miss",
    });

    const otherPlayer = await seedProjectPlayer({
      projectId: otherProject.project.id,
      externalPlayerId: "other-player",
      displayName: "Other Tenant Player",
    });
    await seedProjectDrawRecord({
      projectId: otherProject.project.id,
      playerId: otherPlayer.id,
      rewardAmount: "99.00",
      status: "won",
    });

    const response = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/observability/distribution?days=30"),
      headers: {
        authorization: `Bearer ${scopedProject.apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        project: {
          id: scopedProject.project.id,
          tenantId: scopedProject.tenant.id,
        },
        window: {
          days: 30,
          baseline: "current_catalog",
        },
        summary: {
          totalDrawCount: 3,
          uniquePlayerCount: 2,
          winCount: 2,
          missCount: 1,
          hitRate: 0.666667,
          expectedHitRate: 0.666667,
          hitRateDrift: 0,
          actualDrawCostAmount: "30.00",
          actualRewardAmount: "2.00",
          expectedRewardAmount: "4.00",
          actualPayoutRate: 0.066667,
          expectedPayoutRate: 0.133334,
          payoutRateDrift: -0.066667,
        },
      },
    });

    const payload = response.json().data as {
      distribution: Array<{
        bucketKey: string;
        actualDrawCount: number;
        actualProbability: number;
        expectedProbability: number;
      }>;
    };

    expect(payload.distribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucketKey: `prize:${bronzePrize.id}`,
          actualDrawCount: 2,
          actualProbability: 0.666667,
          expectedProbability: 0.5,
        }),
        expect.objectContaining({
          bucketKey: "miss",
          actualDrawCount: 1,
          actualProbability: 0.333333,
          expectedProbability: 0.333333,
        }),
      ]),
    );
  });

  it("includes only accessible project observability in saas overview", async () => {
    const scopedProject = await seedPrizeEngineProject(
      "overview-observability",
      {
        scopes: DEFAULT_SCOPES,
      },
    );
    const hiddenProject = await seedPrizeEngineProject("overview-hidden", {
      scopes: DEFAULT_SCOPES,
    });
    const admin = await seedConfigAdminSession(
      "saas-observability-admin@example.com",
    );
    await grantTenantOwnerMembership(scopedProject.tenant.id, admin.admin.id);

    const scopedPlayer = await seedProjectPlayer({
      projectId: scopedProject.project.id,
      externalPlayerId: "overview-player",
      displayName: "Overview Player",
    });
    await seedProjectDrawRecord({
      projectId: scopedProject.project.id,
      playerId: scopedPlayer.id,
      rewardAmount: "0.00",
      status: "miss",
    });

    const hiddenPlayer = await seedProjectPlayer({
      projectId: hiddenProject.project.id,
      externalPlayerId: "hidden-player",
      displayName: "Hidden Player",
    });
    await seedProjectDrawRecord({
      projectId: hiddenProject.project.id,
      playerId: hiddenPlayer.id,
      rewardAmount: "50.00",
      status: "won",
    });

    const response = await getApp().inject({
      method: "GET",
      url: "/admin/saas/overview",
      headers: admin.headers,
    });

    expect(response.statusCode).toBe(200);
    const overview = response.json().data as {
      projects: Array<{ id: number }>;
      projectObservability: Array<{
        project: { id: number; tenantId: number };
        summary: { totalDrawCount: number; missCount: number };
      }>;
    };

    expect(overview.projects.map((project) => project.id)).toContain(
      scopedProject.project.id,
    );
    expect(overview.projects.map((project) => project.id)).not.toContain(
      hiddenProject.project.id,
    );
    expect(overview.projectObservability).toHaveLength(1);
    expect(overview.projectObservability[0]).toMatchObject({
      project: expect.objectContaining({
        id: scopedProject.project.id,
        tenantId: scopedProject.tenant.id,
      }),
      summary: expect.objectContaining({
        totalDrawCount: 1,
        missCount: 1,
      }),
    });
  });

  it("rotates API keys with explicit overlap and predecessor/successor linkage", async () => {
    const seededProject = await seedPrizeEngineProject("rotate", {
      scopes: DEFAULT_SCOPES,
    });
    const admin = await seedConfigAdminSession("saas-rotate-admin@example.com");
    await grantTenantOwnerMembership(seededProject.tenant.id, admin.admin.id);

    const [existingKey] = await getDb()
      .select()
      .from(saasApiKeys)
      .where(eq(saasApiKeys.keyHash, hashApiKey(seededProject.apiKey)))
      .limit(1);

    expect(existingKey).toBeTruthy();

    const rotateResponse = await getApp().inject({
      method: "POST",
      url: `/admin/saas/projects/${seededProject.project.id}/keys/${existingKey!.id}/rotate`,
      headers: admin.headers,
      payload: {
        overlapSeconds: 60,
        reason: "integration-rotation",
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

    expect(rotation.reason).toBe("integration-rotation");
    expect(rotation.previousKey.rotatedToApiKeyId).toBe(rotation.issuedKey.id);
    expect(rotation.issuedKey.rotatedFromApiKeyId).toBe(
      rotation.previousKey.id,
    );
    expect(new Date(rotation.overlapEndsAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const oldKeyBeforeExpiry = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
    });
    expect(oldKeyBeforeExpiry.statusCode).toBe(200);

    const newKeyBeforeExpiry = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
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
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
    });
    expect(oldKeyAfterExpiry.statusCode).toBe(401);

    const newKeyAfterExpiry = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
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

  it("publishes tenant risk-envelope change requests and clamps looser draw caps", async () => {
    const seededProject = await seedPrizeEngineProject("risk-envelope", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb().insert(saasProjectPrizes).values({
      projectId: seededProject.project.id,
      name: "High reward payout",
      stock: 10,
      weight: 1,
      rewardAmount: "10.00",
      isActive: true,
    });

    const creator = await seedConfigAdminSession(
      "saas-risk-envelope-creator@example.com",
    );
    await grantTenantOwnerMembership(seededProject.tenant.id, creator.admin.id);
    const approver = await seedConfigAdminSession(
      "saas-risk-envelope-approver@example.com",
    );

    const createDraftResponse = await getApp().inject({
      method: "POST",
      url: `/admin/saas/tenants/${seededProject.tenant.id}/risk-envelope/drafts`,
      headers: creator.headers,
      payload: {
        maxSinglePayout: "5.00",
        reason: "cap partner payouts",
      },
    });

    expect(createDraftResponse.statusCode).toBe(201);
    const createdDraft = createDraftResponse.json().data as {
      id: number;
      changeType: string;
      targetId: number | null;
    };
    expect(createdDraft.changeType).toBe("saas_tenant_risk_envelope_upsert");
    expect(createdDraft.targetId).toBe(seededProject.tenant.id);

    const submitResponse = await getApp().inject({
      method: "POST",
      url: `/admin/control-center/change-requests/${createdDraft.id}/submit`,
      headers: creator.headers,
      payload: {
        confirmationText: `SUBMIT ${createdDraft.id}`,
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const approveResponse = await getApp().inject({
      method: "POST",
      url: `/admin/control-center/change-requests/${createdDraft.id}/approve`,
      headers: approver.headers,
      payload: {},
    });
    expect(approveResponse.statusCode).toBe(200);

    const publishResponse = await getApp().inject({
      method: "POST",
      url: `/admin/control-center/change-requests/${createdDraft.id}/publish`,
      headers: approver.headers,
      payload: {
        confirmationText: `PUBLISH ${createdDraft.id}`,
      },
    });
    expect(publishResponse.statusCode).toBe(200);

    const [tenant] = await getDb()
      .select()
      .from(saasTenants)
      .where(eq(saasTenants.id, seededProject.tenant.id))
      .limit(1);
    expect(tenant?.riskEnvelopeMaxSinglePayout?.toString()).toBe("5.00");
    expect(tenant?.riskEnvelopeEmergencyStop).toBe(false);

    const drawResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "risk-envelope-player",
        },
        riskEnvelope: {
          maxSinglePayout: "500.00",
        },
      }),
    });

    expect(drawResponse.statusCode).toBe(200);
    expect(drawResponse.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          status: "miss",
          rewardAmount: "0.00",
        },
      },
    });
  });

  it("enforces tenant daily reward budgets across sequential draws", async () => {
    const seededProject = await seedPrizeEngineProject("daily-budget", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasTenants)
      .set({
        riskEnvelopeDailyBudgetCap: "5.00",
      })
      .where(eq(saasTenants.id, seededProject.tenant.id));
    await getDb().insert(saasProjectPrizes).values({
      projectId: seededProject.project.id,
      name: "Guaranteed four",
      stock: 10,
      weight: 1,
      rewardAmount: "4.00",
      isActive: true,
    });

    const drawOnce = () =>
      getApp().inject({
        method: "POST",
        url: prizeEngineUrl("/v1/engine/draws"),
        headers: {
          authorization: `Bearer ${seededProject.apiKey}`,
        },
        payload: prizeEnginePayload({
          player: {
            playerId: "daily-budget-player",
          },
        }),
      });

    const firstDrawResponse = await drawOnce();
    expect(firstDrawResponse.statusCode).toBe(200);
    expect(firstDrawResponse.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          status: "won",
          rewardAmount: "4.00",
        },
      },
    });

    const secondDrawResponse = await drawOnce();
    expect(secondDrawResponse.statusCode).toBe(200);
    expect(secondDrawResponse.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          status: "miss",
          rewardAmount: "0.00",
        },
      },
    });

    const drawRecords = await getDb()
      .select()
      .from(saasDrawRecords)
      .where(eq(saasDrawRecords.projectId, seededProject.project.id))
      .orderBy(desc(saasDrawRecords.id));
    expect(drawRecords).toHaveLength(2);
    expect(drawRecords[0]?.rewardAmount?.toString()).toBe("0.00");
    expect(drawRecords[1]?.rewardAmount?.toString()).toBe("4.00");
  });

  it("mutes grouped draws once the group-level anti-exploit window is exhausted", async () => {
    const seededProject = await seedPrizeEngineProject("group-window", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "0.00",
        prizePoolBalance: "100.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    const priorPlayerA = await seedProjectPlayer({
      projectId: seededProject.project.id,
      externalPlayerId: "group-player-a",
      displayName: "Group Player A",
    });
    const priorPlayerB = await seedProjectPlayer({
      projectId: seededProject.project.id,
      externalPlayerId: "group-player-b",
      displayName: "Group Player B",
    });
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Grouped Prize",
      rewardAmount: "5.00",
      stock: 10,
      weight: 1,
    });
    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: priorPlayerA.id,
      groupId: "shard-group",
      rewardAmount: "5.00",
      status: "won",
    });
    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: priorPlayerB.id,
      groupId: "shard-group",
      rewardAmount: "5.00",
      status: "won",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: {
        environment: "sandbox",
        group_id: "shard-group",
        riskEnvelope: {
          group: {
            maxDrawCount: 2,
          },
        },
        player: {
          playerId: "group-player-c",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          status: "miss",
          rewardAmount: "0.00",
          envelope: {
            mode: "mute",
            triggered: [
              {
                scope: "group",
                reason: "anti_exploit",
              },
            ],
          },
        },
      },
    });
  });

  it("mutes draws on agent-level variance caps after the group pass", async () => {
    const seededProject = await seedPrizeEngineProject("agent-variance", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "0.00",
        prizePoolBalance: "100.00",
        metadata: {
          prizeEngineConstraints: {
            evaluationWindowSeconds: 3600,
            agent: {
              maxPositiveVariance: "1.00",
            },
          },
        },
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    const priorPlayer = await seedProjectPlayer({
      projectId: seededProject.project.id,
      externalPlayerId: "variance-player",
      displayName: "Variance Player",
    });
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Variance Prize",
      rewardAmount: "5.00",
      stock: 10,
      weight: 1,
    });
    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: priorPlayer.id,
      rewardAmount: "5.00",
      expectedRewardAmount: "0.0000",
      status: "won",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: {
        environment: "sandbox",
        player: {
          playerId: "variance-player",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        result: {
          status: "miss",
          rewardAmount: "0.00",
          envelope: {
            triggered: [
              {
                scope: "agent",
                reason: "variance_cap",
              },
            ],
          },
        },
      },
    });
  });

  it("records agent-group correlation snapshots for grouped calls", async () => {
    const seededProject = await seedPrizeEngineProject("group-correlation", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "0.00",
        prizePoolBalance: "100.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    const priorPlayer = await seedProjectPlayer({
      projectId: seededProject.project.id,
      externalPlayerId: "correlation-player-a",
      displayName: "Correlation Player A",
    });
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Correlation Prize",
      rewardAmount: "4.00",
      stock: 10,
      weight: 1,
    });
    await seedProjectDrawRecord({
      projectId: seededProject.project.id,
      playerId: priorPlayer.id,
      groupId: "corr-group",
      rewardAmount: "4.00",
      expectedRewardAmount: "4.0000",
      status: "won",
    });

    const response = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: {
        environment: "sandbox",
        groupId: "corr-group",
        player: {
          playerId: "correlation-player-b",
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const [snapshot] = await getDb()
      .select()
      .from(saasAgentGroupCorrelations)
      .orderBy(desc(saasAgentGroupCorrelations.id))
      .limit(1);

    expect(snapshot).toBeTruthy();
    expect(snapshot?.groupId).toBe("corr-group");
    expect(snapshot?.agentId).toBe("correlation-player-b");
    expect(snapshot?.groupDrawCountWindow).toBe(2);
    expect(snapshot?.groupDistinctPlayerCountWindow).toBe(2);
    expect(snapshot?.agentDrawCountWindow).toBe(1);
    expect(snapshot?.groupRewardAmountWindow?.toString()).toBe("8.0000");
    expect(snapshot?.groupExpectedRewardAmountWindow?.toString()).toBe(
      "8.0000",
    );
    expect(snapshot?.agentRewardAmountWindow?.toString()).toBe("4.0000");
  });

  it("keeps project-level overview available when tenant agent controls exist", async () => {
    const seededProject = await seedPrizeEngineProject("agent-header", {
      scopes: DEFAULT_SCOPES,
    });
    await seedAgentControl({
      tenantId: seededProject.tenant.id,
      agentId: "rogue-agent",
      mode: "blocked",
      reason: "integration-blocked-agent",
    });

    const response = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("blocks only the configured agent within the tenant on legacy draw requests", async () => {
    const seededProject = await seedPrizeEngineProject("agent-blocked", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "0.00",
        prizePoolBalance: "100.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Blocked Prize",
      rewardAmount: "10.00",
      stock: 5,
      weight: 1,
    });
    await seedAgentControl({
      tenantId: seededProject.tenant.id,
      agentId: "blocked-agent",
      mode: "blocked",
      reason: "integration-agent-safety-stop",
    });

    const blockedResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "blocked-agent",
        },
      }),
    });
    expect(blockedResponse.statusCode).toBe(403);
    expect(blockedResponse.json()).toMatchObject({
      ok: false,
      error: {
        code: "AGENT_REQUEST_BLOCKED",
      },
    });

    const healthyResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "healthy-agent",
        },
      }),
    });
    expect(healthyResponse.statusCode).toBe(200);
  });

  it("throttles reward budget for only the configured agent instead of blocking the tenant", async () => {
    const seededProject = await seedPrizeEngineProject("agent-throttled", {
      scopes: DEFAULT_SCOPES,
    });
    await getDb()
      .update(saasProjects)
      .set({
        drawCost: "0.00",
        prizePoolBalance: "100.00",
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await seedProjectPrize({
      projectId: seededProject.project.id,
      name: "Throttle Prize",
      rewardAmount: "40.00",
      stock: 5,
      weight: 1,
    });
    await seedAgentControl({
      tenantId: seededProject.tenant.id,
      agentId: "throttled-agent",
      mode: "throttled",
      reason: "integration-gray-release",
      budgetMultiplier: "0.2500",
    });

    const throttledResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "throttled-agent",
        },
      }),
    });
    expect(throttledResponse.statusCode).toBe(200);
    expect(throttledResponse.json().data.result).toMatchObject({
      rewardAmount: "10.00",
      prize: {
        rewardAmount: "10.00",
      },
    });

    const healthyResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/draws"),
      headers: {
        authorization: `Bearer ${seededProject.apiKey}`,
      },
      payload: prizeEnginePayload({
        player: {
          playerId: "healthy-agent",
        },
      }),
    });
    expect(healthyResponse.statusCode).toBe(200);
    expect(healthyResponse.json().data.result).toMatchObject({
      rewardAmount: "40.00",
      prize: {
        rewardAmount: "40.00",
      },
    });
  });

  it("allows tenant-scoped agent controls without an admin step-up code", async () => {
    const seededProject = await seedPrizeEngineProject("agent-control-admin", {
      scopes: DEFAULT_SCOPES,
    });
    const admin = await seedConfigAdminSession(
      "saas-agent-control-admin@example.com",
    );
    await grantTenantOwnerMembership(seededProject.tenant.id, admin.admin.id);

    const createResponse = await getApp().inject({
      method: "POST",
      url: `/admin/saas/tenants/${seededProject.tenant.id}/agent-controls`,
      headers: buildAdminCookieHeaders(admin.session.token),
      payload: {
        agentId: "ui-qa-agent",
        mode: "blocked",
        reason: "manual ui qa blocked",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdControl = createResponse.json().data as { id: number };
    expect(createdControl.id).toBeGreaterThan(0);

    const deleteResponse = await getApp().inject({
      method: "DELETE",
      url: `/admin/saas/tenants/${seededProject.tenant.id}/agent-controls/${createdControl.id}`,
      headers: buildAdminCookieHeaders(admin.session.token),
    });

    expect(deleteResponse.statusCode).toBe(200);
  });

  it("shrinks candidate weights for risky draws and compounds repeated risk", async () => {
    const seededProject = await seedPrizeEngineDrawProject(
      "reward-risk-tighten",
      {
        agentId: "risk-weight-agent",
      },
    );

    await getDb()
      .update(saasProjects)
      .set({
        missWeight: 1,
        strategyParams: {
          riskWeightDecayAlpha: 2,
          riskStateHalfLifeSeconds: 3600,
        },
        updatedAt: new Date(),
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await getDb()
      .update(saasProjectPrizes)
      .set({
        weight: 100,
        updatedAt: new Date(),
      })
      .where(eq(saasProjectPrizes.projectId, seededProject.project.id));

    const firstResponse = await seededProject.callDraw({
      player: {
        playerId: "risk-player",
      },
      risk: 0.5,
      clientNonce: "risk-tighten-1",
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstRisk = readDrawRiskAdjustment(firstResponse);

    expect(firstRisk.inputRisk).toBe(0.5);
    expect(firstRisk.previousAccumulatedRisk).toBe(0);
    expect(firstRisk.decayedAccumulatedRisk).toBe(0);
    expect(firstRisk.effectiveRisk).toBeGreaterThan(0.49);
    expect(firstRisk.weightDecayAlpha).toBe(2);
    expect(firstRisk.riskStateHalfLifeSeconds).toBe(3600);
    expect(firstRisk.adjustedPrizeWeightTotal).toBeLessThan(
      firstRisk.basePrizeWeightTotal,
    );

    const secondResponse = await seededProject.callDraw({
      player: {
        playerId: "risk-player",
      },
      risk: 0.5,
      clientNonce: "risk-tighten-2",
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondRisk = readDrawRiskAdjustment(secondResponse);

    expect(secondRisk.previousAccumulatedRisk).toBeGreaterThan(0.49);
    expect(secondRisk.effectiveRisk).toBeGreaterThan(firstRisk.effectiveRisk);
    expect(secondRisk.adjustedPrizeWeightTotal).toBeLessThan(
      firstRisk.adjustedPrizeWeightTotal,
    );

    const [riskState] = await getDb()
      .select()
      .from(agentRiskState)
      .where(
        and(
          eq(agentRiskState.projectId, seededProject.project.id),
          eq(agentRiskState.agentId, "risk-weight-agent"),
        ),
      )
      .orderBy(desc(agentRiskState.id))
      .limit(1);

    expect(riskState?.lastPlugin).toBe("reward_risk_score");
    expect(riskState?.riskScore).toBeGreaterThan(0);
    expect(riskState?.hitCount).toBe(2);
  });

  it("time-decays stored reward risk before the next selection", async () => {
    const seededProject = await seedPrizeEngineDrawProject(
      "reward-risk-decay",
      {
        agentId: "risk-decay-agent",
      },
    );

    await getDb()
      .update(saasProjects)
      .set({
        missWeight: 1,
        strategyParams: {
          riskWeightDecayAlpha: 2,
          riskStateHalfLifeSeconds: 3600,
        },
        updatedAt: new Date(),
      })
      .where(eq(saasProjects.id, seededProject.project.id));
    await getDb()
      .update(saasProjectPrizes)
      .set({
        weight: 100,
        updatedAt: new Date(),
      })
      .where(eq(saasProjectPrizes.projectId, seededProject.project.id));

    const firstResponse = await seededProject.callDraw({
      player: {
        playerId: "risk-decay-player",
      },
      risk: 0.9,
      clientNonce: "risk-decay-1",
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstRisk = readDrawRiskAdjustment(firstResponse);

    const [storedRiskState] = await getDb()
      .select()
      .from(agentRiskState)
      .where(
        and(
          eq(agentRiskState.projectId, seededProject.project.id),
          eq(agentRiskState.agentId, "risk-decay-agent"),
        ),
      )
      .orderBy(desc(agentRiskState.id))
      .limit(1);

    expect(storedRiskState).toBeTruthy();

    await getDb()
      .update(agentRiskState)
      .set({
        updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      })
      .where(eq(agentRiskState.id, storedRiskState!.id));

    const secondResponse = await seededProject.callDraw({
      player: {
        playerId: "risk-decay-player",
      },
      risk: 0,
      clientNonce: "risk-decay-2",
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondRisk = readDrawRiskAdjustment(secondResponse);

    expect(secondRisk.inputRisk).toBe(0);
    expect(secondRisk.weightDecayAlpha).toBe(2);
    expect(secondRisk.riskStateHalfLifeSeconds).toBe(3600);
    expect(secondRisk.decayedAccumulatedRisk).toBeLessThan(
      firstRisk.effectiveRisk,
    );
    expect(secondRisk.effectiveRisk).toBeLessThan(firstRisk.effectiveRisk);
    expect(secondRisk.adjustedPrizeWeightTotal).toBeGreaterThan(
      firstRisk.adjustedPrizeWeightTotal,
    );
  });

  it("requires an explicit environment and rejects environment mismatches", async () => {
    const liveProject = await seedPrizeEngineProject("live-environment", {
      scopes: DEFAULT_SCOPES,
      environment: "live",
    });

    const missingEnvironmentResponse = await getApp().inject({
      method: "GET",
      url: "/v1/engine/overview",
      headers: {
        authorization: `Bearer ${liveProject.apiKey}`,
      },
    });
    expect(missingEnvironmentResponse.statusCode).toBe(400);

    const mismatchResponse = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview", "sandbox"),
      headers: {
        authorization: `Bearer ${liveProject.apiKey}`,
      },
    });
    expect(mismatchResponse.statusCode).toBe(400);
    expect(mismatchResponse.json()).toMatchObject({
      ok: false,
      error: {
        code: "PRIZE_ENGINE_ENVIRONMENT_MISMATCH",
      },
    });

    const liveResponse = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview", "live"),
      headers: {
        authorization: `Bearer ${liveProject.apiKey}`,
      },
    });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.headers["x-prize-engine-environment"]).toBe("live");
    expect(liveResponse.headers["x-prize-engine-sandbox"]).toBeUndefined();
  });

  it("adds prominent sandbox isolation headers to sandbox responses", async () => {
    const sandboxProject = await seedPrizeEngineProject("sandbox-headers", {
      scopes: DEFAULT_SCOPES,
    });

    const response = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: `Bearer ${sandboxProject.apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-prize-engine-environment"]).toBe("sandbox");
    expect(response.headers["x-prize-engine-sandbox"]).toBe("true");
    expect(response.headers["x-prize-engine-warning"]).toContain("SANDBOX");
    expect(response.headers.warning).toContain("Sandbox environment");
  });

  it("records failed API key authentication attempts with request context", async () => {
    const missingResponse = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        "user-agent": "integration-missing-agent",
      },
    });
    expect(missingResponse.statusCode).toBe(401);

    const invalidResponse = await getApp().inject({
      method: "GET",
      url: prizeEngineUrl("/v1/engine/overview"),
      headers: {
        authorization: "Bearer pe_test_invalid_secret",
        "user-agent": "integration-invalid-agent",
      },
    });
    expect(invalidResponse.statusCode).toBe(401);

    const [failedEvent] = await getDb()
      .select()
      .from(authEvents)
      .where(eq(authEvents.eventType, "saas_api_key_auth_failed"))
      .orderBy(desc(authEvents.id))
      .limit(1);
    const [missingEvent] = await getDb()
      .select()
      .from(authEvents)
      .where(eq(authEvents.eventType, "saas_api_key_auth_missing"))
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(failedEvent?.userAgent).toBe("integration-invalid-agent");
    expect(failedEvent?.metadata).toMatchObject({
      reason: "authentication_rejected",
      method: "GET",
      route: "/v1/engine/overview",
      apiKeyHint: "pe_test_invalid",
    });

    expect(missingEvent?.userAgent).toBe("integration-missing-agent");
    expect(missingEvent?.metadata).toMatchObject({
      reason: "missing_api_key",
      method: "GET",
      route: "/v1/engine/overview",
      apiKeyHint: null,
    });
  });

  it("accepts reward-first requests and replays idempotent responses", async () => {
    const seededProject = await seedPrizeEngineDrawProject("reward-route", {
      agentId: "reward-agent",
    });

    const payload = {
      agent: {
        agentId: "reward-agent",
        groupId: "reward-cohort",
        metadata: {
          segment: "gold",
        },
      },
      behavior: {
        actionType: "checkout.completed",
        score: 0.82,
        novelty: 0.14,
        risk: 0.08,
        context: {
          region: "apac",
        },
      },
      idempotencyKey: "reward-route-idem-1",
      clientNonce: "reward-route-nonce-1",
    };

    const firstResponse = await seededProject.callReward(payload);
    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      ok: true,
      data: {
        idempotencyKey: "reward-route-idem-1",
        replayed: false,
        agent: {
          agentId: "reward-agent",
          groupId: "reward-cohort",
        },
        behavior: {
          actionType: "checkout.completed",
        },
        player: {
          externalPlayerId: "reward-agent",
        },
        result: {
          selectionStrategy: "weighted_gacha",
        },
      },
    });

    const firstResultId = firstResponse.json().data.result.id as number;
    const replayResponse = await seededProject.callReward(payload);
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json()).toMatchObject({
      ok: true,
      data: {
        idempotencyKey: "reward-route-idem-1",
        replayed: true,
        result: {
          id: firstResultId,
        },
      },
    });
  });

  it("marks legacy draws as deprecated and points callers to rewards", async () => {
    const seededProject = await seedPrizeEngineDrawProject(
      "legacy-draw-deprecation",
      {
        agentId: "legacy-agent",
      },
    );

    const response = await seededProject.callDraw({
      player: {
        playerId: "legacy-player",
      },
      clientNonce: "legacy-route-nonce-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["deprecation"]).toBe("true");
    expect(response.headers["sunset"]).toBe("Tue, 28 Oct 2026 00:00:00 GMT");
    expect(response.headers["link"]).toContain("</v1/engine/rewards>");
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        legacy: {
          route: "/v1/engine/draws",
          mode: "legacy_gacha",
          deprecated: true,
        },
      },
    });
  });

  it("blocks duplicate idempotency keys and records anti-exploit state", async () => {
    const seededProject = await seedPrizeEngineDrawProject(
      "anti-exploit-idem",
      {
        agentId: "agent-idem",
      },
    );

    const firstResponse = await seededProject.callDraw({
      player: {
        playerId: "idem-player",
      },
      idempotencyKey: "idem-key-1",
      clientNonce: "idem-nonce-1",
    });
    expect(firstResponse.statusCode).toBe(200);

    const duplicateResponse = await seededProject.callDraw({
      player: {
        playerId: "idem-player",
      },
      idempotencyKey: "idem-key-1",
      clientNonce: "idem-nonce-1",
    });
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({
      ok: false,
      error: {
        code: "AGENT_DUPLICATE_REQUEST",
      },
    });

    const [riskState] = await getDb()
      .select()
      .from(agentRiskState)
      .where(eq(agentRiskState.agentId, "agent-idem"))
      .limit(1);
    const [auditEvent] = await getDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.agentId, "agent-idem"))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    const [blocklistEntry] = await getDb()
      .select()
      .from(agentBlocklist)
      .where(eq(agentBlocklist.agentId, "agent-idem"))
      .limit(1);

    expect(riskState?.lastPlugin).toBe("idempotency_check");
    expect(riskState?.riskScore).toBeGreaterThan(0);
    expect(auditEvent?.eventType).toBe("anti_exploit_hit");
    expect(blocklistEntry).toBeUndefined();
  });

  it("blocks request signature replays and escalates the agent into blocklist", async () => {
    const seededProject = await seedPrizeEngineDrawProject(
      "anti-exploit-signature",
      {
        agentId: "agent-signature",
      },
    );

    const firstResponse = await seededProject.callDraw({
      player: {
        playerId: "signature-player-a",
      },
      idempotencyKey: "signature-idem-a",
      clientNonce: "signature-nonce-a",
      agent: {
        requestSignature: "signature-replay-token",
        fingerprint: "signature-fingerprint-a",
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    const replayResponse = await seededProject.callDraw({
      player: {
        playerId: "signature-player-b",
      },
      idempotencyKey: "signature-idem-b",
      clientNonce: "signature-nonce-b",
      agent: {
        requestSignature: "signature-replay-token",
        fingerprint: "signature-fingerprint-b",
      },
    });
    expect(replayResponse.statusCode).toBe(403);
    expect(replayResponse.json()).toMatchObject({
      ok: false,
      error: {
        code: "AGENT_REQUEST_BLOCKED",
      },
    });

    const [blocklistEntry] = await getDb()
      .select()
      .from(agentBlocklist)
      .where(eq(agentBlocklist.agentId, "agent-signature"))
      .limit(1);
    const [blockAudit] = await getDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "agent_blocklist_applied"))
      .orderBy(desc(auditEvents.id))
      .limit(1);

    expect(blocklistEntry?.mode).toBe("blocked");
    expect(blockAudit?.agentId).toBe("agent-signature");

    const blockedAfterReplay = await seededProject.callDraw({
      player: {
        playerId: "signature-player-c",
      },
      idempotencyKey: "signature-idem-c",
      clientNonce: "signature-nonce-c",
      agent: {
        requestSignature: "signature-fresh-token",
        fingerprint: "signature-fingerprint-c",
      },
    });
    expect(blockedAfterReplay.statusCode).toBe(403);
  });

  it("detects shared fingerprint sybil patterns and behavior/group spikes", async () => {
    const fingerprintProject = await seedPrizeEngineDrawProject(
      "anti-exploit-fingerprint",
      {
        agentId: "agent-fingerprint",
      },
    );

    expect(
      (
        await fingerprintProject.callDraw({
          player: { playerId: "fingerprint-player-a" },
          idempotencyKey: "fingerprint-idem-a",
          clientNonce: "fingerprint-nonce-a",
          agent: {
            fingerprint: "shared-device-fingerprint",
          },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await fingerprintProject.callDraw({
          player: { playerId: "fingerprint-player-b" },
          idempotencyKey: "fingerprint-idem-b",
          clientNonce: "fingerprint-nonce-b",
          agent: {
            fingerprint: "shared-device-fingerprint",
          },
        })
      ).statusCode,
    ).toBe(200);

    const fingerprintBlock = await fingerprintProject.callDraw({
      player: { playerId: "fingerprint-player-c" },
      idempotencyKey: "fingerprint-idem-c",
      clientNonce: "fingerprint-nonce-c",
      agent: {
        fingerprint: "shared-device-fingerprint",
      },
    });
    expect(fingerprintBlock.statusCode).toBe(403);

    const behaviorProject = await seedPrizeEngineDrawProject(
      "anti-exploit-group",
      {
        agentId: "agent-group",
      },
    );

    for (const suffix of ["a", "b", "c"]) {
      const response = await behaviorProject.callDraw({
        player: { playerId: `group-player-${suffix}` },
        idempotencyKey: `group-idem-${suffix}`,
        clientNonce: `group-nonce-${suffix}`,
        groupId: "group-cluster-1",
        rewardContext: {
          agent: {
            agentId: "agent-group",
            groupId: "group-cluster-1",
            fingerprint: `group-fingerprint-${suffix}`,
          },
          behavior: {
            actionType: "draw",
            score: 0.92,
            novelty: 0.01,
            risk: 0.87,
            context: {
              template: "cluster-template",
            },
            signals: {
              family: "cluster-template",
            },
          },
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const behaviorSpike = await behaviorProject.callDraw({
      player: { playerId: "group-player-d" },
      idempotencyKey: "group-idem-d",
      clientNonce: "group-nonce-d",
      groupId: "group-cluster-1",
      rewardContext: {
        agent: {
          agentId: "agent-group",
          groupId: "group-cluster-1",
          fingerprint: "group-fingerprint-d",
        },
        behavior: {
          actionType: "draw",
          score: 0.92,
          novelty: 0.01,
          risk: 0.87,
          context: {
            template: "cluster-template",
          },
          signals: {
            family: "cluster-template",
          },
        },
      },
    });
    expect(behaviorSpike.statusCode).toBe(403);

    const [latestRiskState] = await getDb()
      .select()
      .from(agentRiskState)
      .where(eq(agentRiskState.agentId, "agent-group"))
      .orderBy(desc(agentRiskState.id))
      .limit(1);
    const recentAuditEvents = await getDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.agentId, "agent-group"))
      .orderBy(desc(auditEvents.id))
      .limit(5);

    expect(latestRiskState?.riskScore).toBeGreaterThan(0);
    expect(
      recentAuditEvents.some(
        (event) =>
          event.plugin === "behavior_template_anomaly" ||
          event.plugin === "group_correlation_spike",
      ),
    ).toBe(true);
  });
});
