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

  const t = getServerTranslations();
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

export default function ResetPassword({
  searchParams,
}: {
  searchParams?: { token?: string; error?: string };
}) {
  const t = getServerTranslations();
  const token = searchParams?.token ?? '';
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : !token
      ? t('auth.resetTokenMissing')
      : null;

  return (
    <AuthPageShell>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t('auth.passwordResetTitle')}</CardTitle>
          <CardDescription>{t('auth.passwordResetDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={resetPasswordAction} className="flex flex-col space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="password">{t('common.newPassword')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            <SubmitButton
              loadingLabel={t('common.loading')}
              idleLabel={t('common.submit')}
            >
              {t('auth.passwordResetTitle')}
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
