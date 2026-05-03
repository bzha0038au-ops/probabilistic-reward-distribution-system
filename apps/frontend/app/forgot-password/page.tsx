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

async function requestPasswordResetAction(formData: FormData) {
  'use server';

  const t = await getServerTranslations();
  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent(t('auth.missingFields'))}`);
  }

  const result = await apiRequestServer<{ accepted: true }>(
    '/auth/password-reset/request',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    },
    { auth: false }
  );

  if (!result.ok) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        result.error?.message ?? t('auth.passwordResetFailed')
      )}`
    );
  }

  redirect('/forgot-password?sent=1');
}

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; sent?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const t = await getServerTranslations();
  const errorMessage = resolvedSearchParams?.error
    ? decodeURIComponent(resolvedSearchParams.error)
    : null;
  const sentMessage =
    resolvedSearchParams?.sent === '1'
      ? t('auth.forgotPasswordSubmitted')
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
                  {t('auth.forgotPasswordTitle')}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {t('auth.forgotPasswordDescription')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-0 pb-0">
              <form action={requestPasswordResetAction} className="flex flex-col space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[var(--retro-ink)]">
                    {t('common.email')}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t('common.emailPlaceholder')}
                    autoComplete="email"
                    required
                    className="retro-field h-12 border-none px-4 text-base"
                  />
                </div>
                {sentMessage && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-green)] bg-[#e7fff1] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {sentMessage}
                  </p>
                )}
                {errorMessage && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {errorMessage}
                  </p>
                )}
                <SubmitButton
                  loadingLabel={t('common.loading')}
                  idleLabel={t('common.submit')}
                >
                  {t('auth.forgotPasswordTitle')}
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
