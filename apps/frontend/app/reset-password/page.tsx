import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SubmitButton } from '@/app/submit-button';
import { AuthPageShell } from '@/components/auth-page-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';

async function resetPasswordAction(formData: FormData) {
  'use server';

  const t = await getServerTranslations();
  const token = String(formData.get('token') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!token || !password) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        t('auth.resetTokenMissing')
      )}`
    );
  }

  const result = await apiRequestServer<{ completed: true }>(
    '/auth/password-reset/confirm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
      cache: 'no-store',
    },
    { auth: false }
  );

  if (!result.ok) {
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        result.error?.message ?? t('auth.passwordResetFailed')
      )}`
    );
  }

  redirect('/login?reset=1');
}

export default async function ResetPassword({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const t = await getServerTranslations();
  const token = resolvedSearchParams?.token ?? '';
  const errorMessage = resolvedSearchParams?.error
    ? decodeURIComponent(resolvedSearchParams.error)
    : !token
      ? t('auth.resetTokenMissing')
      : null;

  return (
    <AuthPageShell>
      <Card className="retro-panel w-full max-w-xl overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="retro-ivory-surface relative p-6 md:p-7">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative space-y-6">
            <CardHeader className="space-y-2 px-0 pt-0 text-center">
              <div className="space-y-2">
                <CardTitle className="text-[2.2rem] tracking-[-0.04em] text-[var(--retro-ink)]">
                  {t('auth.passwordResetTitle')}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {t('auth.passwordResetDescription')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-0 pb-0">
              <form action={resetPasswordAction} className="flex flex-col space-y-4">
                <input type="hidden" name="token" value={token} />
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[var(--retro-ink)]">
                    {t('common.newPassword')}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    className="retro-field h-12 border-none px-4 text-base"
                  />
                </div>
                {errorMessage && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {errorMessage}
                  </p>
                )}
                <SubmitButton
                  loadingLabel={t('common.loading')}
                  idleLabel={t('common.submit')}
                >
                  {t('auth.passwordResetTitle')}
                </SubmitButton>
              </form>

              <div className="border-t border-[rgba(15,17,31,0.12)] pt-5 text-center text-sm text-[rgba(15,17,31,0.64)]">
                <Link
                  href="/login"
                  className="font-semibold text-[var(--retro-orange)] transition hover:text-[var(--retro-violet)]"
                >
                  {t('common.signIn')}
                </Link>
              </div>
            </CardContent>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
