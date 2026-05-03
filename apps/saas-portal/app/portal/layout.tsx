import { LogoutForm } from "@/components/logout-form";
import { requireCurrentUserSession } from "@/lib/current-user-session";
import { PortalLayoutHeader } from "@/modules/portal/components/portal-layout-header";
import { PortalNav } from "@/modules/portal/components/portal-nav";
import { PortalSideRail } from "@/modules/portal/components/portal-side-rail";

export default async function PortalLayout({
  children,
}: LayoutProps<"/portal">) {
  await requireCurrentUserSession({
    allowPendingLegal: true,
    returnTo: "/portal",
  });

  return (
    <main className="portal-atmosphere min-h-app-screen relative overflow-hidden text-slate-950">
      <div
        aria-hidden
        className="portal-atmosphere pointer-events-none fixed inset-0"
      />
      <PortalSideRail />
      <div className="page-safe-x page-safe-y relative z-10 mx-auto flex w-full max-w-7xl min-[420px]:pl-[clamp(17.5rem,19vw,20rem)]">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="portal-shell-card-strong portal-fade-up overflow-hidden rounded-[2.25rem] p-6 sm:p-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <PortalLayoutHeader />

              <div className="portal-fade-up portal-fade-up-delay-1 flex items-start lg:items-end">
                <LogoutForm
                  className="rounded-2xl border-slate-200 bg-white/90 px-4 text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950"
                  label="Sign out"
                />
              </div>
            </div>

            <div className="mt-6 min-[420px]:hidden">
              <PortalNav />
            </div>
          </header>

          {children}
        </div>
      </div>
    </main>
  );
}
