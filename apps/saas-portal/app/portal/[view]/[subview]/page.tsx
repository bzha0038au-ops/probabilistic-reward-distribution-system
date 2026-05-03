import { notFound } from "next/navigation";

import { PortalRoutePage } from "@/modules/portal/components/portal-route-page";
import {
  isPortalSubviewForView,
  isPortalView,
  type PortalPageSearchParams,
} from "@/modules/portal/lib/portal";

export default async function PortalUsageSubsectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ subview: string; view: string }>;
  searchParams?: Promise<PortalPageSearchParams>;
}) {
  const resolvedParams = await params;
  const view = resolvedParams.view?.trim();
  const subview = resolvedParams.subview?.trim();

  if (
    !view ||
    !subview ||
    !isPortalView(view) ||
    !isPortalSubviewForView(view, subview)
  ) {
    notFound();
  }

  return (
    <PortalRoutePage
      searchParams={searchParams}
      subview={subview}
      view={view}
    />
  );
}
