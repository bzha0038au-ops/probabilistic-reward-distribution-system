import {
  authNotificationCaptures,
  buildAdminCookieHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  seedAdminAccount,
} from "./integration-test-support";
import { expect } from "vitest";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  agentRiskState,
  admins,
  experimentAssignments,
  experiments,
  saasApiKeys,
  saasBillingRuns,
  saasLedgerEntries,
  saasPlayers,
  saasReportExports,
  saasRewardEnvelopes,
  saasTenants,
  saasTenantInvites,
  saasTenantMemberships,
  saasUsageEvents,
} from "@reward/database";
import { and, desc, eq } from "@reward/database/orm";

import {
  createBillingRun,
  createProjectApiKey,
  createSaasProject,
  createSaasTenantInvite,
  createSaasTenant,
  runSaasReportExportCycle,
  upsertSaasBillingAccount,
} from "../modules/saas/service";
import { markBillingRunSyncProcessing } from "../modules/saas/billing-service-support";
import { SAAS_STATUS_REQUEST_REFERENCE_TYPE } from "../modules/saas-status/constants";

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

describeIntegrationSuite("backend saas integration", () => {
  it("persists project selection strategy and params on create", async () => {
    const tenant = await createSaasTenant({
      slug: "saas-strategy-tenant",
      name: "SaaS Strategy Tenant",
      status: "active",
    });

    const project = await createSaasProject({
      tenantId: tenant.id,
      slug: "epsilon-project",
      name: "Epsilon Project",
      environment: "sandbox",
      strategy: "epsilon_greedy",
      strategyParams: {
        epsilon: 0.2,
      },
    });

    expect(project).toMatchObject({
      strategy: "epsilon_greedy",
      strategyParams: {
        epsilon: 0.2,
      },
    });
  });

  it("lets a newly registered portal user create a workspace with a starter sandbox key", async () => {
    const email = "portal-self-serve@example.com";
    const password = "portal-self-serve-secret";
    const session = await loginUser(
      (await registerUser(email, password)).email,
      password,
    );

    const createResponse = await getApp().inject({
      method: "POST",
      url: "/portal/saas/tenants",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: {
        name: "Portal Self Serve Workspace",
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const created = createResponse.json().data as {
      tenant: Awaited<ReturnType<typeof createSaasTenant>>;
      membership: { role: string };
      issuedKey: { apiKey: string; projectId: number };
    };
    expect(created.membership.role).toBe("tenant_owner");
    expect(created.issuedKey.apiKey).toContain("pe_test_");
    expect(created.tenant.bootstrap.sandboxProject.environment).toBe("sandbox");
    expect(created.tenant.bootstrap.sandboxPrizes).toHaveLength(3);
    expect(created.tenant.bootstrap.sandboxRewardEnvelopes).toHaveLength(3);

    const [membership] = await getDb()
      .select()
      .from(saasTenantMemberships)
      .where(eq(saasTenantMemberships.tenantId, created.tenant.id))
      .limit(1);
    expect(membership?.role).toBe("tenant_owner");

    const keyRows = await getDb()
      .select()
      .from(saasApiKeys)
      .where(
        eq(saasApiKeys.projectId, created.tenant.bootstrap.sandboxProject.id),
      );
    expect(keyRows).toHaveLength(1);

    const rewardEnvelopes = await getDb()
      .select()
      .from(saasRewardEnvelopes)
      .where(eq(saasRewardEnvelopes.tenantId, created.tenant.id));
    expect(rewardEnvelopes).toHaveLength(3);

    const overviewResponse = await getApp().inject({
      method: "GET",
      url: "/portal/saas/overview",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(overviewResponse.statusCode).toBe(200);
    const overview = overviewResponse.json().data;
    expect(overview.summary.tenantCount).toBe(1);
    expect(overview.summary.apiKeyCount).toBe(1);
  });

  it("resolves experiment-bound portal overview ui copy for the signed-in operator", async () => {
    const email = "portal-copy-rollout@example.com";
    const password = "portal-copy-secret";

    await getDb().insert(experiments).values({
      key: "saas-portal-overview-copy",
      description: "Portal onboarding copy rollout",
      status: "active",
      defaultVariantKey: "treatment",
      variants: [
        {
          key: "treatment",
          weight: 1,
          payload: {
            overview: {
              sandbox: {
                title: "Variant sandbox handoff",
                description:
                  "This workspace ships with a seeded sandbox so operators can validate the integration path before handing it to downstream teams.",
                issueStarterKeyLabel: "Mint starter secret",
              },
              snippet: {
                title: "Variant hello-reward snippet",
              },
            },
          },
        },
      ],
    });

    const user = await registerUser(email, password);
    const session = await loginUser(user.email, password);

    const createResponse = await getApp().inject({
      method: "POST",
      url: "/portal/saas/tenants",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: {
        name: "Portal Copy Workspace",
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const overviewResponse = await getApp().inject({
      method: "GET",
      url: "/portal/saas/overview",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(overviewResponse.statusCode).toBe(200);

    const overview = overviewResponse.json().data as {
      uiCopy: {
        overview: {
          sandbox: {
            title: string;
            description: string;
            issueStarterKeyLabel: string;
          };
          snippet: {
            title: string;
          };
        };
      };
    };

    expect(overview.uiCopy.overview.sandbox).toMatchObject({
      title: "Variant sandbox handoff",
      description:
        "This workspace ships with a seeded sandbox so operators can validate the integration path before handing it to downstream teams.",
      issueStarterKeyLabel: "Mint starter secret",
    });
    expect(overview.uiCopy.overview.snippet.title).toBe(
      "Variant hello-reward snippet",
    );

    const [assignment] = await getDb()
      .select({
        subjectType: experimentAssignments.subjectType,
        subjectKey: experimentAssignments.subjectKey,
        variantKey: experimentAssignments.variantKey,
      })
      .from(experimentAssignments)
      .innerJoin(
        experiments,
        eq(experimentAssignments.experimentId, experiments.id),
      )
      .where(
        and(
          eq(experiments.key, "saas-portal-overview-copy"),
          eq(experimentAssignments.subjectType, "user"),
          eq(experimentAssignments.subjectKey, String(user.id)),
        ),
      )
      .limit(1);

    expect(assignment).toMatchObject({
      subjectType: "user",
      variantKey: "treatment",
    });
  });

  it("lets a newly registered portal user accept an invite without a pre-existing admin profile", async () => {
    const email = "portal-invite-user@example.com";
    const password = "portal-secret-123";
    const user = await registerUser(email, password);
    const session = await loginUser(email, password);

    const tenant = await createSaasTenant({
      slug: "portal-invite-tenant",
      name: "Portal Invite Tenant",
      status: "active",
    });

    const invite = await createSaasTenantInvite(
      {
        tenantId: tenant.id,
        email,
        role: "tenant_operator",
      },
      {
        inviteBaseUrl: "http://localhost:3002",
        invitedByLabel: "Integration test",
      },
    );

    const token = new URL(invite.inviteUrl).searchParams.get("invite");
    expect(token).toBeTruthy();

    const acceptResponse = await getApp().inject({
      method: "POST",
      url: "/portal/saas/invites/accept",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: { token },
    });
    expect(acceptResponse.statusCode).toBe(200);

    const overviewResponse = await getApp().inject({
      method: "GET",
      url: "/portal/saas/overview",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(overviewResponse.statusCode).toBe(200);

    const overview = overviewResponse.json().data;
    expect(overview.summary.tenantCount).toBe(1);
    expect(overview.tenants[0]?.tenant.id).toBe(tenant.id);
    expect(overview.projects[0]?.environment).toBe("sandbox");

    const [adminProfile] = await getDb()
      .select()
      .from(admins)
      .where(eq(admins.userId, user.id))
      .limit(1);
    expect(adminProfile).toBeDefined();

    const [membership] = await getDb()
      .select()
      .from(saasTenantMemberships)
      .where(
        and(
          eq(saasTenantMemberships.tenantId, tenant.id),
          eq(saasTenantMemberships.adminId, adminProfile!.id),
        ),
      )
      .limit(1);
    expect(membership?.role).toBe("tenant_operator");

    const [inviteRow] = await getDb()
      .select()
      .from(saasTenantInvites)
      .where(eq(saasTenantInvites.id, invite.invite.id))
      .limit(1);
    expect(inviteRow?.status).toBe("accepted");
  });

  it("queues, processes, and downloads tenant report exports via portal routes", async () => {
    const email = "portal-report-export-user@example.com";
    const password = "portal-report-secret-123";
    await registerUser(email, password);
    const session = await loginUser(email, password);

    const tenant = await createSaasTenant({
      slug: "portal-report-tenant",
      name: "Portal Report Tenant",
      status: "active",
    });

    const invite = await createSaasTenantInvite(
      {
        tenantId: tenant.id,
        email,
        role: "tenant_operator",
      },
      {
        inviteBaseUrl: "http://localhost:3002",
        invitedByLabel: "Integration test",
      },
    );

    const inviteToken = new URL(invite.inviteUrl).searchParams.get("invite");
    expect(inviteToken).toBeTruthy();

    const acceptResponse = await getApp().inject({
      method: "POST",
      url: "/portal/saas/invites/accept",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: {
        token: inviteToken,
      },
    });
    expect(acceptResponse.statusCode).toBe(200);

    const projectId = tenant.bootstrap.sandboxProject.id;
    const apiKey = await createProjectApiKey({
      projectId,
      label: "portal-report-export-key",
      scopes: ["draw:write", "ledger:read"],
    });

    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    const updatedAt = new Date(Date.now() - 20 * 60 * 1000);
    const [player] = await getDb()
      .insert(saasPlayers)
      .values({
        projectId,
        externalPlayerId: "report-player-001",
        displayName: "Report Player",
      })
      .returning();

    await getDb()
      .insert(saasUsageEvents)
      .values({
        tenantId: tenant.id,
        projectId,
        apiKeyId: apiKey.id,
        playerId: player.id,
        environment: "sandbox",
        eventType: "draw:write",
        units: 1,
        amount: "0.2500",
        currency: "USD",
        metadata: {
          source: "integration-test",
        },
        createdAt,
      });

    await getDb()
      .insert(saasLedgerEntries)
      .values({
        projectId,
        playerId: player.id,
        environment: "sandbox",
        entryType: "reward_credit",
        amount: "10.00",
        balanceBefore: "5.00",
        balanceAfter: "15.00",
        referenceType: "draw_record",
        referenceId: 42,
        metadata: {
          source: "integration-test",
        },
        createdAt,
      });

    await getDb()
      .insert(agentRiskState)
      .values({
        tenantId: tenant.id,
        projectId,
        apiKeyId: apiKey.id,
        agentId: "risk-agent-001",
        playerExternalId: "report-player-001",
        identityType: "agent_id",
        identityValueHash: "risk-state-hash-001",
        identityHint: "risk-agent-001",
        riskScore: 42,
        hitCount: 2,
        severeHitCount: 1,
        lastSeverity: "high",
        lastPlugin: "group_correlation_spike",
        lastReason: "suspicious request velocity",
        metadata: {
          source: "integration-test",
        },
        firstHitAt: createdAt,
        lastHitAt: updatedAt,
        createdAt,
        updatedAt,
      });

    const fromAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const toAt = new Date().toISOString();

    for (const payload of [
      {
        resource: "saas_usage_events",
        format: "csv",
      },
      {
        resource: "saas_ledger_entries",
        format: "json",
      },
      {
        resource: "agent_risk_state",
        format: "json",
      },
    ] as const) {
      const response = await getApp().inject({
        method: "POST",
        url: `/portal/saas/tenants/${tenant.id}/reports/exports`,
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        payload: {
          ...payload,
          fromAt,
          toAt,
        },
      });

      expect(response.statusCode).toBe(201);
    }

    const cycle = await runSaasReportExportCycle({ limit: 10 });
    expect(cycle.processed).toBe(3);
    expect(cycle.failed).toBe(0);

    const storedExports = await getDb()
      .select()
      .from(saasReportExports)
      .where(eq(saasReportExports.tenantId, tenant.id))
      .orderBy(desc(saasReportExports.id));
    expect(storedExports).toHaveLength(3);
    expect(storedExports.every((job) => job.status === "completed")).toBe(true);

    const listResponse = await getApp().inject({
      method: "GET",
      url: `/portal/saas/tenants/${tenant.id}/reports/exports`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);

    const exportJobs = listResponse.json().data as Array<{
      resource: string;
      format: string;
      downloadUrl: string | null;
    }>;
    expect(exportJobs).toHaveLength(3);

    const usageJob = exportJobs.find(
      (job) => job.resource === "saas_usage_events",
    );
    const riskJob = exportJobs.find(
      (job) => job.resource === "agent_risk_state",
    );
    expect(usageJob?.format).toBe("csv");
    expect(usageJob?.downloadUrl).toBeTruthy();
    expect(riskJob?.downloadUrl).toBeTruthy();

    const usageDownloadUrl = new URL(usageJob!.downloadUrl!);
    const usageDownloadResponse = await getApp().inject({
      method: "GET",
      url: `${usageDownloadUrl.pathname}${usageDownloadUrl.search}`,
    });
    expect(usageDownloadResponse.statusCode).toBe(200);
    expect(usageDownloadResponse.headers["content-type"]).toContain("text/csv");
    expect(usageDownloadResponse.headers["content-disposition"]).toContain(
      "attachment;",
    );
    expect(usageDownloadResponse.body).toContain("draw:write");
    expect(usageDownloadResponse.body).toContain("report-player-001");

    const riskDownloadUrl = new URL(riskJob!.downloadUrl!);
    const riskDownloadResponse = await getApp().inject({
      method: "GET",
      url: `${riskDownloadUrl.pathname}${riskDownloadUrl.search}`,
    });
    expect(riskDownloadResponse.statusCode).toBe(200);
    expect(riskDownloadResponse.headers["content-type"]).toContain(
      "application/json",
    );

    const riskPayload = JSON.parse(riskDownloadResponse.body) as {
      export: {
        resource: string;
      };
      rows: Array<{
        agentId: string;
        riskScore: number;
      }>;
    };
    expect(riskPayload.export.resource).toBe("agent_risk_state");
    expect(riskPayload.rows[0]).toMatchObject({
      agentId: "risk-agent-001",
      riskScore: 42,
    });
  });

  it("keeps empty CSV report exports downloadable through portal routes", async () => {
    const email = "portal-empty-report-user@example.com";
    const password = "portal-empty-report-secret-123";
    await registerUser(email, password);
    const session = await loginUser(email, password);

    const tenant = await createSaasTenant({
      slug: "portal-empty-report-tenant",
      name: "Portal Empty Report Tenant",
      status: "active",
    });

    const invite = await createSaasTenantInvite(
      {
        tenantId: tenant.id,
        email,
        role: "tenant_operator",
      },
      {
        inviteBaseUrl: "http://localhost:3002",
        invitedByLabel: "Integration test",
      },
    );

    const inviteToken = new URL(invite.inviteUrl).searchParams.get("invite");
    expect(inviteToken).toBeTruthy();

    const acceptResponse = await getApp().inject({
      method: "POST",
      url: "/portal/saas/invites/accept",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: {
        token: inviteToken,
      },
    });
    expect(acceptResponse.statusCode).toBe(200);

    const fromAt = new Date(Date.now() - 60_000).toISOString();
    const toAt = new Date().toISOString();

    const queueResponse = await getApp().inject({
      method: "POST",
      url: `/portal/saas/tenants/${tenant.id}/reports/exports`,
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      payload: {
        resource: "saas_usage_events",
        format: "csv",
        fromAt,
        toAt,
      },
    });
    expect(queueResponse.statusCode).toBe(201);

    const cycle = await runSaasReportExportCycle({ limit: 10 });
    expect(cycle.processed).toBe(1);
    expect(cycle.failed).toBe(0);

    const listResponse = await getApp().inject({
      method: "GET",
      url: `/portal/saas/tenants/${tenant.id}/reports/exports`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);

    const [job] = listResponse.json().data as Array<{
      downloadUrl: string | null;
      format: string;
      rowCount: number | null;
      status: string;
    }>;
    expect(job?.status).toBe("completed");
    expect(job?.format).toBe("csv");
    expect(job?.rowCount).toBe(0);
    expect(job?.downloadUrl).toBeTruthy();

    const downloadUrl = new URL(job!.downloadUrl!);
    const downloadResponse = await getApp().inject({
      method: "GET",
      url: `${downloadUrl.pathname}${downloadUrl.search}`,
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("text/csv");
    expect(downloadResponse.body).toBe("");
  });

  it(
    "bootstraps a sandbox project and keeps sandbox usage out of billing runs",
    { timeout: 15_000 },
    async () => {
      const tenant = await createSaasTenant({
        slug: "saas-bootstrap-tenant",
        name: "SaaS Bootstrap Tenant",
        status: "active",
      });

      expect(tenant.bootstrap.sandboxProject.environment).toBe("sandbox");
      expect(tenant.bootstrap.sandboxProject.slug).toBe("sandbox");
      expect(tenant.bootstrap.sandboxProject.currency).toBe("RWDT");
      expect(tenant.bootstrap.sandboxPrizes).toHaveLength(3);
      expect(tenant.bootstrap.sandboxRewardEnvelopes).toHaveLength(3);
      expect(tenant.bootstrap.billingAccount.isBillable).toBe(false);

      const liveProject = await createSaasProject({
        tenantId: tenant.id,
        slug: "production",
        name: "Production",
        environment: "live",
        drawCost: "0",
      });

      await upsertSaasBillingAccount({
        tenantId: tenant.id,
        planCode: "starter",
        baseMonthlyFee: "0",
        drawFee: "2",
        currency: "USD",
        isBillable: true,
      });
      const billingPeriodStart = new Date();

      const sandboxKey = await createProjectApiKey({
        projectId: tenant.bootstrap.sandboxProject.id,
        label: "Sandbox hello key",
        scopes: ["draw:write"],
      });
      const liveKey = await createProjectApiKey({
        projectId: liveProject.id,
        label: "Live hello key",
        scopes: ["draw:write"],
      });

      const drawPayload = {
        player: {
          playerId: "hello-reward-player",
          displayName: "Hello Reward",
        },
      };

      const sandboxDraw = await getApp().inject({
        method: "POST",
        url: prizeEngineUrl("/v1/engine/draws", "sandbox"),
        headers: {
          authorization: `Bearer ${sandboxKey.apiKey}`,
        },
        payload: prizeEnginePayload(drawPayload, "sandbox"),
      });
      expect(sandboxDraw.statusCode).toBe(200);

      const liveDraw = await getApp().inject({
        method: "POST",
        url: prizeEngineUrl("/v1/engine/draws", "live"),
        headers: {
          authorization: `Bearer ${liveKey.apiKey}`,
        },
        payload: prizeEnginePayload(drawPayload, "live"),
      });
      expect(liveDraw.statusCode).toBe(200);

      const billingRun = await createBillingRun({
        tenantId: tenant.id,
        periodStart: billingPeriodStart.toISOString(),
        periodEnd: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(billingRun.drawCount).toBe(1);
      expect(billingRun.usageFeeAmount).toBe("2.00");
      expect(billingRun.totalAmount).toBe("2.00");

      const usageEvents = await getDb()
        .select()
        .from(saasUsageEvents)
        .where(
          and(
            eq(saasUsageEvents.tenantId, tenant.id),
            eq(saasUsageEvents.eventType, "draw:write"),
          ),
        )
        .orderBy(desc(saasUsageEvents.id));

      const drawDecisionEvents = usageEvents.filter(
        (event) => event.referenceType !== SAAS_STATUS_REQUEST_REFERENCE_TYPE,
      );
      expect(drawDecisionEvents).toHaveLength(2);

      const sandboxUsage = drawDecisionEvents.find(
        (event) => event.projectId === tenant.bootstrap.sandboxProject.id,
      );
      const liveUsage = drawDecisionEvents.find(
        (event) => event.projectId === liveProject.id,
      );

      expect(sandboxUsage?.environment).toBe("sandbox");
      expect(sandboxUsage?.billingRunId).toBeNull();
      expect(sandboxUsage?.amount).toBe("0.0000");
      expect(Reflect.get(sandboxUsage?.metadata ?? {}, "billable")).toBe(false);

      expect(liveUsage?.environment).toBe("live");
      expect(liveUsage?.billingRunId).toBe(billingRun.id);
      expect(liveUsage?.amount).toBe("2.0000");
    },
  );

  it("marks a tenant onboarded and queues an onboarding email after the first successful reward call", async () => {
    const tenant = await createSaasTenant({
      slug: "saas-onboard-tenant",
      name: "SaaS Onboard Tenant",
      billingEmail: "billing-onboard@example.com",
      status: "active",
    });
    const sandboxKey = await createProjectApiKey({
      projectId: tenant.bootstrap.sandboxProject.id,
      label: "Onboarding hello key",
      scopes: ["reward:write", "ledger:read", "catalog:read", "fairness:read"],
    });

    const rewardResponse = await getApp().inject({
      method: "POST",
      url: prizeEngineUrl("/v1/engine/rewards", "sandbox"),
      headers: {
        authorization: `Bearer ${sandboxKey.apiKey}`,
      },
      payload: prizeEnginePayload(
        {
          agent: {
            agentId: "hello-reward-onboard-agent",
            groupId: "hello-reward-demo",
          },
          behavior: {
            actionType: "hello_reward_demo",
            score: 0.92,
            context: { source: "integration-test" },
          },
          idempotencyKey: "hello-reward-onboard-1",
          clientNonce: "hello-reward-onboard-1",
        },
        "sandbox",
      ),
    });
    expect(rewardResponse.statusCode).toBe(201);

    const [updatedTenant] = await getDb()
      .select()
      .from(saasTenants)
      .where(eq(saasTenants.id, tenant.id))
      .limit(1);
    expect(updatedTenant?.onboardedAt).toBeTruthy();

    expect(authNotificationCaptures.saasOnboardingComplete).toHaveLength(1);
    expect(authNotificationCaptures.saasOnboardingComplete[0]).toMatchObject({
      email: "billing-onboard@example.com",
      tenantName: "SaaS Onboard Tenant",
      projectName: "Sandbox",
      environment: "sandbox",
      activityType: "reward",
      subjectId: "hello-reward-onboard-agent",
    });
  });

  it(
    "lets a portal tenant submit a billing dispute tied to a billing run",
    { timeout: 15_000 },
    async () => {
      const email = "portal-billing-dispute@example.com";
      const password = "portal-secret-123";
      await registerUser(email, password);
      const session = await loginUser(email, password);

      const tenant = await createSaasTenant({
        slug: "portal-billing-dispute-tenant",
        name: "Portal Billing Dispute Tenant",
        status: "active",
      });

      const invite = await createSaasTenantInvite(
        {
          tenantId: tenant.id,
          email,
          role: "tenant_owner",
        },
        {
          inviteBaseUrl: "http://localhost:3002",
          invitedByLabel: "Integration test",
        },
      );
      const token = new URL(invite.inviteUrl).searchParams.get("invite");

      const acceptResponse = await getApp().inject({
        method: "POST",
        url: "/portal/saas/invites/accept",
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        payload: { token },
      });
      expect(acceptResponse.statusCode).toBe(200);

      const liveProject = await createSaasProject({
        tenantId: tenant.id,
        slug: "portal-billing-dispute-live",
        name: "Portal Billing Dispute Live",
        environment: "live",
        drawCost: "0",
      });

      await upsertSaasBillingAccount({
        tenantId: tenant.id,
        planCode: "growth",
        baseMonthlyFee: "0",
        drawFee: "2",
        currency: "USD",
        isBillable: true,
      });

      const liveKey = await createProjectApiKey({
        projectId: liveProject.id,
        label: "Portal billing dispute live key",
        scopes: ["draw:write"],
      });
      const periodStart = new Date();
      const periodEnd = new Date(periodStart.getTime() + 60_000);

      const liveDraw = await getApp().inject({
        method: "POST",
        url: prizeEngineUrl("/v1/engine/draws", "live"),
        headers: {
          authorization: `Bearer ${liveKey.apiKey}`,
        },
        payload: prizeEnginePayload(
          {
            player: {
              playerId: "portal-billing-dispute-player",
              displayName: "Portal Billing Dispute Player",
            },
          },
          "live",
        ),
      });
      expect(liveDraw.statusCode).toBe(200);

      const billingRun = await createBillingRun({
        tenantId: tenant.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
      expect(billingRun.totalAmount).toBe("2.00");

      const disputeResponse = await getApp().inject({
        method: "POST",
        url: `/portal/saas/tenants/${tenant.id}/disputes`,
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        payload: {
          billingRunId: billingRun.id,
          reason: "invoice_amount",
          summary: "Metered run looks too high",
          description:
            "The billed draw count includes a run we expected to stay in sandbox.",
          requestedRefundAmount: "1.00",
        },
      });
      expect(disputeResponse.statusCode).toBe(201);
      expect(disputeResponse.json().data).toMatchObject({
        tenantId: tenant.id,
        billingRunId: billingRun.id,
        status: "submitted",
        requestedRefundAmount: "1.00",
      });

      const overviewResponse = await getApp().inject({
        method: "GET",
        url: "/portal/saas/overview",
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });
      expect(overviewResponse.statusCode).toBe(200);

      const overview = overviewResponse.json().data;
      expect(
        overview.disputes.find(
          (dispute: { billingRunId: number }) =>
            dispute.billingRunId === billingRun.id,
        ),
      ).toMatchObject({
        status: "submitted",
        summary: "Metered run looks too high",
      });
    },
  );

  it(
    "persists billing run failure metadata when stripe sync fails after local usage is committed",
    { timeout: 15_000 },
    async () => {
      const tenant = await createSaasTenant({
        slug: "saas-sync-failure-tenant",
        name: "SaaS Sync Failure Tenant",
        status: "active",
      });

      const liveProject = await createSaasProject({
        tenantId: tenant.id,
        slug: "live-sync-failure",
        name: "Live Sync Failure",
        environment: "live",
        drawCost: "0",
      });

      await upsertSaasBillingAccount({
        tenantId: tenant.id,
        planCode: "starter",
        baseMonthlyFee: "0",
        drawFee: "2",
        currency: "USD",
        isBillable: true,
      });

      const liveKey = await createProjectApiKey({
        projectId: liveProject.id,
        label: "Live sync failure key",
        scopes: ["draw:write"],
      });
      const periodStart = new Date();
      const periodEnd = new Date(periodStart.getTime() + 60_000);

      const liveDraw = await getApp().inject({
        method: "POST",
        url: prizeEngineUrl("/v1/engine/draws", "live"),
        headers: {
          authorization: `Bearer ${liveKey.apiKey}`,
        },
        payload: prizeEnginePayload(
          {
            player: {
              playerId: "sync-failure-player",
              displayName: "Sync Failure Player",
            },
          },
          "live",
        ),
      });
      expect(liveDraw.statusCode).toBe(200);

      await expect(
        createBillingRun({
          tenantId: tenant.id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          finalize: true,
        }),
      ).rejects.toThrow();

      const [run] = await getDb()
        .select()
        .from(saasBillingRuns)
        .where(eq(saasBillingRuns.tenantId, tenant.id))
        .orderBy(desc(saasBillingRuns.id))
        .limit(1);
      expect(run?.status).toBe("failed");
      expect(run?.externalSyncStatus).toBe("failed");
      expect(run?.externalSyncAction).toBe("sync_and_finalize");
      expect(run?.externalSyncStage).toBe("precondition");
      expect(run?.externalSyncRecoveryPath).toBe(
        "retry_sync_or_wait_for_reconciliation",
      );
      expect(String(run?.externalSyncError ?? "")).toMatch(
        /Stripe customer is not configured|SAAS Stripe is not configured/,
      );
      expect(Reflect.get(run?.metadata ?? {}, "externalSync")).toBeUndefined();

      const usageEvents = await getDb()
        .select()
        .from(saasUsageEvents)
        .where(
          and(
            eq(saasUsageEvents.tenantId, tenant.id),
            eq(saasUsageEvents.projectId, liveProject.id),
          ),
        )
        .orderBy(desc(saasUsageEvents.id))
        .limit(10);
      const usageEvent = usageEvents.find(
        (event) => event.referenceType !== SAAS_STATUS_REQUEST_REFERENCE_TYPE,
      );
      expect(usageEvent?.billingRunId).toBe(run?.id ?? null);
    },
  );

  it("uses CAS for billing run sync claims and allows stale processing claims to be reclaimed", async () => {
    const tenant = await createSaasTenant({
      slug: "saas-sync-cas-tenant",
      name: "SaaS Sync CAS Tenant",
      status: "active",
    });

    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 60_000);

    const billingRun = await createBillingRun({
      tenantId: tenant.id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    const [snapshotA] = await getDb()
      .select()
      .from(saasBillingRuns)
      .where(eq(saasBillingRuns.id, billingRun.id))
      .limit(1);
    const [snapshotB] = await getDb()
      .select()
      .from(saasBillingRuns)
      .where(eq(saasBillingRuns.id, billingRun.id))
      .limit(1);

    expect(snapshotA).toBeDefined();
    expect(snapshotB).toBeDefined();

    const processingRun = await markBillingRunSyncProcessing(snapshotA!, {
      action: "sync",
      stage: "precondition",
    });
    expect(processingRun.externalSyncStatus).toBe("processing");

    await expect(
      markBillingRunSyncProcessing(snapshotB!, {
        action: "sync",
        stage: "precondition",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: API_ERROR_CODES.BILLING_RUN_SYNC_CONFLICT,
    });

    await getDb()
      .update(saasBillingRuns)
      .set({
        externalSyncAttemptedAt: new Date(Date.now() - 10 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(saasBillingRuns.id, billingRun.id));

    const [staleRun] = await getDb()
      .select()
      .from(saasBillingRuns)
      .where(eq(saasBillingRuns.id, billingRun.id))
      .limit(1);

    expect(staleRun?.externalSyncStatus).toBe("processing");

    const reclaimedRun = await markBillingRunSyncProcessing(staleRun!, {
      action: "refresh",
      stage: "invoice_refresh",
    });
    expect(reclaimedRun.externalSyncStatus).toBe("processing");
    expect(reclaimedRun.externalSyncAction).toBe("refresh");
    expect(reclaimedRun.externalSyncStage).toBe("invoice_refresh");
    expect(reclaimedRun.externalSyncRevision).toBeGreaterThan(
      staleRun!.externalSyncRevision,
    );
  });

  it(
    "rate limits prize-engine traffic per API key and exposes current usage to admin",
    { timeout: 15_000 },
    async () => {
      const tenant = await createSaasTenant({
        slug: "saas-rate-limit-tenant",
        name: "SaaS Rate Limit Tenant",
        status: "active",
      });

      const firstProject = await createSaasProject({
        tenantId: tenant.id,
        slug: "same-ip-a",
        name: "Same IP A",
        environment: "sandbox",
        apiRateLimitBurst: 2,
        apiRateLimitHourly: 10,
        apiRateLimitDaily: 20,
      });
      const secondProject = await createSaasProject({
        tenantId: tenant.id,
        slug: "same-ip-b",
        name: "Same IP B",
        environment: "sandbox",
        apiRateLimitBurst: 2,
        apiRateLimitHourly: 10,
        apiRateLimitDaily: 20,
      });

      const firstKey = await createProjectApiKey({
        projectId: firstProject.id,
        label: "Project A key",
      });
      const secondKey = await createProjectApiKey({
        projectId: secondProject.id,
        label: "Project B key",
      });

      const callOverview = (apiKey: string) =>
        getApp().inject({
          method: "GET",
          url: prizeEngineUrl("/v1/engine/overview"),
          headers: {
            authorization: `Bearer ${apiKey}`,
          },
        });

      expect((await callOverview(firstKey.apiKey)).statusCode).toBe(200);
      expect((await callOverview(firstKey.apiKey)).statusCode).toBe(200);

      const limitedResponse = await callOverview(firstKey.apiKey);
      expect(limitedResponse.statusCode).toBe(429);
      expect(limitedResponse.headers["retry-after"]).toBeTruthy();
      expect(limitedResponse.json().error.code).toBe("API_RATE_LIMIT_EXCEEDED");

      const unaffectedResponse = await callOverview(secondKey.apiKey);
      expect(unaffectedResponse.statusCode).toBe(200);

      const adminEmail = "saas-overview-admin@example.com";
      const { admin, password } = await seedAdminAccount({ email: adminEmail });
      await grantAdminPermissions(admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
      const adminSession = await loginAdmin(adminEmail, password);

      const overviewResponse = await getApp().inject({
        method: "GET",
        url: "/admin/saas/overview",
        headers: buildAdminCookieHeaders(adminSession.token),
      });
      expect(overviewResponse.statusCode).toBe(200);

      const overview = overviewResponse.json().data;
      const projectAOverview = overview.projects.find(
        (project: { id: number }) => project.id === firstProject.id,
      );
      const projectBOverview = overview.projects.find(
        (project: { id: number }) => project.id === secondProject.id,
      );
      const keyAOverview = overview.apiKeys.find(
        (apiKey: { id: number }) => apiKey.id === firstKey.id,
      );
      const keyBOverview = overview.apiKeys.find(
        (apiKey: { id: number }) => apiKey.id === secondKey.id,
      );

      expect(projectAOverview.apiRateLimitUsage).toMatchObject({
        activeKeyCount: 1,
        aggregate: {
          burst: { used: 3, limit: 2, remaining: 0 },
          hourly: { used: 3, limit: 10, remaining: 7 },
          daily: { used: 3, limit: 20, remaining: 17 },
        },
      });
      expect(projectBOverview.apiRateLimitUsage).toMatchObject({
        activeKeyCount: 1,
        aggregate: {
          burst: { used: 1, limit: 2, remaining: 1 },
          hourly: { used: 1, limit: 10, remaining: 9 },
          daily: { used: 1, limit: 20, remaining: 19 },
        },
      });
      expect(keyAOverview.apiRateLimitUsage).toMatchObject({
        burst: { used: 3, limit: 2, remaining: 0 },
        hourly: { used: 3, limit: 10, remaining: 7 },
        daily: { used: 3, limit: 20, remaining: 17 },
      });
      expect(keyBOverview.apiRateLimitUsage).toMatchObject({
        burst: { used: 1, limit: 2, remaining: 1 },
        hourly: { used: 1, limit: 10, remaining: 9 },
        daily: { used: 1, limit: 20, remaining: 19 },
      });

      const usageResponse = await getApp().inject({
        method: "GET",
        url: `/admin/saas/tenants/by-slug/${tenant.slug}/usage`,
        headers: buildAdminCookieHeaders(adminSession.token),
      });
      expect(usageResponse.statusCode).toBe(200);

      const usage = usageResponse.json().data;
      expect(usage.summary.totalRequests).toBe(4);
      expect(usage.summary.antiExploitBlockedRequests).toBe(1);
      expect(usage.summary.successfulRequests).toBe(3);
      expect(usage.summary.antiExploitRatePct).toBeGreaterThan(20);
      expect(
        usage.minuteQps.reduce(
          (sum: number, bucket: { requestCount: number }) =>
            sum + bucket.requestCount,
          0,
        ),
      ).toBe(4);
    },
  );
});
