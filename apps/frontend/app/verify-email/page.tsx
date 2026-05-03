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
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';

async function verifyEmailAction(formData: FormData) {
  'use server';

  const t = await getServerTranslations();
  const token = String(formData.get('token') ?? '').trim();
  if (!token) {
    redirect(`/verify-email?error=${encodeURIComponent(t('auth.verificationTokenMissing'))}`);
  }

  const result = await apiRequestServer<{ verified: true; email: string }>(
    '/auth/email-verification/confirm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    },
    { auth: false }
  );

  if (!result.ok) {
    redirect(
      `/verify-email?token=${encodeURIComponent(token)}&error=${encodeURIComponent(
        result.error?.message ?? t('auth.verificationFailed')
      )}`
    );
  }

  redirect('/login?verified=1');
}

export default async function VerifyEmail({
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
      ? t('auth.verificationTokenMissing')
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
                  {t('auth.verifyEmailTitle')}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {t('auth.verifyEmailDescription')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-0 pb-0">
              <form action={verifyEmailAction} className="flex flex-col space-y-4">
                <input type="hidden" name="token" value={token} />
                {errorMessage ? (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {errorMessage}
                  </p>
                ) : (
                  <div className="rounded-[1rem] border-2 border-[var(--retro-violet)] bg-[rgba(97,88,255,0.08)] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {t('auth.verifyEmailDescription')}
                  </div>
                )}
                <SubmitButton
                  loadingLabel={t('common.loading')}
                  idleLabel={t('common.submit')}
                >
                  {t('auth.verifyEmailAction')}
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
