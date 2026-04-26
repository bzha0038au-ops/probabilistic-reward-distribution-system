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

  const t = getServerTranslations();
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

export default function VerifyEmail({
  searchParams,
}: {
  searchParams?: { token?: string; error?: string };
}) {
  const t = getServerTranslations();
  const token = searchParams?.token ?? '';
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : !token
      ? t('auth.verificationTokenMissing')
      : null;

  return (
    <AuthPageShell>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t('auth.verifyEmailTitle')}</CardTitle>
          <CardDescription>{t('auth.verifyEmailDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={verifyEmailAction} className="flex flex-col space-y-4">
            <input type="hidden" name="token" value={token} />
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            <SubmitButton
              loadingLabel={t('common.loading')}
              idleLabel={t('common.submit')}
            >
              {t('auth.verifyEmailAction')}
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
