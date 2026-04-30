import assert from "node:assert/strict";
import test from "node:test";

import type { SaasOverview } from "@reward/shared-types/saas";

import {
  buildPortalHref,
  getPortalViewFromPathname,
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
    billingRuns: [{ id: 1, tenantId: 10 }, { id: 2, tenantId: 20 }],
    topUps: [{ id: 1, tenantId: 10 }],
    disputes: [{ id: 1, tenantId: 10 }, { id: 2, tenantId: 20 }],
    invites: [{ id: 1, tenantId: 10 }],
    tenantLinks: [{ id: 1, parentTenantId: 10, childTenantId: 20 }],
    agentControls: [{ id: 1, tenantId: 10 }, { id: 2, tenantId: 20 }],
    memberships: [{ id: 1, tenantId: 10 }],
    recentUsage: [{ id: 1, projectId: 102 }, { id: 2, projectId: 101 }],
    projectPrizes: [{ id: 1, projectId: 101 }, { id: 2, projectId: 102 }],
    projectObservability: [{ project: { id: 102 } }],
  }) as unknown as SaasOverview;

test("portal helpers normalize pathnames and query state", () => {
  assert.equal(getPortalViewFromPathname(null), "overview");
  assert.equal(getPortalViewFromPathname("/portal/keys/"), "keys");
  assert.equal(getPortalViewFromPathname("/portal/not-a-real-view"), "overview");

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
});

test("resolvePortalSelection falls back to the first valid tenant and project", () => {
  const selection = resolvePortalSelection(createOverview(), 999, 999);

  assert.equal(selection.currentTenantId, 10);
  assert.equal(selection.currentProjectId, 101);
  assert.equal(selection.currentTenantBillingRuns.length, 1);
  assert.equal(selection.currentTenantBillingRuns[0]?.tenantId, 10);
  assert.equal(selection.sandboxProjectId, 101);
  assert.deepEqual(selection.sandboxProjectKeys.map((entry) => entry.id), [1]);
});

test("resolvePortalSelection honors requested ids and keeps project scoped collections aligned", () => {
  const selection = resolvePortalSelection(createOverview(), 10, 102);

  assert.equal(selection.currentTenantId, 10);
  assert.equal(selection.currentProjectId, 102);
  assert.equal(selection.currentProject?.id, 102);
  assert.equal(selection.currentProjectObservability?.project.id, 102);
  assert.deepEqual(selection.currentProjectKeys.map((entry) => entry.id), [3]);
  assert.deepEqual(
    selection.currentProjectUsage.map((entry) => entry.projectId),
    [102],
  );
  assert.deepEqual(
    selection.currentProjectPrizes.map((entry) => entry.projectId),
    [102],
  );
});
