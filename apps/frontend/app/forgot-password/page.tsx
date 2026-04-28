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
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t('auth.forgotPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.forgotPasswordDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestPasswordResetAction} className="flex flex-col space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t('common.emailPlaceholder')}
                autoComplete="email"
                required
              />
            </div>
            {sentMessage && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {sentMessage}
              </p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            <SubmitButton
              loadingLabel={t('common.loading')}
              idleLabel={t('common.submit')}
            >
              {t('auth.forgotPasswordTitle')}
            </SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-semibold text-foreground">
                {t('common.signIn')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
