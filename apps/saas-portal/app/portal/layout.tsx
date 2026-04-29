import { LogoutForm } from "@/components/logout-form";
import { Badge } from "@/components/ui/badge";
import { requireCurrentUserSession } from "@/lib/current-user-session";
import { PortalNav } from "@/modules/portal/components/portal-nav";

export default async function PortalLayout({
  children,
}: LayoutProps<"/portal">) {
  const currentSession = await requireCurrentUserSession({
    allowPendingLegal: true,
    returnTo: "/portal",
  });

  return (
    <main className="min-h-app-screen bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef5ff_28%,_#f8fbff_100%)] text-slate-950">
      <div className="page-safe-x page-safe-y mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_28%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-6 shadow-[0_28px_80px_rgba(15,23,42,0.1)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                  SaaS Portal
                </Badge>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                  Tenant-scoped control plane
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Project operations without internal admin access
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600">
                  Switch tenants and projects, manage API keys, inspect quota
                  windows, edit prize pools, and hand developers working SDK
                  examples from a self-serve BFF.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 lg:items-end">
              <p className="text-sm text-slate-500">
                Signed in as{" "}
                <span className="font-medium text-slate-900">
                  {currentSession.user.email}
                </span>
              </p>
              <LogoutForm label="Sign out" />
            </div>
          </div>

          <div className="mt-6">
            <PortalNav />
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
