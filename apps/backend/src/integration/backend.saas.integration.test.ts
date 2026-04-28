import {
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
import {
  admins,
  saasTenantInvites,
  saasTenantMemberships,
  saasUsageEvents,
} from "@reward/database";
import { and, desc, eq } from "@reward/database/orm";

import {
  createBillingRun,
  createProjectApiKey,
  createSaasProject,
  createSaasTenant,
  createSaasTenantInvite,
  upsertSaasBillingAccount,
} from "../modules/saas/service";

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

  it(
    "lets a newly registered portal user accept an invite without a pre-existing admin profile",
    async () => {
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
    },
  );

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

      expect(usageEvents).toHaveLength(2);

      const sandboxUsage = usageEvents.find(
        (event) => event.projectId === tenant.bootstrap.sandboxProject.id,
      );
      const liveUsage = usageEvents.find(
        (event) => event.projectId === liveProject.id,
      );

      expect(sandboxUsage?.environment).toBe("sandbox");
      expect(sandboxUsage?.billingRunId).toBeNull();
      expect(sandboxUsage?.amount).toBe("0.0000");
      expect(
        Reflect.get(sandboxUsage?.metadata ?? {}, "billable"),
      ).toBe(false);

      expect(liveUsage?.environment).toBe("live");
      expect(liveUsage?.billingRunId).toBe(billingRun.id);
      expect(liveUsage?.amount).toBe("2.0000");
    },
  );

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
