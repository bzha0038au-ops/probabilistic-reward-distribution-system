import Link from 'next/link';
import { TbArrowRight, TbLogin2 } from 'react-icons/tb';

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
      <Card className="retro-panel-featured w-full max-w-xl overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="retro-ivory-surface relative p-6 md:p-7">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative space-y-6">
            <CardHeader className="space-y-2 px-0 pt-0 text-center">
              <div className="space-y-2">
                <CardTitle className="inline-flex items-center justify-center gap-3 text-[2.25rem] tracking-[-0.04em] text-[var(--retro-ink)]">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(15,17,31,0.14)] bg-white/84 text-[var(--retro-orange)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]">
                    <TbLogin2 className="h-5 w-5" />
                  </span>
                  {t('auth.loginTitle')}
                </CardTitle>
                <CardDescription className="text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {t('auth.loginDescription')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-0 pb-0">
              <LoginForm
                emailLabel={t('common.email')}
                passwordLabel={t('common.password')}
                emailPlaceholder={t('common.emailPlaceholder')}
                submitLabel={t('common.signIn')}
                loadingLabel={t('common.loading')}
                idleLabel={t('common.submit')}
                requestFailedMessage={t('auth.loginFailed')}
                noticeMessage={noticeMessage}
                initialErrorMessage={errorMessage}
                redirectTo={resolvedSearchParams?.callbackUrl ?? '/app'}
              />

              <div className="flex flex-col gap-3 border-t border-[rgba(15,17,31,0.12)] pt-5 text-center text-sm text-[rgba(15,17,31,0.64)]">
                <p>
                  {t('auth.noAccount')}{' '}
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--retro-orange)] transition hover:text-[var(--retro-violet)]"
                  >
                    <TbArrowRight className="h-4 w-4" />
                    {t('common.signUp')}
                  </Link>
                </p>
                <p>
                  <Link
                    href="/forgot-password"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--retro-ink)] transition hover:text-[var(--retro-orange)]"
                  >
                    <TbArrowRight className="h-4 w-4" />
                    {t('auth.forgotPassword')}
                  </Link>
                </p>
              </div>
            </CardContent>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
