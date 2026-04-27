import {
  buildAdminCookieHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  getApp,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  seedAdminAccount,
} from "./integration-test-support";
import { expect } from "vitest";

import {
  createProjectApiKey,
  createSaasProject,
  createSaasTenant,
} from "../modules/saas/service";

describeIntegrationSuite("backend saas integration", () => {
  it("rate limits prize-engine traffic per API key and exposes current usage to admin", async () => {
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
        url: "/v1/engine/overview",
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
  });
});
