import { PortalNav } from "@/modules/portal/components/portal-nav";

export function PortalSideRail() {
  return (
    <aside className="pointer-events-none fixed inset-y-0 left-0 z-20 hidden h-screen min-[420px]:flex">
      <div className="pointer-events-auto flex h-full w-[clamp(16.5rem,18vw,19rem)] px-3 py-3">
        <div className="portal-shell-card-strong portal-fade-up portal-fade-up-delay-2 flex h-full w-full flex-col rounded-[2rem] border border-sky-100/85 bg-white/88 p-4 shadow-[0_28px_64px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
          <div className="flex justify-end pb-3">
            <button
              aria-label="Portal navigation"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/92 text-slate-700 shadow-sm transition duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950"
              type="button"
            >
              <svg
                aria-hidden
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="m14.5 7.5-4.5 4.5 4.5 4.5" />
                <path d="m10 7.5-4.5 4.5 4.5 4.5" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <div className="h-full overflow-y-auto pr-1">
              <PortalNav orientation="sidebar" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
