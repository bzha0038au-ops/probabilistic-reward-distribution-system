import { DrawPanel } from '@/modules/draw/components/draw-panel';
import { Button } from '@/components/ui/button';
import { auth, signOut } from '@/lib/auth';
import { USER_API_ROUTES } from '@/lib/api/user';
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function AppPage() {
  const session = await auth();
  const t = getServerTranslations();

  return (
    <main className="min-h-app-screen bg-slate-950 text-slate-100">
      <div className="page-safe-x page-safe-y mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
            <p className="break-all text-sm text-slate-400 sm:break-normal">
              {t('app.signedInAs', { email: session?.user?.email ?? '' })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LocaleSwitcher />
            <form
              action={async () => {
                'use server';
                const currentSession = await auth();
                if (currentSession?.backendToken) {
                  await apiRequestServer(
                    USER_API_ROUTES.auth.session,
                    {
                      method: 'DELETE',
                      headers: {
                        Authorization: `Bearer ${currentSession.backendToken}`,
                      },
                    },
                    { auth: false }
                  );
                }
                await signOut();
              }}
            >
              <Button variant="outline" className="w-full sm:w-auto">
                {t('common.signOut')}
              </Button>
            </form>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <DrawPanel />
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            <h2 className="text-base font-semibold text-slate-100">
              {t('app.balanceNotesTitle')}
            </h2>
            <ul className="mt-3 space-y-2">
              <li>{t('app.notes.0')}</li>
              <li>{t('app.notes.1')}</li>
              <li>{t('app.notes.2')}</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
