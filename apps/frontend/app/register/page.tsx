import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function Register() {
  const t = getServerTranslations();
  async function register(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').toLowerCase();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      return t('auth.missingFields');
    }

    const result = await apiRequestServer<{ id: number; email: string }>(
      '/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!result.ok) {
      return result.error?.message ?? t('auth.registerFailed');
    }

    redirect('/login');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
      <div className="absolute right-6 top-6">
        <LocaleSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t('auth.registerTitle')}</CardTitle>
          <CardDescription>{t('auth.registerDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            action={register}
            labels={{
              emailLabel: t('common.email'),
              passwordLabel: t('common.password'),
              emailPlaceholder: t('common.emailPlaceholder'),
            }}
          >
            <SubmitButton
              loadingLabel={t('common.loading')}
              idleLabel={t('common.submit')}
            >
              {t('common.createAccount')}
            </SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              {t('auth.haveAccount')}{' '}
              <Link href="/login" className="font-semibold text-foreground">
                {t('common.signIn')}
              </Link>
            </p>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
