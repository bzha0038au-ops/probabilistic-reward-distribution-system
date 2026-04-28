import type { SaasOverview } from "@reward/shared-types/saas";

import { apiRequestServer } from "@/lib/api/server";
import { PortalDashboard } from "@/modules/portal/components/portal-dashboard";

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: {
    invite?: string;
    billingSetup?: string;
  };
}) {
  const result = await apiRequestServer<SaasOverview>("/portal/saas/overview", {
    cache: "no-store",
  });

  return (
    <PortalDashboard
      overview={result.ok ? result.data : null}
      error={result.ok ? null : result.error.message}
      inviteToken={searchParams?.invite?.trim() || null}
      billingSetupStatus={searchParams?.billingSetup?.trim() || null}
    />
  );
}
