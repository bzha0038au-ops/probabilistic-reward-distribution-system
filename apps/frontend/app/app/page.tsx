import { DrawPanel } from '@/modules/draw/components/draw-panel';
import { Button } from '@/components/ui/button';
import { auth, signOut } from '@/lib/auth';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function AppPage() {
  const session = await auth();
  const t = getServerTranslations();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
            <p className="text-sm text-slate-400">
              {t('app.signedInAs', { email: session?.user?.email ?? '' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <form
              action={async () => {
                'use server';
                await signOut();
              }}
            >
              <Button variant="outline">{t('common.signOut')}</Button>
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
