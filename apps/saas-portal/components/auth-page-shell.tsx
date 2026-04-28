import type { ReactNode } from "react";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-app-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_100%)]">
      <div className="page-safe-x page-safe-y mx-auto flex min-h-app-screen w-full max-w-6xl flex-col">
        <div className="flex flex-1 items-center justify-center py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
