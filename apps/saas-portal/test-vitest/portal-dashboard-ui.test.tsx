import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import React, { act, useState } from "react";
import { defaultSaasOverviewUiCopy } from "@reward/shared-types/saas";

import { cleanupComponents, installTestDom, renderTestComponent } from "../test/test-dom";
import { PortalDashboardBillingPage } from "@/modules/portal/components/portal-dashboard/billing-page";
import { PortalDashboardShell } from "@/modules/portal/components/portal-dashboard/dashboard-shell";
import { PortalDashboardOverviewPage } from "@/modules/portal/components/portal-dashboard/overview-page";
import {
  buildSandboxPythonSnippet,
  buildSandboxTypeScriptSnippet,
  type SnippetLanguage,
} from "@/modules/portal/components/portal-dashboard/shared";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const teardownDom = installTestDom();

const tenantEntries = [
  {
    apiKeyCount: 0,
    billing: {
      planCode: "starter",
      providerCapabilities: {
        billingRunSync: false,
        customerPortal: false,
        localManualCredits: true,
        paymentMethodSetup: false,
        stripeEnabled: false,
        topUpExternalSync: false,
      },
    },
    drawCount30d: 0,
    projectCount: 2,
    tenant: {
      id: 10,
      name: "Alpha",
      onboardedAt: null,
      slug: "alpha",
      status: "active",
    },
  },
  {
    apiKeyCount: 0,
    billing: {
      planCode: "starter",
      providerCapabilities: {
        billingRunSync: false,
        customerPortal: false,
        localManualCredits: true,
        paymentMethodSetup: false,
        stripeEnabled: false,
        topUpExternalSync: false,
      },
    },
    drawCount30d: 0,
    projectCount: 1,
    tenant: {
      id: 20,
      name: "Beta",
      onboardedAt: null,
      slug: "beta",
      status: "active",
    },
  },
] as const;

const projects = [
  {
    currency: "USD",
    drawCost: "0.00",
    environment: "production",
    id: 101,
    name: "Alpha Prod",
    slug: "alpha-prod",
    tenantId: 10,
  },
  {
    currency: "USD",
    drawCost: "0.00",
    environment: "sandbox",
    id: 102,
    name: "Alpha Sandbox",
    slug: "alpha-sandbox",
    tenantId: 10,
  },
  {
    currency: "RWDT",
    drawCost: "0.00",
    environment: "sandbox",
    id: 201,
    name: "Beta Sandbox",
    slug: "beta-sandbox",
    tenantId: 20,
  },
] as const;

const queryButtonByText = (label: string) =>
  Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;

afterAll(() => {
  teardownDom();
});

afterEach(() => {
  cleanupComponents();
  vi.clearAllMocks();
});

