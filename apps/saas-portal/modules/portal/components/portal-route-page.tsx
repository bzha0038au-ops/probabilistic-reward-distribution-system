import type {
  SaasOverview,
  SaasReportExportJob,
  SaasTenantBillingInsights,
} from "@reward/shared-types/saas";

import { apiRequestServer } from "@/lib/api/server";
import { requireCurrentUserSession } from "@/lib/current-user-session";
import { PortalDashboard } from "@/modules/portal/components/portal-dashboard";
import type {
  PortalPageSearchParams,
  PortalView,
} from "@/modules/portal/lib/portal";
import {
  readPositiveInt,
  resolvePortalSelection,
} from "@/modules/portal/lib/portal";

export async function PortalRoutePage({
  searchParams,
  view,
}: {
  searchParams?: Promise<PortalPageSearchParams>;
  view: PortalView;
}) {
  const resolvedSearchParams = await searchParams;
  const currentSearch = resolvedSearchParams
    ? new URLSearchParams(
        Object.entries(resolvedSearchParams).flatMap(([key, value]) =>
          typeof value === "string" && value.trim() !== ""
            ? [[key, value]]
            : [],
        ),
      ).toString()
    : "";
  const returnToBase = view === "overview" ? "/portal" : `/portal/${view}`;
  const returnTo = currentSearch
    ? `${returnToBase}?${currentSearch}`
    : returnToBase;

  await requireCurrentUserSession({ returnTo });

  const requestedTenantId = readPositiveInt(resolvedSearchParams?.tenant);
  const requestedProjectId = readPositiveInt(resolvedSearchParams?.project);
  const result = await apiRequestServer<SaasOverview>("/portal/saas/overview", {
    cache: "no-store",
  });
  const overview = result.ok ? result.data : null;
  const selection = resolvePortalSelection(
    overview,
    requestedTenantId,
    requestedProjectId,
  );
  const billingInsightsResult = selection.currentTenantId
    ? await apiRequestServer<SaasTenantBillingInsights>(
        `/portal/saas/tenants/${selection.currentTenantId}/billing/insights`,
        {
          cache: "no-store",
        },
      )
    : null;
  const reportExportsResult =
    view === "reports" && selection.currentTenantId
      ? await apiRequestServer<SaasReportExportJob[]>(
          `/portal/saas/tenants/${selection.currentTenantId}/reports/exports`,
          {
            cache: "no-store",
          },
        )
      : null;

  return (
    <PortalDashboard
      view={view}
      overview={overview}
      reportExports={reportExportsResult?.ok ? reportExportsResult.data : null}
      reportsError={
        reportExportsResult && !reportExportsResult.ok
          ? reportExportsResult.error.message
          : null
      }
      billingInsights={
        billingInsightsResult?.ok ? billingInsightsResult.data : null
      }
      error={result.ok ? null : result.error.message}
      inviteToken={resolvedSearchParams?.invite?.trim() || null}
      billingSetupStatus={resolvedSearchParams?.billingSetup?.trim() || null}
      requestedTenantId={requestedTenantId}
      requestedProjectId={requestedProjectId}
    />
  );
}
