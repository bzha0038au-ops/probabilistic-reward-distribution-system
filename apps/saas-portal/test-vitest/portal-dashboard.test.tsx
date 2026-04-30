import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { cleanupComponents, installTestDom, renderTestComponent } from "../test/test-dom";

const portalDashboardMocks = vi.hoisted(() => ({
  router: {
    refresh: vi.fn(),
    replace: vi.fn(),
  },
  shellProps: null as Record<string, unknown> | null,
  viewContentProps: null as Record<string, unknown> | null,
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: portalDashboardMocks.usePathname,
  useRouter: () => portalDashboardMocks.router,
  useSearchParams: portalDashboardMocks.useSearchParams,
}));

vi.mock("@/lib/navigation", () => ({
  buildLegalPath: (returnTo: string) => `/legal?returnTo=${encodeURIComponent(returnTo)}`,
  buildLoginPath: (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
}));

vi.mock("@/modules/portal/components/portal-dashboard/dashboard-shell", () => ({
  PortalDashboardShell: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
  }) => {
    portalDashboardMocks.shellProps = props as Record<string, unknown>;
    return <section data-testid="dashboard-shell">{children}</section>;
  },
}));

vi.mock("@/modules/portal/components/portal-dashboard/view-content", () => ({
  PortalDashboardViewContent: (props: Record<string, unknown>) => {
    portalDashboardMocks.viewContentProps = props;

    return (
      <div data-testid="dashboard-view-content">
        <button
          type="button"
          onClick={() =>
            (props.setSnippetLanguage as (value: "typescript" | "python") => void)(
              "python",
            )
          }
        >
          switch-language
        </button>
        <button
          type="button"
          onClick={() =>
            (props.navigateWithScope as (
              tenantId: number | null,
              projectId: number | null,
            ) => void)(77, 88)
          }
        >
          navigate-scope
        </button>
        <div data-testid="snippet-language">{String(props.snippetLanguage)}</div>
        <div data-testid="snippet-bootstrap">{String(props.snippetBootstrap)}</div>
        <div data-testid="pending-exports">
          {String(props.hasPendingReportExports)}
        </div>
      </div>
    );
  },
}));

import { PortalDashboard } from "@/modules/portal/components/portal-dashboard";

const teardownDom = installTestDom();
const fetchMock = vi.fn();
const clipboardWriteTextMock = vi.fn();
const documentExecCommandMock = vi.fn();
const locationAssignCalls: string[] = [];
let restoreLocationAssign: (() => void) | null = null;

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: fetchMock,
  writable: true,
});

const createOverview = () =>
  ({
    agentControls: [],
    apiKeys: [],
    billingRuns: [],
    disputes: [],
    invites: [],
    memberships: [],
    projectObservability: [],
    projectPrizes: [],
    projects: [
      {
        environment: "sandbox",
        id: 101,
        name: "Alpha Sandbox",
        slug: "alpha-sandbox",
        tenantId: 10,
      },
      {
        environment: "production",
        id: 102,
        name: "Alpha Prod",
        slug: "alpha-prod",
        tenantId: 10,
      },
    ],
    recentUsage: [],
    tenantLinks: [],
    tenants: [
      {
        billing: {
          baseMonthlyFee: "49",
          budgetPolicy: null,
          currency: "USD",
          drawFee: "0.2",
          planCode: "growth",
          providerCapabilities: {
            billingRunSync: false,
            customerPortal: false,
            localManualCredits: true,
            paymentMethodSetup: false,
            stripeEnabled: false,
            topUpExternalSync: false,
          },
        },
        tenant: {
          id: 10,
          name: "Alpha",
        },
      },
    ],
    topUps: [],
    uiCopy: {
      overview: {
        emptyKeysBody: "Empty keys",
        emptyKeysTitle: "No keys",
        emptyPrizesBody: "Empty prizes",
        emptyPrizesTitle: "No prizes",
        emptyProjectsBody: "Empty projects",
        emptyProjectsTitle: "No projects",
        emptyUsageBody: "Empty usage",
        emptyUsageTitle: "No usage",
      },
    },
  }) as const;

const pendingReportExport = {
  createdAt: "2026-04-30T00:00:00.000Z",
  format: "csv",
  id: 1,
  projectId: 101,
  resource: "saas_usage_events",
  status: "pending",
} as const;

