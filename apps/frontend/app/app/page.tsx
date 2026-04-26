import { USER_API_ROUTES } from '@/lib/api/user';
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutForm } from '@/components/logout-form';
import { UserDashboard } from '@/modules/app/components/user-dashboard';
import { redirect } from 'next/navigation';
import type { CurrentUserSessionResponse } from '@reward/shared-types';

export default async function AppPage() {
  const t = getServerTranslations();
  const currentSession = await apiRequestServer<CurrentUserSessionResponse>(
    USER_API_ROUTES.auth.session,
    { cache: 'no-store' }
  );
  if (!currentSession.ok) {
    redirect('/login');
  }
  const currentUser = currentSession.data.user;

  return (
    <main className="min-h-app-screen bg-slate-950 text-slate-100">
      <div className="page-safe-x page-safe-y mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
            <p className="break-all text-sm text-slate-400 sm:break-normal">
              {t('app.signedInAs', { email: currentUser.email })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LocaleSwitcher />
            <LogoutForm label={t('common.signOut')} />
          </div>
        </header>

        <UserDashboard initialCurrentSession={currentSession.data} />
      </div>
    </main>
  );
}
