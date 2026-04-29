import { notFound } from "next/navigation";

import { PortalRoutePage } from "@/modules/portal/components/portal-route-page";
import {
  isPortalView,
  type PortalPageSearchParams,
} from "@/modules/portal/lib/portal";

export default async function PortalSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams?: Promise<PortalPageSearchParams>;
}) {
  const resolvedParams = await params;
  const view = resolvedParams.view?.trim();

  if (!view || !isPortalView(view) || view === "overview") {
    notFound();
  }

  return <PortalRoutePage view={view} searchParams={searchParams} />;
}
