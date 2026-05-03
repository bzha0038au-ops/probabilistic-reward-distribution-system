import assert from "node:assert/strict";
import test from "node:test";

import type { SaasOverview } from "@reward/shared-types/saas";

import {
  getPortalDocsSubviewFromPathname,
  getPortalBillingSubviewFromPathname,
  getPortalKeysSubviewFromPathname,
  getPortalOverviewSubviewFromPathname,
  getPortalPrizesSubviewFromPathname,
  getPortalTenantsSubviewFromPathname,
  buildPortalHref,
  buildPortalRouteHref,
  getPortalReportsSubviewFromPathname,
  getPortalViewFromPathname,
  getPortalUsageSubviewFromPathname,
  readPositiveInt,
  resolvePortalSelection,
} from "../modules/portal/lib/portal";

const createOverview = () =>
  ({
    tenants: [
      { tenant: { id: 10, name: "Alpha" } },
      { tenant: { id: 20, name: "Beta" } },
    ],
    projects: [
      { id: 101, tenantId: 10, environment: "sandbox", name: "Alpha Sandbox" },
      { id: 102, tenantId: 10, environment: "live", name: "Alpha Live" },
      { id: 201, tenantId: 20, environment: "sandbox", name: "Beta Sandbox" },
    ],
    apiKeys: [
      { id: 1, projectId: 101, revokedAt: null },
      { id: 2, projectId: 101, revokedAt: "2026-04-29T00:00:00.000Z" },
      { id: 3, projectId: 102, revokedAt: null },
    ],
    billingRuns: [
      { id: 1, tenantId: 10 },
      { id: 2, tenantId: 20 },
    ],
    topUps: [{ id: 1, tenantId: 10 }],
    disputes: [
      { id: 1, tenantId: 10 },
      { id: 2, tenantId: 20 },
    ],
    invites: [{ id: 1, tenantId: 10 }],
    tenantLinks: [{ id: 1, parentTenantId: 10, childTenantId: 20 }],
    agentControls: [
      { id: 1, tenantId: 10 },
      { id: 2, tenantId: 20 },
    ],
    memberships: [{ id: 1, tenantId: 10 }],
    recentUsage: [
      { id: 1, projectId: 102 },
      { id: 2, projectId: 101 },
    ],
    projectPrizes: [
      { id: 1, projectId: 101 },
      { id: 2, projectId: 102 },
    ],
    projectObservability: [{ project: { id: 102 } }],
  }) as unknown as SaasOverview;

test("portal helpers normalize pathnames and query state", () => {
  assert.equal(getPortalViewFromPathname(null), "overview");
  assert.equal(getPortalViewFromPathname("/portal/keys/"), "keys");
  assert.equal(getPortalViewFromPathname("/portal/usage/quota"), "usage");
  assert.equal(
    getPortalViewFromPathname("/portal/not-a-real-view"),
    "overview",
  );
  assert.equal(getPortalOverviewSubviewFromPathname("/portal"), "launcher");
  assert.equal(
    getPortalOverviewSubviewFromPathname("/portal/overview/snippet"),
    "snippet",
  );
  assert.equal(
    getPortalTenantsSubviewFromPathname("/portal/tenants"),
    "directory",
  );
  assert.equal(
    getPortalTenantsSubviewFromPathname("/portal/tenants/invites"),
    "invites",
  );
  assert.equal(getPortalKeysSubviewFromPathname("/portal/keys"), "management");
  assert.equal(
    getPortalKeysSubviewFromPathname("/portal/keys/guardrails"),
    "guardrails",
  );
  assert.equal(getPortalUsageSubviewFromPathname("/portal/usage"), "overview");
  assert.equal(
    getPortalUsageSubviewFromPathname("/portal/usage/quota"),
    "quota",
  );
  assert.equal(
    getPortalReportsSubviewFromPathname("/portal/reports"),
    "queue",
  );
  assert.equal(
    getPortalReportsSubviewFromPathname("/portal/reports/jobs"),
    "jobs",
  );
  assert.equal(
    getPortalDocsSubviewFromPathname("/portal/docs"),
    "bootstrap",
  );
  assert.equal(
    getPortalDocsSubviewFromPathname("/portal/docs/snippet"),
    "snippet",
  );
  assert.equal(
    getPortalBillingSubviewFromPathname("/portal/billing"),
    "overview",
  );
  assert.equal(
    getPortalBillingSubviewFromPathname("/portal/billing/disputes"),
    "disputes",
  );
  assert.equal(
    getPortalPrizesSubviewFromPathname("/portal/prizes"),
    "catalog",
  );
  assert.equal(
    getPortalPrizesSubviewFromPathname("/portal/prizes/envelope"),
    "envelope",
  );

  assert.equal(readPositiveInt("7"), 7);
  assert.equal(readPositiveInt("0"), null);
  assert.equal(readPositiveInt("  "), null);

  assert.equal(
    buildPortalHref("keys", {
      tenantId: 10,
      projectId: 101,
      inviteToken: "invite-1",
      billingSetupStatus: "ready",
    }),
    "/portal/keys?tenant=10&project=101&invite=invite-1&billingSetup=ready",
  );
  assert.equal(
    buildPortalRouteHref("overview", "sandbox", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/overview/sandbox?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("tenants", "access", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/tenants/access?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("keys", "guardrails", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/keys/guardrails?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("usage", "quota", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/usage/quota?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("reports", "jobs", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/reports/jobs?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("docs", "snippet", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/docs/snippet?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("billing", "controls", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/billing/controls?tenant=10&project=101",
  );
  assert.equal(
    buildPortalRouteHref("prizes", "summary", {
      tenantId: 10,
      projectId: 101,
    }),
    "/portal/prizes/summary?tenant=10&project=101",
  );
});

test("resolvePortalSelection falls back to the first valid tenant and project", () => {
  const selection = resolvePortalSelection(createOverview(), 999, 999);

  assert.equal(selection.currentTenantId, 10);
  assert.equal(selection.currentProjectId, 101);
  assert.equal(selection.currentTenantBillingRuns.length, 1);
  assert.equal(selection.currentTenantBillingRuns[0]?.tenantId, 10);
  assert.equal(selection.sandboxProjectId, 101);
  assert.deepEqual(
    selection.sandboxProjectKeys.map((entry) => entry.id),
    [1],
  );
});

test("resolvePortalSelection honors requested ids and keeps project scoped collections aligned", () => {
  const selection = resolvePortalSelection(createOverview(), 10, 102);

  assert.equal(selection.currentTenantId, 10);
  assert.equal(selection.currentProjectId, 102);
  assert.equal(selection.currentProject?.id, 102);
  assert.equal(selection.currentProjectObservability?.project.id, 102);
  assert.deepEqual(
    selection.currentProjectKeys.map((entry) => entry.id),
    [3],
  );
  assert.deepEqual(
    selection.currentProjectUsage.map((entry) => entry.projectId),
    [102],
  );
  assert.deepEqual(
    selection.currentProjectPrizes.map((entry) => entry.projectId),
    [102],
  );
});
