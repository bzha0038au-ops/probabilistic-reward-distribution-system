import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { signIn } from '@/lib/auth';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function Login({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const t = getServerTranslations();
  const error = searchParams?.error;
  const errorMessage =
    error === 'CredentialsSignin'
      ? t('auth.invalidCredentials')
      : error
        ? t('auth.loginFailed')
        : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
      <div className="absolute right-6 top-6">
        <LocaleSwitcher />
      </div>
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
