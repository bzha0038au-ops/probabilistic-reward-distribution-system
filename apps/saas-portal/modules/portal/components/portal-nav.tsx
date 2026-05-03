"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  getPortalDocsSubviewFromPathname,
  getPortalBillingSubviewFromPathname,
  buildPortalRouteHref,
  buildPortalHref,
  getPortalKeysSubviewFromPathname,
  getPortalOverviewSubviewFromPathname,
  getPortalPrizesSubviewFromPathname,
  getPortalTenantsSubviewFromPathname,
  portalKeysSubviewMeta,
  portalKeysSubviewOrder,
  portalBillingSubviewMeta,
  portalBillingSubviewOrder,
  getPortalReportsSubviewFromPathname,
  getPortalUsageSubviewFromPathname,
  getPortalViewFromPathname,
  portalDocsSubviewMeta,
  portalDocsSubviewOrder,
  portalPrizesSubviewMeta,
  portalPrizesSubviewOrder,
  portalReportsSubviewMeta,
  portalReportsSubviewOrder,
  portalRouteMeta,
  portalRouteOrder,
  portalOverviewSubviewMeta,
  portalOverviewSubviewOrder,
  portalTenantsSubviewMeta,
  portalTenantsSubviewOrder,
  portalUsageSubviewMeta,
  portalUsageSubviewOrder,
  type PortalView,
  readPositiveInt,
} from "@/modules/portal/lib/portal";

type PortalNavProps = {
  className?: string;
  orientation?: "horizontal" | "sidebar";
};

