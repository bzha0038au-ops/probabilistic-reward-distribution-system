import type {
  SaasApiKey,
  SaasTenantInvite,
  SaasTenantMembership,
} from "@reward/shared-types/saas";

import type { PortalHrefState, PortalSelection, PortalView } from "@/modules/portal/lib/portal";

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
  billingInsights: PortalSelection["currentTenant"] extends never ? never : Parameters<
    typeof PortalDashboardBillingPage
  >[0]["billingInsights"];
  createdInvite: Parameters<typeof PortalDashboardTenantsPage>[0]["createdInvite"];
  currentBudgetPolicy: Parameters<typeof PortalDashboardBillingPage>[0]["currentBudgetPolicy"];
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
  handleCreatePrize: Parameters<typeof PortalDashboardPrizesPage>[0]["handleCreatePrize"];
  handleCreateTenantInvite: Parameters<
    typeof PortalDashboardTenantsPage
  >[0]["handleCreateTenantInvite"];
  handleDeleteMembership: (membership: SaasTenantMembership) => void;
  handleDeletePrize: (prizeId: number) => void;
  handleIssueKey: Parameters<typeof PortalDashboardKeysPage>[0]["handleIssueKey"];
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
  handleUpdatePrize: Parameters<typeof PortalDashboardPrizesPage>[0]["handleUpdatePrize"];
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
  tenantEntries,
  tenantProjects,
  view,
  visibleReportExports,
}: ViewContentProps) {
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
        />
      );
    case "billing":
      return (
        <PortalDashboardBillingPage
          billingCurrency={billingCurrency}
          billingInsights={billingInsights}
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
