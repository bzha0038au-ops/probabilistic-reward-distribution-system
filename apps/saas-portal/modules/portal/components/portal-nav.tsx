"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  buildPortalHref,
  getPortalViewFromPathname,
  portalRouteMeta,
  portalRouteOrder,
  readPositiveInt,
} from "@/modules/portal/lib/portal";

export function PortalNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = getPortalViewFromPathname(pathname);
  const tenantId = readPositiveInt(searchParams.get("tenant"));
  const projectId = readPositiveInt(searchParams.get("project"));
  const inviteToken = searchParams.get("invite");
  const billingSetupStatus = searchParams.get("billingSetup");

  return (
    <nav
      aria-label="Portal sections"
      className="overflow-x-auto rounded-[1.75rem] border border-slate-200/80 bg-white/80 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
    >
      <div className="flex min-w-max gap-2">
        {portalRouteOrder.map((view) => {
          const route = portalRouteMeta[view];
          const isActive = currentView === view;

          return (
            <Link
              key={view}
              href={buildPortalHref(view, {
                billingSetupStatus,
                inviteToken,
                projectId,
                tenantId,
              })}
              className={cn(
                "rounded-[1.1rem] px-4 py-3 text-sm transition",
                isActive
                  ? "bg-slate-950 text-white shadow-[0_14px_40px_rgba(15,23,42,0.2)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <div className="font-semibold">{route.label}</div>
              <div
                className={cn(
                  "mt-1 max-w-[15rem] text-xs leading-5",
                  isActive ? "text-slate-300" : "text-slate-500",
                )}
              >
                {route.description}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