function PortalNavIcon({
  view,
  className,
}: {
  className?: string;
  view: PortalView;
}) {
  const sharedProps = {
    "aria-hidden": true,
    className: cn("h-[0.95rem] w-[0.95rem] shrink-0", className),
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (view) {
    case "overview":
      return (
        <svg {...sharedProps}>
          <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.4" />
          <path d="M16.25 13v6.5" />
          <path d="M13 16.25h6.5" />
        </svg>
      );
    case "tenants":
      return (
        <svg {...sharedProps}>
          <path d="M4.75 19.25V7.75a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v11.5" />
          <path d="M13.25 19.25v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8" />
          <path d="M8 10.25h2.5" />
          <path d="M8 13.5h2.5" />
          <path d="M16 14.5h.01" />
        </svg>
      );
    case "keys":
      return (
        <svg {...sharedProps}>
          <path d="M14 7.5a3.5 3.5 0 1 1-1.02 2.48" />
          <path d="M12.98 9.98 4.75 18.25" />
          <path d="m8 15 1.75 1.75" />
          <path d="m10.75 12.25 1.75 1.75" />
        </svg>
      );
    case "usage":
      return (
        <svg {...sharedProps}>
          <path d="M5 18.5h14" />
          <path d="M7.25 15.25 10 12.5l2.5 2.5 4.25-5" />
          <path d="M16.75 10h1.75v1.75" />
        </svg>
      );
    case "reports":
      return (
        <svg {...sharedProps}>
          <path d="M7 4.75h7l3.25 3.25V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.75a1 1 0 0 1 1-1Z" />
          <path d="M14 4.75V8h3.25" />
          <path d="M9 12h5.5" />
          <path d="M9 15.25h5.5" />
        </svg>
      );
    case "prizes":
      return (
        <svg {...sharedProps}>
          <path d="M12 8.25v11" />
          <path d="M6.25 11.5h11.5" />
          <path d="M8.25 19.25h7.5" />
          <path d="M7.75 5.25a2.25 2.25 0 0 1 4.25 1v1.25H9.25a2.25 2.25 0 0 1-1.5-2.25Z" />
          <path d="M16.25 5.25a2.25 2.25 0 0 0-4.25 1v1.25h2.75a2.25 2.25 0 0 0 1.5-2.25Z" />
        </svg>
      );
    case "billing":
      return (
        <svg {...sharedProps}>
          <rect x="4.75" y="6.5" width="14.5" height="11" rx="2" />
          <path d="M4.75 10.25h14.5" />
          <path d="M8.25 14h3.25" />
        </svg>
      );
    case "docs":
      return (
        <svg {...sharedProps}>
          <path d="m9.25 9.25-3 2.75 3 2.75" />
          <path d="m14.75 9.25 3 2.75-3 2.75" />
          <path d="m12.75 7-1.5 10" />
        </svg>
      );
  }
}

export function PortalNav({
  className,
  orientation = "horizontal",
}: PortalNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentBillingSubview = getPortalBillingSubviewFromPathname(pathname);
  const currentView = getPortalViewFromPathname(pathname);
  const currentDocsSubview = getPortalDocsSubviewFromPathname(pathname);
  const currentKeysSubview = getPortalKeysSubviewFromPathname(pathname);
  const currentOverviewSubview = getPortalOverviewSubviewFromPathname(pathname);
  const currentPrizesSubview = getPortalPrizesSubviewFromPathname(pathname);
  const currentUsageSubview = getPortalUsageSubviewFromPathname(pathname);
  const currentReportsSubview = getPortalReportsSubviewFromPathname(pathname);
  const currentTenantsSubview = getPortalTenantsSubviewFromPathname(pathname);
  const tenantId = readPositiveInt(searchParams.get("tenant"));
  const projectId = readPositiveInt(searchParams.get("project"));
  const inviteToken = searchParams.get("invite");
  const billingSetupStatus = searchParams.get("billingSetup");
  const isSidebar = orientation === "sidebar";

  return (
    <nav
      aria-label="Portal sections"
      className={cn(
        "portal-nav-shell",
        isSidebar
          ? "overflow-visible rounded-none bg-transparent p-0 shadow-none"
          : "overflow-x-auto rounded-[1.75rem] p-2",
        className,
      )}
    >
      <div
        className={cn(
          isSidebar ? "flex flex-col gap-3" : "flex min-w-max gap-2",
        )}
      >
        {portalRouteOrder.map((view) => {
          const route = portalRouteMeta[view];
          const isActive = currentView === view;
          const showSubviewDrawer =
            isSidebar &&
            isActive &&
            (view === "overview" ||
              view === "tenants" ||
              view === "keys" ||
              view === "usage" ||
              view === "reports" ||
              view === "docs" ||
              view === "billing" ||
              view === "prizes");
          const drawerItems =
            view === "overview"
              ? portalOverviewSubviewOrder.map((subview) => ({
                  active: currentOverviewSubview === subview,
                  href: buildPortalRouteHref("overview", subview, {
                    billingSetupStatus,
                    inviteToken,
                    projectId,
                    tenantId,
                  }),
                  key: subview,
                  title: portalOverviewSubviewMeta[subview].navLabel,
                }))
              : view === "tenants"
              ? portalTenantsSubviewOrder.map((subview) => ({
                  active: currentTenantsSubview === subview,
                  href: buildPortalRouteHref("tenants", subview, {
                    billingSetupStatus,
                    inviteToken,
                    projectId,
                    tenantId,
                  }),
                  key: subview,
                  title: portalTenantsSubviewMeta[subview].navLabel,
                }))
              : view === "keys"
              ? portalKeysSubviewOrder.map((subview) => ({
                  active: currentKeysSubview === subview,
                  href: buildPortalRouteHref("keys", subview, {
                    billingSetupStatus,
                    inviteToken,
                    projectId,
                    tenantId,
                  }),
                  key: subview,
                  title: portalKeysSubviewMeta[subview].navLabel,
                }))
              : view === "usage"
              ? portalUsageSubviewOrder.map((subview) => ({
                  active: currentUsageSubview === subview,
                  href: buildPortalRouteHref("usage", subview, {
                    billingSetupStatus,
                    inviteToken,
                    projectId,
                    tenantId,
                  }),
                  key: subview,
                  title: portalUsageSubviewMeta[subview].navLabel,
                }))
              : view === "reports"
                ? portalReportsSubviewOrder.map((subview) => ({
                    active: currentReportsSubview === subview,
                    href: buildPortalRouteHref("reports", subview, {
                      billingSetupStatus,
                      inviteToken,
                      projectId,
                      tenantId,
                    }),
                    key: subview,
                    title: portalReportsSubviewMeta[subview].navLabel,
                }))
                : view === "docs"
                  ? portalDocsSubviewOrder.map((subview) => ({
                      active: currentDocsSubview === subview,
                      href: buildPortalRouteHref("docs", subview, {
                        billingSetupStatus,
                        inviteToken,
                        projectId,
                        tenantId,
                      }),
                      key: subview,
                      title: portalDocsSubviewMeta[subview].navLabel,
                    }))
                  : view === "billing"
                    ? portalBillingSubviewOrder.map((subview) => ({
                        active: currentBillingSubview === subview,
                        href: buildPortalRouteHref("billing", subview, {
                          billingSetupStatus,
                          inviteToken,
                          projectId,
                          tenantId,
                        }),
                        key: subview,
                        title: portalBillingSubviewMeta[subview].navLabel,
                      }))
                    : view === "prizes"
                      ? portalPrizesSubviewOrder.map((subview) => ({
                          active: currentPrizesSubview === subview,
                          href: buildPortalRouteHref("prizes", subview, {
                            billingSetupStatus,
                            inviteToken,
                            projectId,
                            tenantId,
                          }),
                          key: subview,
                          title: portalPrizesSubviewMeta[subview].navLabel,
                        }))
                : [];

          return (
            <div
              key={view}
              className={cn(isSidebar ? "flex flex-col gap-2" : "")}
            >
              <Link
                href={buildPortalHref(view, {
                  billingSetupStatus,
                  inviteToken,
                  projectId,
                  tenantId,
                })}
                className={cn(
                  "group text-sm transition duration-200",
                  isSidebar
                    ? "relative w-full rounded-[1.35rem] border px-5 py-4 text-[13px] leading-5"
                    : "rounded-[1.1rem] px-4 py-3",
                  isSidebar
                    ? isActive
                      ? "border-sky-200 bg-sky-100/90 text-slate-950 shadow-[0_22px_48px_rgba(59,130,246,0.12)]"
                      : "border-slate-200/90 bg-white/88 text-sky-600 hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950 hover:shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                    : isActive
                      ? "bg-slate-950 text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
                      : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-[0_14px_34px_rgba(15,23,42,0.06)]",
                )}
              >
                {isSidebar ? (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-4 h-[calc(100%-2rem)] w-[0.18rem] rounded-full transition duration-200",
                        isActive ? "bg-sky-500" : "bg-transparent",
                      )}
                    />
                    <span className="flex items-start gap-4">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] border",
                          isActive
                            ? "border-sky-200 bg-white/88 text-sky-600"
                            : "border-slate-200/90 bg-white/94 text-slate-500",
                        )}
                      >
                        <PortalNavIcon
                          className="h-[1rem] w-[1rem]"
                          view={view}
                        />
                      </span>
                      <span className="min-w-0 text-left">
                        <span
                          className={cn(
                            "block font-semibold uppercase tracking-[0.16em]",
                            isActive ? "text-sky-700" : "text-sky-600",
                          )}
                        >
                          {route.label}
                        </span>
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <div className="font-semibold">{route.label}</div>
                    <div
                      className={cn(
                        "mt-1 text-xs leading-5",
                        "max-w-[15rem]",
                        isActive ? "text-slate-300" : "text-slate-500",
                      )}
                    >
                      {route.description}
                    </div>
                  </>
                )}
              </Link>

              {showSubviewDrawer ? (
                <div className="ml-14 flex flex-col gap-2 border-l border-slate-200/80 pl-4">
                  {drawerItems.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm transition duration-200",
                        item.active
                          ? "bg-sky-50 text-sky-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
