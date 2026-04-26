import type { ReactNode } from 'react';

import { LocaleSwitcher } from '@/components/locale-switcher';

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-app-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="page-safe-x page-safe-y mx-auto flex min-h-app-screen w-full max-w-xl flex-col">
        <div className="flex justify-end pb-4 sm:pb-6">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-2 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
