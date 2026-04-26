import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import { AuthPageShell } from '@/components/auth-page-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { signIn } from '@/lib/auth';
import { getServerTranslations } from '@/lib/i18n/server';

export default function Login({
  searchParams,
}: {
  searchParams?: { error?: string; registered?: string; verified?: string; reset?: string };
}) {
  const t = getServerTranslations();
  const error = searchParams?.error;
  const errorMessage =
    error === 'CredentialsSignin'
      ? t('auth.invalidCredentials')
      : error
        ? decodeURIComponent(error)
        : null;
  const noticeMessage =
    searchParams?.registered === '1'
      ? t('auth.registrationSuccess')
      : searchParams?.verified === '1'
        ? t('auth.verificationSuccess')
        : searchParams?.reset === '1'
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
          <Form
            action={async (formData: FormData) => {
              'use server';
              try {
                await signIn('credentials', {
                  redirectTo: '/app',
                  email: formData.get('email') as string,
                  password: formData.get('password') as string,
                });
              } catch (error) {
                const type = (error as { type?: string })?.type;
                if (type) {
                  redirect(`/login?error=${encodeURIComponent(type)}`);
                }
                throw error;
              }
            }}
            labels={{
              emailLabel: t('common.email'),
              passwordLabel: t('common.password'),
              emailPlaceholder: t('common.emailPlaceholder'),
            }}
          >
            {noticeMessage && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {noticeMessage}
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
              {t('common.signIn')}
            </SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
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
          </Form>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