type FormFieldValue =
  | string
  | string[]
  | {
      checked?: boolean;
      type?: string;
      value?: string;
    };

const flushEffects = async (times = 4) => {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const createForm = (entries: Record<string, FormFieldValue>) => {
  const form = document.createElement("form");

  for (const [name, fieldValue] of Object.entries(entries)) {
    const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

    for (const value of values) {
      const input = document.createElement("input");
      input.name = name;

      if (typeof value === "string") {
        input.value = value;
      } else {
        input.type = value.type ?? "text";
        if (input.type === "checkbox") {
          input.checked = Boolean(value.checked);
          input.value = value.value ?? "on";
        } else {
          input.value = value.value ?? "";
        }
      }

      form.appendChild(input);
    }
  }

  return form;
};

const interceptLocationAssign = () => {
  const implSymbol = Object.getOwnPropertySymbols(window.location).find(
    (symbol) => String(symbol) === "Symbol(impl)",
  );

  if (!implSymbol) {
    return () => {};
  }

  const locationImpl = (
    window.location as unknown as Record<PropertyKey, { assign: (url: string) => void }>
  )[implSymbol];
  const originalAssign = locationImpl.assign;
  locationImpl.assign = (url: string) => {
    locationAssignCalls.push(url);
  };

  return () => {
    locationImpl.assign = originalAssign;
  };
};

afterAll(() => {
  teardownDom();
});

afterEach(() => {
  cleanupComponents();
  vi.clearAllMocks();
  vi.useRealTimers();
  portalDashboardMocks.shellProps = null;
  portalDashboardMocks.viewContentProps = null;
  fetchMock.mockReset();
  locationAssignCalls.length = 0;
  restoreLocationAssign?.();
  restoreLocationAssign = null;
});

describe("PortalDashboard", () => {
  beforeEach(() => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/reports");
    portalDashboardMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101&invite=invite-1&billingSetup=ready"),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: documentExecCommandMock,
      writable: true,
    });
    documentExecCommandMock.mockReturnValue(false);
    restoreLocationAssign = interceptLocationAssign();
  });

  it("auto-refreshes the reports view while pending exports are still processing", async () => {
    vi.useFakeTimers();

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[pendingReportExport] as never}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="reports"
      />,
    );

    await flushEffects();

    expect(document.querySelector('[data-testid="pending-exports"]')?.textContent).toBe(
      "true",
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.viewContentProps).toMatchObject({
      hasPendingReportExports: true,
      view: "reports",
    });
  });

  it("updates snippet language state and scopes router navigation to the active portal view", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/docs");

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="docs"
      />,
    );

    await flushEffects();

    expect(document.querySelector('[data-testid="snippet-language"]')?.textContent).toBe(
      "typescript",
    );

    await act(async () => {
      (
        document.querySelectorAll("button")[0] as HTMLButtonElement | undefined
      )?.click();
    });

    expect(document.querySelector('[data-testid="snippet-language"]')?.textContent).toBe(
      "python",
    );
    expect(
      document.querySelector('[data-testid="snippet-bootstrap"]')?.textContent,
    ).toContain("from prize_engine_sdk import PrizeEngineClient");

    portalDashboardMocks.router.refresh.mockClear();

    await act(async () => {
      (
        document.querySelectorAll("button")[1] as HTMLButtonElement | undefined
      )?.click();
    });

    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      "/portal/docs?tenant=77&project=88&invite=invite-1&billingSetup=ready",
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      currentProjectId: 101,
      currentTenantId: 10,
      inviteToken: "invite-1",
    });
  });

  it("queues report exports from the reports view and refreshes overview state", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          id: 11,
          status: "pending",
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="reports"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();

    const form = createForm({
      format: "json",
      fromAt: "2026-04-01T10:00",
      projectScope: "102",
      resource: "saas_usage_events",
      toAt: "2026-04-30T18:30",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleQueueReportExport as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/reports/exports",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      projectId: 102,
      resource: "saas_usage_events",
      format: "json",
      fromAt: new Date("2026-04-01T10:00").toISOString(),
      toAt: new Date("2026-04-30T18:30").toISOString(),
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Report export queued.",
        tone: "success",
      },
    });
  });

  it("validates billing dispute input before posting and surfaces the error banner", async () => {
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="billing"
      />,
    );

    await flushEffects();

    const form = createForm({
      billingRunId: "0",
      description: "Invoice looks wrong",
      reason: "other",
      requestedRefundAmount: "25",
      summary: "Unexpected overage",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateBillingDispute as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Choose the invoice run you want to dispute.",
        tone: "error",
      },
    });
  });

  it("posts billing disputes with tenant-scoped payloads and refreshes after success", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          id: 91,
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="billing"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();

    const form = createForm({
      billingRunId: "44",
      description: "The invoice counted sandbox traffic twice.",
      reason: "usage_mismatch",
      requestedRefundAmount: "199.50",
      summary: "Sandbox double-counted",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateBillingDispute as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/disputes",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      billingRunId: 44,
      description: "The invoice counted sandbox traffic twice.",
      reason: "usage_mismatch",
      requestedRefundAmount: "199.50",
      summary: "Sandbox double-counted",
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Billing dispute submitted.",
        tone: "success",
      },
    });
  });

  it("issues project API keys with scope and expiry payloads, then refreshes the dashboard", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/keys");
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          apiKey: "live-secret-key",
          id: 21,
          label: "Ops key",
          projectId: 102,
          scopes: ["reward:write", "ledger:read"],
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={102}
        requestedTenantId={10}
        view="keys"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();

    const form = createForm({
      label: "Ops key",
      scopes: ["reward:write", "ledger:read"],
      expiresAt: "2026-05-30T18:00",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleIssueKey as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/keys",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      label: "Ops key",
      scopes: ["reward:write", "ledger:read"],
      expiresAt: "2026-05-30T18:00",
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "API key issued.",
        tone: "success",
      },
      issuedKey: expect.objectContaining({
        apiKey: "live-secret-key",
      }),
    });
  });

  it("issues a sandbox starter key and routes the portal back onto the sandbox project", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/keys");
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          apiKey: "sandbox-secret-key",
          id: 22,
          label: "alpha-sandbox-starter",
          projectId: 101,
          scopes: [
            "catalog:read",
            "fairness:read",
            "reward:write",
            "ledger:read",
          ],
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={102}
        requestedTenantId={10}
        view="keys"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();
    portalDashboardMocks.router.replace.mockClear();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleIssueSandboxStarterKey as () => Promise<void>
      )();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/101/keys",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      label: "alpha-sandbox-starter",
      scopes: [
        "catalog:read",
        "fairness:read",
        "reward:write",
        "ledger:read",
      ],
    });
    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      "/portal/keys?tenant=10&project=101&invite=invite-1&billingSetup=ready",
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("rotates and revokes project keys through the portal mutation handlers", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/keys");
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={102}
        requestedTenantId={10}
        view="keys"
      />,
    );

    await flushEffects();

    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          issuedKey: {
            apiKey: "rotated-key",
            id: 88,
            projectId: 102,
          },
        },
      }),
      ok: true,
      status: 200,
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleRotateKey as (
          apiKey: { id: number; label: string },
        ) => Promise<void>
      )({
        id: 8,
        label: "Server key",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/keys/8/rotate",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      reason: "portal_rotation",
      overlapSeconds: 3600,
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    portalDashboardMocks.router.refresh.mockClear();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 8,
        },
      }),
      ok: true,
      status: 200,
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleRevokeKey as (
          apiKey: { id: number; label: string },
        ) => Promise<void>
      )({
        id: 8,
        label: "Server key",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/keys/8/revoke",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      reason: "portal_revocation",
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("creates, updates, and archives prizes with project-scoped payloads", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/prizes");
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={102}
        requestedTenantId={10}
        view="prizes"
      />,
    );

    await flushEffects();

    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 51,
        },
      }),
      ok: true,
      status: 200,
    });

    const createFormElement = createForm({
      name: "Starter Pack",
      stock: "12",
      weight: "3",
      rewardAmount: "25.00",
      isActive: { type: "checkbox", checked: true },
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreatePrize as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: createFormElement,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/prizes",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      name: "Starter Pack",
      stock: 12,
      weight: 3,
      rewardAmount: "25.00",
      isActive: true,
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    portalDashboardMocks.router.refresh.mockClear();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 51,
        },
      }),
      ok: true,
      status: 200,
    });

    const updateFormElement = createForm({
      name: "Starter Pack Plus",
      stock: "18",
      weight: "5",
      rewardAmount: "30.00",
      isActive: { type: "checkbox", checked: false },
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleUpdatePrize as (
          event: React.FormEvent<HTMLFormElement>,
          prizeId: number,
        ) => Promise<void>
      )(
        {
          currentTarget: updateFormElement,
          preventDefault() {},
        } as React.FormEvent<HTMLFormElement>,
        51,
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/prizes/51",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      name: "Starter Pack Plus",
      stock: 18,
      weight: 5,
      rewardAmount: "30.00",
      isActive: false,
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    portalDashboardMocks.router.refresh.mockClear();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 51,
        },
      }),
      ok: true,
      status: 200,
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleDeletePrize as (
          prizeId: number,
        ) => Promise<void>
      )(51);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/projects/102/prizes/51",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("validates budget policy thresholds and patches tenant billing controls on success", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/billing");
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="billing"
      />,
    );

    await flushEffects();

    const invalidForm = createForm({
      monthlyBudget: "500",
      alertThresholdPct: "not-a-number",
      hardCap: "600",
      alertWebhookUrl: "https://hooks.example.com/portal",
      alertWebhookSecret: "secret",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleUpdateBudgetPolicy as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: invalidForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Alert threshold must be a number.",
        tone: "error",
      },
    });

    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          ok: true,
        },
      }),
      ok: true,
      status: 200,
    });
    portalDashboardMocks.router.refresh.mockClear();

    const validForm = createForm({
      monthlyBudget: "500",
      alertThresholdPct: "85",
      hardCap: "650",
      alertEmailEnabled: { type: "checkbox", checked: true },
      alertWebhookUrl: "https://hooks.example.com/portal",
      alertWebhookSecret: "rotated-secret",
      clearAlertWebhook: { type: "checkbox", checked: false },
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleUpdateBudgetPolicy as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: validForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/billing/budget-policy",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      monthlyBudget: "500",
      alertThresholdPct: 85,
      hardCap: "650",
      alertEmailEnabled: true,
      alertWebhookUrl: "https://hooks.example.com/portal",
      alertWebhookSecret: "rotated-secret",
      clearAlertWebhook: false,
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Billing budget controls updated.",
        tone: "success",
      },
    });
  });

  it("creates a tenant workspace, stores the starter key, and redirects into the sandbox project", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal");
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          issuedKey: {
            apiKey: "tenant-bootstrap-key",
            projectId: 701,
          },
          tenant: {
            id: 77,
            bootstrap: {
              sandboxProject: {
                id: 701,
              },
            },
          },
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="overview"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();
    portalDashboardMocks.router.replace.mockClear();

    const form = createForm({
      name: "Northwind",
      billingEmail: "billing@northwind.example",
    });

    await act(async () => {
      await (
        portalDashboardMocks.shellProps?.handleCreateTenant as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      name: "Northwind",
      billingEmail: "billing@northwind.example",
    });
    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      "/portal?tenant=77&project=701&billingSetup=ready",
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Workspace created. Your sandbox starter key is ready.",
        tone: "success",
      },
      issuedKey: expect.objectContaining({
        apiKey: "tenant-bootstrap-key",
      }),
    });
  });

  it("redirects create-tenant mutations to the legal flow when the backend requires pending legal acceptance", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        error: {
          code: API_ERROR_CODES.LEGAL_ACCEPTANCE_REQUIRED,
          message: "Accept legal first.",
        },
      }),
      ok: false,
      status: 403,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    const form = createForm({
      billingEmail: "billing@example.com",
      name: "Beta Workspace",
    });

    await act(async () => {
      await (
        portalDashboardMocks.shellProps?.handleCreateTenant as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      `/legal?returnTo=${encodeURIComponent(
        "/portal/tenants?tenant=10&project=101&invite=invite-1&billingSetup=ready",
      )}`,
    );
    expect(portalDashboardMocks.router.refresh).not.toHaveBeenCalled();
    expect(locationAssignCalls).toEqual([]);
  });

  it("redirects create-tenant mutations back to login when the backend returns an unauthorized status", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        error: {
          message: "Unauthorized.",
        },
      }),
      ok: false,
      status: 401,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    const form = createForm({
      billingEmail: "billing@example.com",
      name: "Beta Workspace",
    });

    await act(async () => {
      await (
        portalDashboardMocks.shellProps?.handleCreateTenant as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: form,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(locationAssignCalls).toEqual([
      `/login?returnTo=${encodeURIComponent(
        "/portal/tenants?tenant=10&project=101&invite=invite-1&billingSetup=ready",
      )}`,
    ]);
    expect(portalDashboardMocks.router.replace).not.toHaveBeenCalled();
    expect(portalDashboardMocks.router.refresh).not.toHaveBeenCalled();
  });

  it("creates and deletes tenant memberships through tenant-scoped handlers", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 19,
        },
      }),
      ok: true,
      status: 200,
    });

    const saveForm = createForm({
      adminEmail: "ops@example.com",
      role: "tenant_operator",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleSaveMembership as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: saveForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/memberships",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      adminEmail: "ops@example.com",
      role: "tenant_operator",
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    portalDashboardMocks.router.refresh.mockClear();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 19,
        },
      }),
      ok: true,
      status: 200,
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleDeleteMembership as (
          membership: {
            adminDisplayName: string | null;
            adminEmail: string | null;
            id: number;
          },
        ) => Promise<void>
      )({
        adminDisplayName: null,
        adminEmail: "ops@example.com",
        id: 19,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/memberships/19",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Removed ops@example.com from tenant access.",
        tone: "success",
      },
    });
  });

  it("creates and revokes tenant invites with tenant-scoped mutations", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          invite: {
            email: "invitee@example.com",
            id: 55,
          },
          inviteUrl: "https://portal.example/invite/55",
        },
      }),
      ok: true,
      status: 200,
    });

    const inviteForm = createForm({
      email: "invitee@example.com",
      role: "agent_manager",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateTenantInvite as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: inviteForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/invites",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      email: "invitee@example.com",
      role: "agent_manager",
    });
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    portalDashboardMocks.router.refresh.mockClear();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          id: 55,
        },
      }),
      ok: true,
      status: 200,
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleRevokeInvite as (
          invite: {
            email: string;
            id: number;
          },
        ) => Promise<void>
      )({
        email: "invitee@example.com",
        id: 55,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/invites/55/revoke",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Revoked invite for invitee@example.com.",
        tone: "success",
      },
    });
  });

  it("accepts tenant invites and strips the invite token from the scoped URL", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          ok: true,
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();
    portalDashboardMocks.router.refresh.mockClear();
    portalDashboardMocks.router.replace.mockClear();

    await act(async () => {
      await (
        portalDashboardMocks.shellProps?.handleAcceptInvite as () => Promise<void>
      )();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/invites/accept",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")),
    ).toEqual({
      token: "invite-1",
    });
    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      "/portal/tenants?tenant=10&project=101&billingSetup=ready",
    );
    expect(portalDashboardMocks.router.refresh).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Tenant invite accepted.",
        tone: "success",
      },
    });
  });

  it("copies the sandbox snippet when clipboard access is available", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/docs");

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="docs"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopySandboxSnippet as () => Promise<void>
      )();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    expect(String(clipboardWriteTextMock.mock.calls[0]?.[0] ?? "")).toContain(
      "@reward/prize-engine-sdk",
    );
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Copied the sandbox SDK snippet.",
        tone: "success",
      },
    });
  });

  it("copies tenant invite links after an invite has been created", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          invite: {
            email: "invitee@example.com",
            id: 55,
          },
          inviteUrl: "https://portal.example/invite/55",
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    const inviteForm = createForm({
      email: "invitee@example.com",
      role: "agent_manager",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateTenantInvite as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: inviteForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });
    await flushEffects();

    clipboardWriteTextMock.mockClear();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopyInviteLink as () => Promise<void>
      )();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://portal.example/invite/55",
    );
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Copied the tenant invite link.",
        tone: "success",
      },
    });
  });

  it("surfaces sandbox snippet copy failures when neither clipboard API nor legacy copy succeeds", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/docs");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="docs"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopySandboxSnippet as () => Promise<void>
      )();
    });

    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Failed to copy the sandbox SDK snippet.",
        tone: "error",
      },
    });
  });

  it("falls back to legacy copy for sandbox snippets when clipboard writes fail", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/docs");
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("Clipboard denied."));
    documentExecCommandMock.mockReturnValueOnce(true);

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="docs"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopySandboxSnippet as () => Promise<void>
      )();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    expect(documentExecCommandMock).toHaveBeenCalledWith("copy");
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Copied the sandbox SDK snippet.",
        tone: "success",
      },
    });
  });

  it("surfaces clipboard write failures for sandbox snippet copy", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/docs");
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("Clipboard denied."));

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="docs"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopySandboxSnippet as () => Promise<void>
      )();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Failed to copy the sandbox SDK snippet.",
        tone: "error",
      },
    });
  });

  it("surfaces clipboard write failures for tenant invite link copy", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          invite: {
            email: "invitee@example.com",
            id: 56,
          },
          inviteUrl: "https://portal.example/invite/56",
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    const inviteForm = createForm({
      email: "invitee@example.com",
      role: "agent_manager",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateTenantInvite as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: inviteForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });
    await flushEffects();

    clipboardWriteTextMock.mockReset();
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("Clipboard denied."));

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCopyInviteLink as () => Promise<void>
      )();
    });

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://portal.example/invite/56",
    );
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Failed to copy the tenant invite link.",
        tone: "error",
      },
    });
  });

  it("opens external billing URLs after the portal billing redirect request succeeds", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/billing");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        data: {
          url: "https://billing.example/session",
        },
      }),
      ok: true,
      status: 200,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="billing"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleBillingRedirect as (
          path: string,
          successMessage: string,
        ) => Promise<void>
      )(
        "/portal/saas/tenants/10/billing/portal",
        "Opening Stripe customer portal…",
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/portal/saas/tenants/10/billing/portal",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(locationAssignCalls).toEqual(["https://billing.example/session"]);
    expect(portalDashboardMocks.shellProps).toMatchObject({
      banner: {
        message: "Opening Stripe customer portal…",
        tone: "success",
      },
    });
  });

  it("redirects post mutations to the legal flow when the backend requires pending legal acceptance", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        error: {
          code: API_ERROR_CODES.LEGAL_ACCEPTANCE_REQUIRED,
          message: "Accept legal first.",
        },
      }),
      ok: false,
      status: 403,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    const inviteForm = createForm({
      email: "invitee@example.com",
      role: "agent_manager",
    });

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleCreateTenantInvite as (
          event: React.FormEvent<HTMLFormElement>,
        ) => Promise<void>
      )({
        currentTarget: inviteForm,
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });

    expect(portalDashboardMocks.router.replace).toHaveBeenCalledWith(
      `/legal?returnTo=${encodeURIComponent(
        "/portal/tenants?tenant=10&project=101&invite=invite-1&billingSetup=ready",
      )}`,
    );
    expect(locationAssignCalls).toEqual([]);
  });

  it("redirects unauthorized delete mutations back to the login flow", async () => {
    portalDashboardMocks.usePathname.mockReturnValue("/portal/tenants");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        error: {
          code: API_ERROR_CODES.UNAUTHORIZED,
          message: "Unauthorized.",
        },
      }),
      ok: false,
      status: 401,
    });

    renderTestComponent(
      <PortalDashboard
        billingSetupStatus="ready"
        billingInsights={null}
        error={null}
        inviteToken="invite-1"
        overview={createOverview() as never}
        reportExports={[]}
        reportsError={null}
        requestedProjectId={101}
        requestedTenantId={10}
        view="tenants"
      />,
    );

    await flushEffects();

    await act(async () => {
      await (
        portalDashboardMocks.viewContentProps?.handleDeleteMembership as (
          membership: {
            adminDisplayName: string | null;
            adminEmail: string | null;
            id: number;
          },
        ) => Promise<void>
      )({
        adminDisplayName: null,
        adminEmail: "ops@example.com",
        id: 19,
      });
    });

    expect(locationAssignCalls).toEqual([
      `/login?returnTo=${encodeURIComponent(
        "/portal/tenants?tenant=10&project=101&invite=invite-1&billingSetup=ready",
      )}`,
    ]);
    expect(portalDashboardMocks.router.refresh).not.toHaveBeenCalled();
  });
});
