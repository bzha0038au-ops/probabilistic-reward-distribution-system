import type {
  SaasApiKey,
  SaasTenantInvite,
  SaasTenantMembership,
} from "@reward/shared-types/saas";

import type {
  PortalBillingSubview,
  PortalDocsSubview,
  PortalHrefState,
  PortalKeysSubview,
  PortalOverviewSubview,
  PortalPrizesSubview,
  PortalReportsSubview,
  PortalSelection,
  PortalSubview,
  PortalTenantsSubview,
  PortalUsageSubview,
  PortalView,
} from "@/modules/portal/lib/portal";

import { PortalDashboardBillingPage } from "./billing-page";
import { PortalDashboardDocsPage } from "./docs-page";
import { PortalDashboardKeysPage } from "./keys-page";
import { PortalDashboardOverviewPage } from "./overview-page";
import { PortalDashboardPrizesPage } from "./prizes-page";
import { PortalDashboardReportsPage } from "./reports-page";
import { PortalDashboardTenantsPage } from "./tenants-page";
import { PortalDashboardUsagePage } from "./usage-page";
import type { OverviewUiCopy, SnippetLanguage } from "./shared";

type ViewContentProps = {
  agentControls: PortalSelection["agentControls"];
  billingCurrency: string;
  billingInsights: PortalSelection["currentTenant"] extends never
    ? never
    : Parameters<typeof PortalDashboardBillingPage>[0]["billingInsights"];
  createdInvite: Parameters<
    typeof PortalDashboardTenantsPage
  >[0]["createdInvite"];
  currentBudgetPolicy: Parameters<
    typeof PortalDashboardBillingPage
  >[0]["currentBudgetPolicy"];
  currentHrefState: PortalHrefState;
  currentProject: PortalSelection["currentProject"];
  currentProjectId: number | null;
  currentProjectKeys: PortalSelection["currentProjectKeys"];
  currentProjectObservability: PortalSelection["currentProjectObservability"];
  currentProjectPrizes: PortalSelection["currentProjectPrizes"];
  currentProjectUsage: PortalSelection["currentProjectUsage"];
  currentTenant: PortalSelection["currentTenant"];
  currentTenantBillingDisputes: PortalSelection["currentTenantBillingDisputes"];
  currentTenantBillingRuns: PortalSelection["currentTenantBillingRuns"];
  currentTenantId: number | null;
  currentTenantInvites: PortalSelection["currentTenantInvites"];
  currentTenantLinks: PortalSelection["currentTenantLinks"];
  currentTenantMemberships: PortalSelection["currentTenantMemberships"];
  currentTenantTopUps: PortalSelection["currentTenantTopUps"];
  handleBillingRedirect: (path: string, successMessage: string) => void;
  handleCopyInviteLink: () => void | Promise<void>;
  handleCopySandboxSnippet: () => void | Promise<void>;
  handleCreateBillingDispute: Parameters<
    typeof PortalDashboardBillingPage
  >[0]["handleCreateBillingDispute"];
  handleCreatePrize: Parameters<
    typeof PortalDashboardPrizesPage
  >[0]["handleCreatePrize"];
  handleCreateTenantInvite: Parameters<
    typeof PortalDashboardTenantsPage
  >[0]["handleCreateTenantInvite"];
  handleDeleteMembership: (membership: SaasTenantMembership) => void;
  handleDeletePrize: (prizeId: number) => void;
  handleIssueKey: Parameters<
    typeof PortalDashboardKeysPage
  >[0]["handleIssueKey"];
  handleIssueSandboxStarterKey: () => void | Promise<void>;
  handleQueueReportExport: Parameters<
    typeof PortalDashboardReportsPage
  >[0]["handleQueueReportExport"];
  handleRevokeInvite: (invite: SaasTenantInvite) => void;
  handleRevokeKey: (apiKey: SaasApiKey) => void;
  handleRotateKey: (apiKey: SaasApiKey) => void;
  handleSaveMembership: Parameters<
    typeof PortalDashboardTenantsPage
  >[0]["handleSaveMembership"];
  handleSelectSandboxProject: () => void;
  handleUpdateBudgetPolicy: Parameters<
    typeof PortalDashboardBillingPage
  >[0]["handleUpdateBudgetPolicy"];
  handleUpdatePrize: Parameters<
    typeof PortalDashboardPrizesPage
  >[0]["handleUpdatePrize"];
  hasPendingReportExports: boolean;
  isHydrated: boolean;
  isPending: boolean;
  latestSandboxSecret: string | null;
  navigateWithScope: (
    nextTenantId: number | null,
    nextProjectId: number | null,
  ) => void;
  overviewUiCopy: OverviewUiCopy;
  projects: PortalSelection["projects"];
  refreshOverview: () => void;
  reportsError: string | null;
  sandboxProject: PortalSelection["sandboxProject"];
  sandboxProjectId: number | null;
  sandboxProjectKeys: PortalSelection["sandboxProjectKeys"];
  sandboxProjectPrizes: PortalSelection["sandboxProjectPrizes"];
  sandboxSnippet: string;
  setSnippetLanguage: (language: SnippetLanguage) => void;
  snippetBootstrap: string;
  snippetLanguage: SnippetLanguage;
  subview: PortalSubview | null;
  tenantEntries: PortalSelection["tenantEntries"];
  tenantProjects: PortalSelection["tenantProjects"];
  view: PortalView;
  visibleReportExports: Parameters<
    typeof PortalDashboardReportsPage
  >[0]["visibleReportExports"];
};

