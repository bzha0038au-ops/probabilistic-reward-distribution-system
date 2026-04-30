"use client";

import { useEffect, useTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  SaasApiKey,
  SaasApiKeyIssue,
  SaasApiKeyRotation,
  SaasOverview,
  SaasPortalTenantRegistration,
  SaasProjectPrize,
  SaasReportExportJob,
  SaasTenantBillingInsights,
  SaasTenantInvite,
  SaasTenantInviteDelivery,
  SaasTenantMembership,
} from "@reward/shared-types/saas";
import { defaultSaasOverviewUiCopy } from "@reward/shared-types/saas";

import { buildLegalPath, buildLoginPath } from "@/lib/navigation";
import {
  buildPortalHref,
  portalRouteMeta,
  resolvePortalSelection,
  type PortalView,
} from "@/modules/portal/lib/portal";

import { PortalDashboardShell } from "./portal-dashboard/dashboard-shell";
import { PortalDashboardViewContent } from "./portal-dashboard/view-content";
import {
  API_KEY_SCOPE_OPTIONS,
  buildSandboxPythonSnippet,
  buildSandboxTypeScriptSnippet,
  parseDateTimeInputToIso,
  type SnippetLanguage,
} from "./portal-dashboard/shared";

type PortalDashboardProps = {
  billingSetupStatus: string | null;
  billingInsights: SaasTenantBillingInsights | null;
  error: string | null;
  inviteToken: string | null;
  overview: SaasOverview | null;
  reportExports: SaasReportExportJob[] | null;
  reportsError: string | null;
  requestedProjectId: number | null;
  requestedTenantId: number | null;
  view: PortalView;
};

type MutationBanner = {
  tone: "success" | "error";
  message: string;
} | null;

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

