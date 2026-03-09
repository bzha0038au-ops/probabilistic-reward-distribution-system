import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequestServer } from '@/lib/api/server';
import { getServerTranslations } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

async function registerAction(formData: FormData) {
  'use server';

  const t = getServerTranslations();
  const email = String(formData.get('email') ?? '').toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect(`/register?error=${encodeURIComponent(t('auth.missingFields'))}`);
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
    const message = result.error?.message ?? t('auth.registerFailed');
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  redirect('/login');
}

export default function Register({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const pageT = getServerTranslations();
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
      <div className="absolute right-6 top-6">
        <LocaleSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{pageT('auth.registerTitle')}</CardTitle>
          <CardDescription>{pageT('auth.registerDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            action={registerAction}
            labels={{
              emailLabel: pageT('common.email'),
              passwordLabel: pageT('common.password'),
              emailPlaceholder: pageT('common.emailPlaceholder'),
            }}
          >
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            <SubmitButton
              loadingLabel={pageT('common.loading')}
              idleLabel={pageT('common.submit')}
            >
              {pageT('common.createAccount')}
            </SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              {pageT('auth.haveAccount')}{' '}
              <Link href="/login" className="font-semibold text-foreground">
                {pageT('common.signIn')}
              </Link>
            </p>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
