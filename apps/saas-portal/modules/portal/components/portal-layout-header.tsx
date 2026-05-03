"use client";

import { usePathname } from "next/navigation";

import {
  getPortalBillingSubviewFromPathname,
  getPortalDocsSubviewFromPathname,
  getPortalKeysSubviewFromPathname,
  getPortalOverviewSubviewFromPathname,
  getPortalPrizesSubviewFromPathname,
  getPortalReportsSubviewFromPathname,
  getPortalTenantsSubviewFromPathname,
  getPortalUsageSubviewFromPathname,
  getPortalViewFromPathname,
  portalBillingSubviewMeta,
  portalDocsSubviewMeta,
  portalKeysSubviewMeta,
  portalOverviewSubviewMeta,
  portalPrizesSubviewMeta,
  portalRouteMeta,
  portalReportsSubviewMeta,
  portalTenantsSubviewMeta,
  portalUsageSubviewMeta,
} from "@/modules/portal/lib/portal";

export function PortalLayoutHeader() {
  const pathname = usePathname();
  const currentBillingSubview = getPortalBillingSubviewFromPathname(pathname);
  const currentView = getPortalViewFromPathname(pathname);
  const currentDocsSubview = getPortalDocsSubviewFromPathname(pathname);
  const currentKeysSubview = getPortalKeysSubviewFromPathname(pathname);
  const currentOverviewSubview = getPortalOverviewSubviewFromPathname(pathname);
  const currentPrizesSubview = getPortalPrizesSubviewFromPathname(pathname);
  const currentUsageSubview = getPortalUsageSubviewFromPathname(pathname);
  const currentReportsSubview = getPortalReportsSubviewFromPathname(pathname);
  const currentTenantsSubview = getPortalTenantsSubviewFromPathname(pathname);
  const currentViewMeta =
    currentView === "overview"
      ? portalOverviewSubviewMeta[currentOverviewSubview]
      : currentView === "tenants"
      ? portalTenantsSubviewMeta[currentTenantsSubview]
      : currentView === "keys"
      ? portalKeysSubviewMeta[currentKeysSubview]
      : currentView === "usage"
      ? portalUsageSubviewMeta[currentUsageSubview]
      : currentView === "prizes"
        ? portalPrizesSubviewMeta[currentPrizesSubview]
      : currentView === "billing"
        ? portalBillingSubviewMeta[currentBillingSubview]
      : currentView === "docs"
        ? portalDocsSubviewMeta[currentDocsSubview]
      : currentView === "reports"
        ? portalReportsSubviewMeta[currentReportsSubview]
      : portalRouteMeta[currentView];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
        {currentViewMeta.label}
      </p>
      <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        {currentViewMeta.title}
      </h1>
      <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">
        {currentViewMeta.description}
      </p>
    </div>
  );
}