export function PortalDashboard({
  billingSetupStatus,
  billingInsights,
  error,
  inviteToken,
  overview,
  reportExports,
  reportsError,
  requestedProjectId,
  requestedTenantId,
  view,
}: PortalDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const [banner, setBanner] = useState<MutationBanner>(null);
  const [issuedKey, setIssuedKey] = useState<SaasApiKeyIssue | null>(null);
  const [rotatedKey, setRotatedKey] = useState<SaasApiKeyRotation | null>(null);
  const [createdInvite, setCreatedInvite] =
    useState<SaasTenantInviteDelivery | null>(null);
  const [snippetLanguage, setSnippetLanguage] =
    useState<SnippetLanguage>("typescript");
  const [isPending, startTransition] = useTransition();

  const {
    agentControls,
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
    projects,
    sandboxProject,
    sandboxProjectId,
    sandboxProjectKeys,
    sandboxProjectPrizes,
    tenantEntries,
    tenantProjects,
  } = resolvePortalSelection(overview, requestedTenantId, requestedProjectId);
  const overviewUiCopy = overview?.uiCopy.overview ?? defaultSaasOverviewUiCopy.overview;

  const visibleReportExports = reportExports ?? [];
  const hasPendingReportExports = visibleReportExports.some(
    (job) => job.status === "pending" || job.status === "processing",
  );

  const latestSandboxSecret =
    issuedKey?.projectId === sandboxProjectId
      ? issuedKey.apiKey
      : rotatedKey?.issuedKey.projectId === sandboxProjectId
        ? rotatedKey.issuedKey.apiKey
        : null;

  const sandboxSnippets = {
    typescript: buildSandboxTypeScriptSnippet({
      apiKey: latestSandboxSecret,
      projectSlug: sandboxProject?.slug ?? null,
    }),
    python: buildSandboxPythonSnippet({
      apiKey: latestSandboxSecret,
      projectSlug: sandboxProject?.slug ?? null,
    }),
  } as const;
  const sandboxSnippet = sandboxSnippets[snippetLanguage];
  const snippetBootstrap =
    snippetLanguage === "typescript"
      ? "pnpm add @reward/prize-engine-sdk"
      : "from prize_engine_sdk import PrizeEngineClient, create_idempotency_key";


  const currentHrefState = {
    billingSetupStatus,
    inviteToken,
    projectId: currentProjectId,
    tenantId: currentTenantId,
  };
  const currentRoute = (() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (view !== "reports" || !hasPendingReportExports) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 5_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasPendingReportExports, router, startTransition, view]);

  const currentViewMeta = portalRouteMeta[view];
  const currentBudgetPolicy = currentTenant?.billing?.budgetPolicy ?? null;
  const billingCurrency =
    billingInsights?.currency ?? currentTenant?.billing?.currency ?? "USD";

  const refreshOverview = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const navigateWithScope = (
    nextTenantId: number | null,
    nextProjectId: number | null,
  ) => {
    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          ...currentHrefState,
          projectId: nextProjectId,
          tenantId: nextTenantId,
        }),
      );
    });
  };

  const readEnvelope = async <T,>(
    response: Response,
  ): Promise<ApiEnvelope<T> | null> =>
    (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  const setErrorBanner = (message: string) => {
    setBanner({ tone: "error", message });
  };

  const setSuccessBanner = (message: string) => {
    setBanner({ tone: "success", message });
  };

  const redirectForAccessError = (code?: string, status?: number) => {
    if (code === API_ERROR_CODES.LEGAL_ACCEPTANCE_REQUIRED) {
      startTransition(() => {
        router.replace(buildLegalPath(currentRoute));
      });
      return true;
    }

    if (code === API_ERROR_CODES.UNAUTHORIZED || status === 401) {
      window.location.assign(buildLoginPath(currentRoute));
      return true;
    }

    return false;
  };

  const postJson = async <T,>(
    path: string,
    body: Record<string, unknown>,
    successMessage?: string,
  ) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    if (successMessage) {
      setSuccessBanner(successMessage);
    }

    return payload.data;
  };

  const patchJson = async <T,>(
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    setSuccessBanner(successMessage);
    return payload.data;
  };

  const deleteRequest = async <T,>(path: string, successMessage: string) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "DELETE",
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    setSuccessBanner(successMessage);
    return payload.data;
  };

  const handleAcceptInvite = async () => {
    if (!inviteToken) {
      return;
    }

    const result = await postJson(
      "/portal/saas/invites/accept",
      {
        token: inviteToken,
      },
      "Tenant invite accepted.",
    );
    if (!result) {
      return;
    }

    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          billingSetupStatus,
          projectId: currentProjectId,
          tenantId: currentTenantId,
        }),
      );
      router.refresh();
    });
  };

  const handleCreateTenant = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const billingEmail = String(formData.get("billingEmail") ?? "").trim();

    const result = await postJson<SaasPortalTenantRegistration>(
      "/portal/saas/tenants",
      {
        name,
        ...(billingEmail ? { billingEmail } : {}),
      },
      "Workspace created. Your sandbox starter key is ready.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result.issuedKey);
    setRotatedKey(null);
    setCreatedInvite(null);
    form.reset();
    startTransition(() => {
      router.replace(
        buildPortalHref("overview", {
          billingSetupStatus,
          tenantId: result.tenant.id,
          projectId: result.tenant.bootstrap.sandboxProject.id,
        }),
      );
      router.refresh();
    });
  };

  const handleSaveMembership = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before saving a membership.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const adminEmail = String(formData.get("adminEmail") ?? "").trim();
    const role = String(formData.get("role") ?? "tenant_operator").trim();

    const result = await postJson<SaasTenantMembership>(
      `/portal/saas/tenants/${currentTenantId}/memberships`,
      {
        adminEmail,
        role,
      },
      "Tenant membership saved.",
    );
    if (!result) {
      return;
    }

    setCreatedInvite(null);
    form.reset();
    refreshOverview();
  };

  const handleDeleteMembership = async (membership: SaasTenantMembership) => {
    if (!currentTenantId) {
      return;
    }

    const result = await deleteRequest<SaasTenantMembership>(
      `/portal/saas/tenants/${currentTenantId}/memberships/${membership.id}`,
      `Removed ${
        membership.adminDisplayName ?? membership.adminEmail ?? "operator"
      } from tenant access.`,
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleCreateTenantInvite = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before sending an invite.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "tenant_operator").trim();

    const result = await postJson<SaasTenantInviteDelivery>(
      `/portal/saas/tenants/${currentTenantId}/invites`,
      {
        email,
        role,
      },
      "Tenant invite sent.",
    );
    if (!result) {
      return;
    }

    setCreatedInvite(result);
    form.reset();
    refreshOverview();
  };

  const handleRevokeInvite = async (invite: SaasTenantInvite) => {
    if (!currentTenantId) {
      return;
    }

    const result = await postJson<SaasTenantInvite>(
      `/portal/saas/tenants/${currentTenantId}/invites/${invite.id}/revoke`,
      {},
      `Revoked invite for ${invite.email}.`,
    );
    if (!result) {
      return;
    }

    if (createdInvite?.invite.id === invite.id) {
      setCreatedInvite(null);
    }
    refreshOverview();
  };

  const handleIssueKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProjectId) {
      setErrorBanner("Select a project before issuing a key.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const label = String(formData.get("label") ?? "").trim();
    const scopes = formData
      .getAll("scopes")
      .map((value) => String(value))
      .filter(Boolean);
    const expiresAt = String(formData.get("expiresAt") ?? "").trim();

    const result = await postJson<SaasApiKeyIssue>(
      `/portal/saas/projects/${currentProjectId}/keys`,
      {
        label,
        scopes,
        ...(expiresAt ? { expiresAt } : {}),
      },
      "API key issued.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result);
    setRotatedKey(null);
    form.reset();
    refreshOverview();
  };

  const handleSelectSandboxProject = () => {
    if (!sandboxProjectId) {
      setErrorBanner("This tenant does not have a sandbox project yet.");
      return;
    }

    navigateWithScope(currentTenantId, sandboxProjectId);
    setSuccessBanner("Sandbox project selected.");
  };

  const handleIssueSandboxStarterKey = async () => {
    if (!sandboxProjectId || !sandboxProject) {
      setErrorBanner("This tenant does not have a sandbox project yet.");
      return;
    }

    const result = await postJson<SaasApiKeyIssue>(
      `/portal/saas/projects/${sandboxProjectId}/keys`,
      {
        label: `${sandboxProject.slug}-starter`,
        scopes: [...API_KEY_SCOPE_OPTIONS],
      },
      "Sandbox API key issued.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result);
    setRotatedKey(null);
    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          ...currentHrefState,
          projectId: sandboxProjectId,
        }),
      );
      router.refresh();
    });
  };

  const handleCopySandboxSnippet = async () => {
    if (!navigator.clipboard) {
      setErrorBanner("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(sandboxSnippet);
      setSuccessBanner("Copied the sandbox SDK snippet.");
    } catch {
      setErrorBanner("Failed to copy the sandbox SDK snippet.");
    }
  };

  const handleCopyInviteLink = async () => {
    if (!createdInvite?.inviteUrl) {
      return;
    }

    if (!navigator.clipboard) {
      setErrorBanner("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(createdInvite.inviteUrl);
      setSuccessBanner("Copied the tenant invite link.");
    } catch {
      setErrorBanner("Failed to copy the tenant invite link.");
    }
  };

  const handleRotateKey = async (apiKey: SaasApiKey) => {
    if (!currentProjectId) {
      return;
    }

    const result = await postJson<SaasApiKeyRotation>(
      `/portal/saas/projects/${currentProjectId}/keys/${apiKey.id}/rotate`,
      {
        reason: "portal_rotation",
        overlapSeconds: 3600,
      },
      `Rotated ${apiKey.label}.`,
    );
    if (!result) {
      return;
    }

    setRotatedKey(result);
    setIssuedKey(null);
    refreshOverview();
  };

  const handleRevokeKey = async (apiKey: SaasApiKey) => {
    if (!currentProjectId) {
      return;
    }

    const result = await postJson<SaasApiKey>(
      `/portal/saas/projects/${currentProjectId}/keys/${apiKey.id}/revoke`,
      {
        reason: "portal_revocation",
      },
      `Revoked ${apiKey.label}.`,
    );
    if (!result) {
      return;
    }

    setIssuedKey(null);
    setRotatedKey(null);
    refreshOverview();
  };

  const handleCreatePrize = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProjectId) {
      setErrorBanner("Select a project before creating a prize.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await postJson<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes`,
      {
        name: String(formData.get("name") ?? "").trim(),
        stock: Number(formData.get("stock") ?? 0),
        weight: Number(formData.get("weight") ?? 1),
        rewardAmount: String(formData.get("rewardAmount") ?? "0").trim(),
        isActive: formData.get("isActive") === "on",
      },
      "Prize created.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  const handleUpdatePrize = async (
    event: React.FormEvent<HTMLFormElement>,
    prizeId: number,
  ) => {
    event.preventDefault();
    if (!currentProjectId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = await patchJson<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes/${prizeId}`,
      {
        name: String(formData.get("name") ?? "").trim(),
        stock: Number(formData.get("stock") ?? 0),
        weight: Number(formData.get("weight") ?? 1),
        rewardAmount: String(formData.get("rewardAmount") ?? "0").trim(),
        isActive: formData.get("isActive") === "on",
      },
      "Prize updated.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleDeletePrize = async (prizeId: number) => {
    if (!currentProjectId) {
      return;
    }

    const result = await deleteRequest<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes/${prizeId}`,
      "Prize archived.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleBillingRedirect = async (
    path: string,
    successMessage: string,
  ) => {
    const response = await postJson<{ url: string }>(path, {}, successMessage);
    if (!response?.url) {
      return;
    }

    window.location.assign(response.url);
  };

  const handleQueueReportExport = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before queuing a report export.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fromAt = parseDateTimeInputToIso(formData.get("fromAt"));
    const toAt = parseDateTimeInputToIso(formData.get("toAt"));
    if (!fromAt || !toAt) {
      setErrorBanner("Enter a valid report export time range.");
      return;
    }

    const projectScope = String(formData.get("projectScope") ?? "all").trim();
    const projectId =
      projectScope !== "all" && Number.isInteger(Number(projectScope))
        ? Number(projectScope)
        : null;

    const result = await postJson<SaasReportExportJob>(
      `/portal/saas/tenants/${currentTenantId}/reports/exports`,
      {
        projectId,
        resource: String(formData.get("resource") ?? "").trim(),
        format: String(formData.get("format") ?? "").trim(),
        fromAt,
        toAt,
      },
      "Report export queued.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  const handleUpdateBudgetPolicy = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before updating budget controls.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const monthlyBudget = String(formData.get("monthlyBudget") ?? "").trim();
    const alertThresholdRaw = String(
      formData.get("alertThresholdPct") ?? "",
    ).trim();
    const hardCap = String(formData.get("hardCap") ?? "").trim();
    const alertWebhookUrl = String(
      formData.get("alertWebhookUrl") ?? "",
    ).trim();
    const alertWebhookSecret = String(
      formData.get("alertWebhookSecret") ?? "",
    ).trim();
    const alertThresholdPct = alertThresholdRaw
      ? Number(alertThresholdRaw)
      : null;

    if (alertThresholdRaw && !Number.isFinite(alertThresholdPct)) {
      setErrorBanner("Alert threshold must be a number.");
      return;
    }

    const result = await patchJson(
      `/portal/saas/tenants/${currentTenantId}/billing/budget-policy`,
      {
        monthlyBudget: monthlyBudget || null,
        alertThresholdPct,
        hardCap: hardCap || null,
        alertEmailEnabled: formData.get("alertEmailEnabled") === "on",
        alertWebhookUrl: alertWebhookUrl || null,
        ...(alertWebhookSecret ? { alertWebhookSecret } : {}),
        clearAlertWebhook: formData.get("clearAlertWebhook") === "on",
      },
      "Billing budget controls updated.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleCreateBillingDispute = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before submitting a billing dispute.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const billingRunId = Number(formData.get("billingRunId") ?? 0);
    if (!Number.isInteger(billingRunId) || billingRunId <= 0) {
      setErrorBanner("Choose the invoice run you want to dispute.");
      return;
    }

    const result = await postJson(
      `/portal/saas/tenants/${currentTenantId}/disputes`,
      {
        billingRunId,
        reason: String(formData.get("reason") ?? "other"),
        summary: String(formData.get("summary") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        requestedRefundAmount: String(
          formData.get("requestedRefundAmount") ?? "0",
        ).trim(),
      },
      "Billing dispute submitted.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  return (
    <PortalDashboardShell
      banner={banner}
      billingSetupStatus={billingSetupStatus}
      currentProject={currentProject}
      currentProjectId={currentProjectId}
      currentTenant={currentTenant}
      currentTenantId={currentTenantId}
      currentViewMeta={currentViewMeta}
      error={error}
      handleAcceptInvite={handleAcceptInvite}
      handleCreateTenant={handleCreateTenant}
      inviteToken={inviteToken}
      isHydrated={isHydrated}
      isPending={isPending}
      issuedKey={issuedKey}
      navigateWithScope={navigateWithScope}
      overview={overview}
      projects={projects}
      rotatedKey={rotatedKey}
      tenantEntries={tenantEntries}
      tenantProjects={tenantProjects}
    >
      <PortalDashboardViewContent
        agentControls={agentControls}
        billingCurrency={billingCurrency}
        billingInsights={billingInsights}
        createdInvite={createdInvite}
        currentBudgetPolicy={currentBudgetPolicy}
        currentHrefState={currentHrefState}
        currentProject={currentProject}
        currentProjectId={currentProjectId}
        currentProjectKeys={currentProjectKeys}
        currentProjectObservability={currentProjectObservability}
        currentProjectPrizes={currentProjectPrizes}
        currentProjectUsage={currentProjectUsage}
        currentTenant={currentTenant}
        currentTenantBillingDisputes={currentTenantBillingDisputes}
        currentTenantBillingRuns={currentTenantBillingRuns}
        currentTenantId={currentTenantId}
        currentTenantInvites={currentTenantInvites}
        currentTenantLinks={currentTenantLinks}
        currentTenantMemberships={currentTenantMemberships}
        currentTenantTopUps={currentTenantTopUps}
        handleBillingRedirect={handleBillingRedirect}
        handleCopyInviteLink={handleCopyInviteLink}
        handleCopySandboxSnippet={handleCopySandboxSnippet}
        handleCreateBillingDispute={handleCreateBillingDispute}
        handleCreatePrize={handleCreatePrize}
        handleCreateTenantInvite={handleCreateTenantInvite}
        handleDeleteMembership={handleDeleteMembership}
        handleDeletePrize={handleDeletePrize}
        handleIssueKey={handleIssueKey}
        handleIssueSandboxStarterKey={handleIssueSandboxStarterKey}
        handleQueueReportExport={handleQueueReportExport}
        handleRevokeInvite={handleRevokeInvite}
        handleRevokeKey={handleRevokeKey}
        handleRotateKey={handleRotateKey}
        handleSaveMembership={handleSaveMembership}
        handleSelectSandboxProject={handleSelectSandboxProject}
        handleUpdateBudgetPolicy={handleUpdateBudgetPolicy}
        handleUpdatePrize={handleUpdatePrize}
        hasPendingReportExports={hasPendingReportExports}
        isHydrated={isHydrated}
        isPending={isPending}
        latestSandboxSecret={latestSandboxSecret}
        navigateWithScope={navigateWithScope}
        overviewUiCopy={overviewUiCopy}
        projects={projects}
        refreshOverview={refreshOverview}
        reportsError={reportsError}
        sandboxProject={sandboxProject}
        sandboxProjectId={sandboxProjectId}
        sandboxProjectKeys={sandboxProjectKeys}
        sandboxProjectPrizes={sandboxProjectPrizes}
        sandboxSnippet={sandboxSnippet}
        setSnippetLanguage={setSnippetLanguage}
        snippetBootstrap={snippetBootstrap}
        snippetLanguage={snippetLanguage}
        tenantEntries={tenantEntries}
        tenantProjects={tenantProjects}
        view={view}
        visibleReportExports={visibleReportExports}
      />
    </PortalDashboardShell>
  );
}
