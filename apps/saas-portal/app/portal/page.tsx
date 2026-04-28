import type { SaasOverview } from "@reward/shared-types/saas";

import { apiRequestServer } from "@/lib/api/server";
import { PortalDashboard } from "@/modules/portal/components/portal-dashboard";

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<{
    invite?: string;
    billingSetup?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const result = await apiRequestServer<SaasOverview>("/portal/saas/overview", {
    cache: "no-store",
  });

  return (
    <PortalDashboard
      overview={result.ok ? result.data : null}
      error={result.ok ? null : result.error.message}
      inviteToken={resolvedSearchParams?.invite?.trim() || null}
      billingSetupStatus={resolvedSearchParams?.billingSetup?.trim() || null}
    />
  );
}