describe("Portal dashboard UI", () => {
  it("switches the overview snippet between Python and TypeScript", async () => {
    function OverviewHarness() {
      const [snippetLanguage, setSnippetLanguage] =
        useState<SnippetLanguage>("typescript");
      const sandboxSnippet =
        snippetLanguage === "typescript"
          ? buildSandboxTypeScriptSnippet({
              apiKey: null,
              projectSlug: "beta-sandbox",
            })
          : buildSandboxPythonSnippet({
              apiKey: null,
              projectSlug: "beta-sandbox",
            });

      return (
        <PortalDashboardOverviewPage
          currentHrefState={{
            projectId: 201,
            tenantId: 20,
          }}
          currentProjectKeys={[]}
          currentProjectPrizes={[]}
          currentProjectUsage={[]}
          currentTenant={tenantEntries[1]}
          currentTenantBillingRuns={[]}
          handleCopySandboxSnippet={() => {}}
          handleIssueSandboxStarterKey={() => {}}
          handleSelectSandboxProject={() => {}}
          isPending={false}
          latestSandboxSecret={null}
          overviewUiCopy={defaultSaasOverviewUiCopy.overview}
          sandboxProject={projects[2]}
          sandboxProjectKeys={[]}
          sandboxProjectPrizes={[]}
          sandboxSnippet={sandboxSnippet}
          setSnippetLanguage={setSnippetLanguage}
          snippetLanguage={snippetLanguage}
          tenantEntries={tenantEntries}
        />
      );
    }

    renderTestComponent(<OverviewHarness />);

    expect(document.querySelector("code")?.textContent).toContain(
      'import {\n  createPrizeEngineClient,',
    );
    expect(document.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "TypeScript",
    );

    await act(async () => {
      queryButtonByText("Python")?.click();
    });

    expect(document.querySelector("code")?.textContent).toContain(
      "from prize_engine_sdk import PrizeEngineClient",
    );
    expect(document.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "Python",
    );

    await act(async () => {
      queryButtonByText("TypeScript")?.click();
    });

    expect(document.querySelector("code")?.textContent).toContain(
      'import {\n  createPrizeEngineClient,',
    );
    expect(document.querySelector("code")?.textContent).not.toContain(
      "from prize_engine_sdk import PrizeEngineClient",
    );
    expect(document.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "TypeScript",
    );
  });

  it("updates the selected scope when the tenant picker changes", async () => {
    const navigateWithScope = vi.fn();

    function ShellHarness() {
      const [scope, setScope] = useState({
        projectId: 201,
        tenantId: 20,
      });
      const currentTenant =
        tenantEntries.find((entry) => entry.tenant.id === scope.tenantId) ?? null;
      const currentProject =
        projects.find((project) => project.id === scope.projectId) ?? null;
      const tenantProjects = projects.filter(
        (project) => project.tenantId === scope.tenantId,
      );

      return (
        <PortalDashboardShell
          banner={null}
          billingSetupStatus={null}
          currentProject={currentProject}
          currentProjectId={scope.projectId}
          currentTenant={currentTenant}
          currentTenantId={scope.tenantId}
          currentViewMeta={{
            description: "Scope test",
            label: "Overview",
            title: "Scope test",
          }}
          error={null}
          handleAcceptInvite={() => {}}
          handleCreateTenant={(event) => {
            event.preventDefault();
          }}
          inviteToken={null}
          isHydrated={true}
          isPending={false}
          issuedKey={null}
          navigateWithScope={(tenantId, projectId) => {
            navigateWithScope(tenantId, projectId);
            setScope({
              projectId: projectId ?? 0,
              tenantId: tenantId ?? 0,
            });
          }}
          overview={{
            summary: {
              apiKeyCount: 0,
              billableTenantCount: 0,
              drawCount30d: 0,
              playerCount: 0,
              projectCount: projects.length,
              tenantCount: tenantEntries.length,
            },
          }}
          projects={projects}
          rotatedKey={null}
          tenantEntries={tenantEntries}
          tenantProjects={tenantProjects}
        >
          <div>content</div>
        </PortalDashboardShell>
      );
    }

    renderTestComponent(<ShellHarness />);

    const tenantSelect = document.querySelector("#tenantId") as
      | HTMLSelectElement
      | null;
    const projectSelect = document.querySelector("#projectId") as
      | HTMLSelectElement
      | null;

    expect(tenantSelect?.value).toBe("20");
    expect(projectSelect?.value).toBe("201");

    await act(async () => {
      if (tenantSelect) {
        tenantSelect.value = "10";
        tenantSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
    });

    expect(navigateWithScope).toHaveBeenCalledWith(10, 101);
    expect(tenantSelect?.value).toBe("10");
    expect(projectSelect?.value).toBe("101");
  });

  it("hides Stripe billing actions and surfaces local credit context in manual-credit mode", () => {
    renderTestComponent(
      <PortalDashboardBillingPage
        billingCurrency="USD"
        billingInsights={{
          alerts: {
            forecast30dExceeded: false,
            forecast7dExceeded: false,
            hardCapReached: false,
            thresholdExceeded: false,
          },
          budgetPolicy: {
            alertEmailEnabled: true,
            alertThresholdPct: 80,
            alertWebhookConfigured: false,
            alertWebhookUrl: null,
            hardCap: "1800.00",
            monthlyBudget: "1500.00",
            state: {
              forecast30dAlertedAt: null,
              forecast7dAlertedAt: null,
              hardCapAlertedAt: null,
              hardCapReachedAt: null,
              month: "2026-04",
              thresholdAlertedAt: null,
            },
          },
          currency: "USD",
          dailyReport: [],
          forecasts: {
            trailing30d: {
              dailyRunRate: "0.00",
              exceedsBudget: false,
              projectedTotalAmount: "0.00",
              projectedUsageAmount: "0.00",
              trailingDays: 30,
            },
            trailing7d: {
              dailyRunRate: "0.00",
              exceedsBudget: false,
              projectedTotalAmount: "0.00",
              projectedUsageAmount: "0.00",
              trailingDays: 7,
            },
          },
          summary: {
            availableCreditAmount: "300.00",
            baseMonthlyFee: "0.00",
            budgetThresholdAmount: "1440.00",
            currentTotalAmount: "220.00",
            currentUsageAmount: "220.00",
            effectiveBudgetAmount: "1800.00",
            hardCap: "1800.00",
            hardCapReached: false,
            monthlyBudget: "1500.00",
            remainingBudgetAmount: "1580.00",
            remainingHardCapAmount: "1580.00",
            thresholdBreached: false,
            trailing30dUsageAmount: "220.00",
            trailing7dUsageAmount: "220.00",
          },
          tenantId: 10,
          window: {
            daysElapsed: 12,
            daysRemaining: 18,
            generatedAt: "2026-04-30T00:00:00.000Z",
            monthEnd: "2026-05-01T00:00:00.000Z",
            monthStart: "2026-04-01T00:00:00.000Z",
          },
        }}
        currentBudgetPolicy={null}
        currentTenant={tenantEntries[0] as never}
        currentTenantBillingDisputes={[]}
        currentTenantBillingRuns={[]}
        currentTenantId={10}
        currentTenantTopUps={[
          {
            amount: "300.00",
            createdAt: "2026-04-30T00:00:00.000Z",
            currency: "USD",
            id: 1,
            source: "local_manual_credit",
            status: "applied",
            tenantId: 10,
          },
        ] as never}
        handleBillingRedirect={() => {}}
        handleCreateBillingDispute={(event) => {
          event.preventDefault();
        }}
        handleUpdateBudgetPolicy={(event) => {
          event.preventDefault();
        }}
        isPending={false}
      />,
    );

    expect(queryButtonByText("Open billing portal")).toBeUndefined();
    expect(queryButtonByText("Add payment method")).toBeUndefined();
    expect(document.body.textContent).toContain(
      "Stripe payment actions are disabled in this environment.",
    );
    expect(document.body.textContent).toContain(
      "Budget 1500.00 + credits 300.00",
    );
    expect(document.body.textContent).toContain("Local manual credit");
  });
});
