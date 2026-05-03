import { describe, expect, it, vi } from "vitest";

import type { SaasOverview } from "@reward/shared-types/saas";

const routePageMocks = vi.hoisted(() => ({
  apiRequestServer: vi.fn(),
  requireCurrentUserSession: vi.fn(),
}));

vi.mock("@/lib/api/server", () => ({
  apiRequestServer: routePageMocks.apiRequestServer,
}));

vi.mock("@/lib/current-user-session", () => ({
  requireCurrentUserSession: routePageMocks.requireCurrentUserSession,
}));

vi.mock("@/modules/portal/components/portal-dashboard", () => ({
  PortalDashboard: (props: unknown) => (
    <div data-props={JSON.stringify(props)} />
  ),
}));

import { PortalRoutePage } from "@/modules/portal/components/portal-route-page";

const createOverview = () =>
  ({
    tenants: [{ tenant: { id: 10, name: "Alpha" } }],
    projects: [
      { id: 101, tenantId: 10, environment: "sandbox", name: "Alpha Sandbox" },
    ],
    apiKeys: [],
    billingRuns: [],
    topUps: [],
    disputes: [],
    invites: [],
    tenantLinks: [],
    agentControls: [],
    memberships: [],
    recentUsage: [],
    projectPrizes: [],
    projectObservability: [],
  }) as unknown as SaasOverview;

describe("PortalRoutePage", () => {
  it("loads overview, billing, and report export data for the reports view", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          message: "Reports unavailable.",
        },
      });

    const element = await PortalRoutePage({
      view: "reports",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
        invite: "invite-1",
        billingSetup: "ready",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo:
        "/portal/reports?tenant=10&project=101&invite=invite-1&billingSetup=ready",
    });
    expect(
      routePageMocks.apiRequestServer.mock.calls.map(([path]) => path),
    ).toEqual([
      "/portal/saas/overview",
      "/portal/saas/tenants/10/billing/insights",
      "/portal/saas/tenants/10/reports/exports",
    ]);
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "reports",
        requestedTenantId: 10,
        requestedProjectId: 101,
        inviteToken: "invite-1",
        billingSetupStatus: "ready",
        reportsError: "Reports unavailable.",
        reportExports: null,
        error: null,
      },
    );
  });

  it("passes overview failures through without fetching tenant-scoped data", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer.mockResolvedValueOnce({
      ok: false,
      error: {
        message: "Overview unavailable.",
      },
    });

    const element = await PortalRoutePage({
      view: "overview",
      searchParams: Promise.resolve(undefined),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal",
    });
    expect(routePageMocks.apiRequestServer).toHaveBeenCalledTimes(1);
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "overview",
        subview: null,
        overview: null,
        billingInsights: null,
        reportExports: null,
        reportsError: null,
        error: "Overview unavailable.",
      },
    );
  });

  it("preserves nested overview routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "overview",
      subview: "snippet",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/overview/snippet?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "overview",
        subview: "snippet",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested usage routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "usage",
      subview: "quota",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/usage/quota?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "usage",
        subview: "quota",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested tenants routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "tenants",
      subview: "invites",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/tenants/invites?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "tenants",
        subview: "invites",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested keys routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "keys",
      subview: "handoff",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/keys/handoff?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "keys",
        subview: "handoff",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested reports routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [],
      });

    const element = await PortalRoutePage({
      view: "reports",
      subview: "jobs",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/reports/jobs?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "reports",
        subview: "jobs",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested docs routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "docs",
      subview: "snippet",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/docs/snippet?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "docs",
        subview: "snippet",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested billing routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "billing",
      subview: "controls",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/billing/controls?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "billing",
        subview: "controls",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });

  it("preserves nested prizes routes in returnTo and props", async () => {
    routePageMocks.requireCurrentUserSession.mockResolvedValue(undefined);
    routePageMocks.apiRequestServer
      .mockResolvedValueOnce({
        ok: true,
        data: createOverview(),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          currency: "USD",
          invoicePreview: null,
          paymentMethodStatus: "ready",
        },
      });

    const element = await PortalRoutePage({
      view: "prizes",
      subview: "envelope",
      searchParams: Promise.resolve({
        tenant: "10",
        project: "101",
      }),
    });

    expect(routePageMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      returnTo: "/portal/prizes/envelope?tenant=10&project=101",
    });
    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "prizes",
        subview: "envelope",
        requestedTenantId: 10,
        requestedProjectId: 101,
      },
    );
  });
});
