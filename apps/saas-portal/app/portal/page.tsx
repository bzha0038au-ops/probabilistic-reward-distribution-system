import { PortalRoutePage } from "@/modules/portal/components/portal-route-page";
import type { PortalPageSearchParams } from "@/modules/portal/lib/portal";

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<PortalPageSearchParams>;
}) {
  return <PortalRoutePage view="overview" searchParams={searchParams} />;
}
