import Link from 'next/link';

import { AuthPageShell } from '@/components/auth-page-shell';
import { LoginForm } from '@/components/login-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getServerTranslations } from '@/lib/i18n/server';

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
    registered?: string;
    verified?: string;
    reset?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const t = await getServerTranslations();
  const error = resolvedSearchParams?.error;
  const errorMessage =
    error === 'CredentialsSignin'
      ? t('auth.invalidCredentials')
      : error
        ? decodeURIComponent(error)
        : null;
  const noticeMessage =
    resolvedSearchParams?.registered === '1'
      ? t('auth.registrationSuccess')
      : resolvedSearchParams?.verified === '1'
        ? t('auth.verificationSuccess')
        : resolvedSearchParams?.reset === '1'
          ? t('auth.passwordResetSuccess')
          : null;

  return (
    <AuthPageShell>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('auth.loginDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            emailLabel={t('common.email')}
            passwordLabel={t('common.password')}
            emailPlaceholder={t('common.emailPlaceholder')}
            submitLabel={t('common.signIn')}
            loadingLabel={t('common.loading')}
            idleLabel={t('common.submit')}
            noticeMessage={noticeMessage}
            initialErrorMessage={errorMessage}
            redirectTo={resolvedSearchParams?.callbackUrl ?? '/app'}
          />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="font-semibold text-foreground">
              {t('common.signUp')}
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="font-semibold text-foreground">
              {t('auth.forgotPassword')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