export function PortalDashboardViewContent({
  agentControls,
  billingCurrency,
  billingInsights,
  createdInvite,
  currentBudgetPolicy,
  currentHrefState,
  currentProject,
  currentProjectId,
  currentProjectKeys,
  currentProjectObservability,
  currentProjectPrizes,
  currentProjectUsage,
  currentTenant,
  currentTenantBillingDisputes,
  currentTenantBillingRuns,
  currentTenantId,
  currentTenantInvites,
  currentTenantLinks,
  currentTenantMemberships,
  currentTenantTopUps,
  handleBillingRedirect,
  handleCopyInviteLink,
  handleCopySandboxSnippet,
  handleCreateBillingDispute,
  handleCreatePrize,
  handleCreateTenantInvite,
  handleDeleteMembership,
  handleDeletePrize,
  handleIssueKey,
  handleIssueSandboxStarterKey,
  handleQueueReportExport,
  handleRevokeInvite,
  handleRevokeKey,
  handleRotateKey,
  handleSaveMembership,
  handleSelectSandboxProject,
  handleUpdateBudgetPolicy,
  handleUpdatePrize,
  hasPendingReportExports,
  isHydrated,
  isPending,
  latestSandboxSecret,
  navigateWithScope,
  overviewUiCopy,
  projects,
  refreshOverview,
  reportsError,
  sandboxProject,
  sandboxProjectId,
  sandboxProjectKeys,
  sandboxProjectPrizes,
  sandboxSnippet,
  setSnippetLanguage,
  snippetBootstrap,
  snippetLanguage,
  subview,
  tenantEntries,
  tenantProjects,
  view,
  visibleReportExports,
}: ViewContentProps) {
  const overviewSubview: PortalOverviewSubview | null =
    view === "overview" &&
    (subview === "launcher" ||
      subview === "sandbox" ||
      subview === "snippet" ||
      subview === null)
      ? subview
      : null;
  const usageSubview: PortalUsageSubview | null =
    view === "usage" &&
    (subview === "overview" || subview === "quota" || subview === null)
      ? subview
      : null;
  const tenantsSubview: PortalTenantsSubview | null =
    view === "tenants" &&
    (subview === "directory" ||
      subview === "access" ||
      subview === "invites" ||
      subview === "risk" ||
      subview === null)
      ? subview
      : null;
  const keysSubview: PortalKeysSubview | null =
    view === "keys" &&
    (subview === "management" ||
      subview === "guardrails" ||
      subview === "handoff" ||
      subview === null)
      ? subview
      : null;
  const reportsSubview: PortalReportsSubview | null =
    view === "reports" &&
    (subview === "queue" || subview === "jobs" || subview === null)
      ? subview
      : null;
  const docsSubview: PortalDocsSubview | null =
    view === "docs" &&
    (subview === "bootstrap" ||
      subview === "handoff" ||
      subview === "snippet" ||
      subview === null)
      ? subview
      : null;
  const billingSubview: PortalBillingSubview | null =
    view === "billing" &&
    (subview === "overview" ||
      subview === "controls" ||
      subview === "credits" ||
      subview === "disputes" ||
      subview === null)
      ? subview
      : null;
  const prizesSubview: PortalPrizesSubview | null =
    view === "prizes" &&
    (subview === "catalog" ||
      subview === "envelope" ||
      subview === "summary" ||
      subview === null)
      ? subview
      : null;

  switch (view) {
    case "overview":
      return (
        <PortalDashboardOverviewPage
          currentHrefState={currentHrefState}
          currentProjectKeys={currentProjectKeys}
          currentProjectPrizes={currentProjectPrizes}
          currentProjectUsage={currentProjectUsage}
          currentTenant={currentTenant}
          currentTenantBillingRuns={currentTenantBillingRuns}
          handleCopySandboxSnippet={handleCopySandboxSnippet}
          handleIssueSandboxStarterKey={handleIssueSandboxStarterKey}
          handleSelectSandboxProject={handleSelectSandboxProject}
          isPending={isPending}
          latestSandboxSecret={latestSandboxSecret}
          overviewUiCopy={overviewUiCopy}
          sandboxProject={sandboxProject}
          sandboxProjectKeys={sandboxProjectKeys}
          sandboxProjectPrizes={sandboxProjectPrizes}
          sandboxSnippet={sandboxSnippet}
          setSnippetLanguage={setSnippetLanguage}
          snippetLanguage={snippetLanguage}
          tenantEntries={tenantEntries}
          overviewSubview={overviewSubview}
        />
      );
    case "tenants":
      return (
        <PortalDashboardTenantsPage
          agentControls={agentControls}
          createdInvite={createdInvite}
          currentTenant={currentTenant}
          currentTenantId={currentTenantId}
          currentTenantInvites={currentTenantInvites}
          currentTenantLinks={currentTenantLinks}
          currentTenantMemberships={currentTenantMemberships}
          handleCopyInviteLink={handleCopyInviteLink}
          handleCreateTenantInvite={handleCreateTenantInvite}
          handleDeleteMembership={handleDeleteMembership}
          handleRevokeInvite={handleRevokeInvite}
          handleSaveMembership={handleSaveMembership}
          isPending={isPending}
          navigateWithScope={navigateWithScope}
          projects={projects}
          tenantEntries={tenantEntries}
          tenantProjects={tenantProjects}
          tenantsSubview={tenantsSubview}
        />
      );
    case "keys":
      return (
        <PortalDashboardKeysPage
          currentProject={currentProject}
          currentProjectId={currentProjectId}
          currentProjectKeys={currentProjectKeys}
          handleIssueKey={handleIssueKey}
          handleIssueSandboxStarterKey={handleIssueSandboxStarterKey}
          handleRevokeKey={handleRevokeKey}
          handleRotateKey={handleRotateKey}
          handleSelectSandboxProject={handleSelectSandboxProject}
          isHydrated={isHydrated}
          isPending={isPending}
          keysSubview={keysSubview}
          overviewUiCopy={overviewUiCopy}
          sandboxProjectId={sandboxProjectId}
        />
      );
    case "usage":
      return (
        <PortalDashboardUsagePage
          currentProject={currentProject}
          currentProjectObservability={currentProjectObservability}
          currentProjectUsage={currentProjectUsage}
          usageSubview={usageSubview}
        />
      );
    case "reports":
      return (
        <PortalDashboardReportsPage
          currentTenant={currentTenant}
          handleQueueReportExport={handleQueueReportExport}
          hasPendingReportExports={hasPendingReportExports}
          isHydrated={isHydrated}
          isPending={isPending}
          refreshOverview={refreshOverview}
          reportsSubview={reportsSubview}
          reportsError={reportsError}
          tenantProjects={tenantProjects}
          visibleReportExports={visibleReportExports}
        />
      );
    case "prizes":
      return (
        <PortalDashboardPrizesPage
          currentProject={currentProject}
          currentProjectId={currentProjectId}
          currentProjectPrizes={currentProjectPrizes}
          handleCreatePrize={handleCreatePrize}
          handleDeletePrize={handleDeletePrize}
          handleUpdatePrize={handleUpdatePrize}
          isPending={isPending}
          prizesSubview={prizesSubview}
        />
      );
    case "billing":
      return (
        <PortalDashboardBillingPage
          billingCurrency={billingCurrency}
          billingInsights={billingInsights}
          billingSubview={billingSubview}
          currentBudgetPolicy={currentBudgetPolicy}
          currentTenant={currentTenant}
          currentTenantBillingDisputes={currentTenantBillingDisputes}
          currentTenantBillingRuns={currentTenantBillingRuns}
          currentTenantId={currentTenantId}
          currentTenantTopUps={currentTenantTopUps}
          handleBillingRedirect={handleBillingRedirect}
          handleCreateBillingDispute={handleCreateBillingDispute}
          handleUpdateBudgetPolicy={handleUpdateBudgetPolicy}
          isPending={isPending}
        />
      );
    case "docs":
      return (
        <PortalDashboardDocsPage
          docsSubview={docsSubview}
          handleCopySandboxSnippet={handleCopySandboxSnippet}
          handleIssueSandboxStarterKey={handleIssueSandboxStarterKey}
          handleSelectSandboxProject={handleSelectSandboxProject}
          isPending={isPending}
          latestSandboxSecret={latestSandboxSecret}
          overviewUiCopy={overviewUiCopy}
          sandboxProject={sandboxProject}
          sandboxProjectId={sandboxProjectId}
          sandboxSnippet={sandboxSnippet}
          setSnippetLanguage={setSnippetLanguage}
          snippetBootstrap={snippetBootstrap}
          snippetLanguage={snippetLanguage}
        />
      );
    default:
      return null;
  }
}
