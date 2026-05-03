'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DashboardFeedbackNotice,
  SecuritySessionCard,
} from './user-dashboard-domain-ui';
import type { UserDashboardCopy } from './user-dashboard-copy';
import type { UserDashboardController } from './use-user-dashboard';
import { resolveUserDashboardBadgeVariant as badgeVariant } from './user-dashboard-utils';

type Translate = (key: string) => string;

type SecurityPageController = Pick<
  UserDashboardController,
  | 'currentSession'
  | 'sessions'
  | 'refreshing'
  | 'sessionLoading'
  | 'phone'
  | 'setPhone'
  | 'phoneCode'
  | 'setPhoneCode'
  | 'emailSubmitting'
  | 'phoneRequestSubmitting'
  | 'phoneConfirmSubmitting'
  | 'handleRefresh'
  | 'handleRevokeSession'
  | 'handleRevokeAllSessions'
  | 'handleSendVerificationEmail'
  | 'handleSendPhoneCode'
  | 'handleConfirmPhone'
>;

type UserDashboardSecurityPageProps = {
  controller: SecurityPageController;
  copy: UserDashboardCopy;
  emailVerified: boolean;
  phoneVerified: boolean;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatStatus: (value: string | null | undefined) => string;
  t: Translate;
};

export function UserDashboardSecurityPage({
  controller,
  copy: c,
  emailVerified,
  phoneVerified,
  formatDateTime,
  formatStatus,
  t,
}: UserDashboardSecurityPageProps) {
  const otherSessions = useMemo(() => {
    const seenSessionIds = new Set<string>([controller.currentSession.sessionId]);

    return controller.sessions.filter((entry) => {
      if (seenSessionIds.has(entry.sessionId) || entry.current) {
        return false;
      }

      seenSessionIds.add(entry.sessionId);
      return true;
    });
  }, [controller.currentSession.sessionId, controller.sessions]);

  const activeCheckpoints = Number(emailVerified) + Number(phoneVerified);
  const activeSessionCount = 1 + otherSessions.length;
  const securityTier = phoneVerified
    ? c.securityTierAdvanced
    : emailVerified
      ? c.securityTierActive
      : c.securityTierPending;

  return (
    <div className="space-y-6">
      <Card className="retro-panel-featured overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
          <div className="absolute inset-0 retro-dot-overlay opacity-25" />
          <div className="absolute inset-y-0 right-0 hidden w-32 bg-gradient-to-r from-transparent via-[rgba(97,88,255,0.08)] to-[rgba(97,88,255,0.16)] xl:block" />

          <div className="relative space-y-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <Badge className="retro-badge retro-badge-gold border-none">
                  {c.securityHeroEyebrow}
                </Badge>
                <div className="space-y-3">
                  <CardTitle className="text-[clamp(2.9rem,6vw,5.2rem)] font-black tracking-[-0.06em] text-[var(--retro-orange)]">
                    {c.securityHeroTitle}
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-base leading-8 text-[rgba(15,17,31,0.72)]">
                    {c.securityHeroDescription}
                  </CardDescription>
                </div>
              </div>

              <div className="rounded-[1.5rem] border-2 border-[var(--retro-ink)] bg-white/82 px-5 py-4 shadow-[6px_6px_0px_0px_rgba(15,17,31,0.94)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.securitySummaryLevel}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                  {securityTier}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.securitySummaryChecks}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]">
                  {activeCheckpoints}/2
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.securitySummarySessions}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]">
                  {activeSessionCount}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.securitySummaryAccess}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                  {emailVerified ? c.drawUnlocked : c.drawLocked}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.04fr,0.96fr]">
        <Card className="retro-panel rounded-[1.9rem] border-none">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-[2rem] tracking-[-0.04em] text-[var(--retro-ink)]">
                  {c.securityIdentityTitle}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                  {c.securityIdentityDescription}
                </CardDescription>
              </div>
              <Badge className="retro-badge retro-badge-gold border-none">
                {securityTier}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div
              className={cn(
                'rounded-[1.5rem] border-2 bg-white/78 p-5',
                emailVerified
                  ? 'border-[rgba(15,17,31,0.14)]'
                  : 'border-[var(--retro-orange)]',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-[1.7rem] font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                    {c.securityEmailStepTitle}
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.66)]">
                    {c.securityEmailStepDescription}
                  </p>
                </div>
                <Badge
                  variant={badgeVariant(emailVerified)}
                  className={
                    emailVerified
                      ? 'retro-badge retro-badge-green border-none'
                      : 'retro-badge retro-badge-gold border-none'
                  }
                >
                  {emailVerified ? c.emailVerified : c.emailPending}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={emailVerified ? 'arcadeOutline' : 'arcade'}
                  onClick={() => void controller.handleSendVerificationEmail()}
                  disabled={controller.emailSubmitting || emailVerified}
                >
                  {controller.emailSubmitting ? t('common.loading') : c.sendEmail}
                </Button>
                <p className="text-sm text-[rgba(15,17,31,0.62)]">
                  {emailVerified ? c.drawUnlocked : c.drawLocked}
                </p>
              </div>
            </div>

            <div
              className={cn(
                'rounded-[1.5rem] border-2 p-5 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]',
                phoneVerified
                  ? 'border-[rgba(15,17,31,0.14)] bg-white/78'
                  : 'border-[var(--retro-orange)] bg-[linear-gradient(180deg,rgba(255,241,232,0.96),rgba(255,228,210,0.88))]',
              )}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[1.7rem] font-black tracking-[-0.04em] text-[var(--retro-orange)]">
                    {c.securityPhoneStepTitle}
                  </p>
                  <Badge
                    variant={badgeVariant(phoneVerified)}
                    className={
                      phoneVerified
                        ? 'retro-badge retro-badge-green border-none'
                        : 'retro-badge retro-badge-violet border-none'
                    }
                  >
                    {phoneVerified ? c.phoneVerified : c.phonePending}
                  </Badge>
                </div>
                <p className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                  {c.securityPhoneStepDescription}
                </p>
              </div>

              {!phoneVerified ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <form className="space-y-3" onSubmit={controller.handleSendPhoneCode}>
                    <div className="space-y-2">
                      <Label htmlFor="security-phone-number">{c.phoneLabel}</Label>
                      <Input
                        id="security-phone-number"
                        value={controller.phone}
                        onChange={(event) => controller.setPhone(event.target.value)}
                        placeholder={c.phonePlaceholder}
                        autoComplete="tel"
                        className="retro-field h-12"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="arcadeOutline"
                      disabled={controller.phoneRequestSubmitting}
                    >
                      {controller.phoneRequestSubmitting
                        ? t('common.loading')
                        : c.sendCode}
                    </Button>
                  </form>

                  <form className="space-y-3" onSubmit={controller.handleConfirmPhone}>
                    <div className="space-y-2">
                      <Label htmlFor="security-phone-code">{c.codeLabel}</Label>
                      <Input
                        id="security-phone-code"
                        value={controller.phoneCode}
                        onChange={(event) => controller.setPhoneCode(event.target.value)}
                        placeholder={c.codePlaceholder}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="retro-field h-12"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="arcade"
                      disabled={controller.phoneConfirmSubmitting}
                    >
                      {controller.phoneConfirmSubmitting
                        ? t('common.loading')
                        : c.confirmPhone}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="mt-5">
                  <DashboardFeedbackNotice tone="success">
                    {c.phoneVerifiedNotice}
                  </DashboardFeedbackNotice>
                </div>
              )}
            </div>

            <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/82 p-4 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[var(--retro-ink)]">
                    {c.verificationRouteTitle}
                  </p>
                  <p className="text-sm leading-6 text-[rgba(15,17,31,0.62)]">
                    {c.securityVerificationRouteDescription}
                  </p>
                </div>
                <Button asChild variant="arcadeDark">
                  <Link href="/app/verification">{c.verificationRouteOpen}</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="retro-panel rounded-[1.85rem] border-none">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-[var(--retro-ink)]">
                    {c.securityDefenseTitle}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                    {c.securityDefenseDescription}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  onClick={() => void controller.handleRefresh()}
                  disabled={controller.refreshing}
                >
                  {controller.refreshing ? t('common.loading') : c.refresh}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,17,31,0.12)] pb-4">
                <div>
                  <p className="text-lg font-semibold text-[var(--retro-ink)]">
                    {c.securityDefenseEmail}
                  </p>
                  <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">
                    {emailVerified ? c.emailVerified : c.emailPending}
                  </p>
                </div>
                <Badge
                  className={
                    emailVerified
                      ? 'retro-badge retro-badge-green border-none'
                      : 'retro-badge retro-badge-gold border-none'
                  }
                >
                  {emailVerified ? c.verified : c.pending}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,17,31,0.12)] pb-4">
                <div>
                  <p className="text-lg font-semibold text-[var(--retro-ink)]">
                    {c.securityDefensePhone}
                  </p>
                  <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">
                    {phoneVerified ? c.phoneVerified : c.phonePending}
                  </p>
                </div>
                <Badge
                  className={
                    phoneVerified
                      ? 'retro-badge retro-badge-green border-none'
                      : 'retro-badge retro-badge-violet border-none'
                  }
                >
                  {phoneVerified ? c.verified : c.pending}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[var(--retro-ink)]">
                    {c.securityDefenseSessions}
                  </p>
                  <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">
                    {activeSessionCount} · {c.securityDefenseExpires}{' '}
                    {formatDateTime(controller.currentSession.expiresAt)}
                  </p>
                </div>
                <Badge className="retro-badge retro-badge-ink border-none">
                  {activeSessionCount}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="retro-panel-dark relative overflow-hidden rounded-[1.85rem] border-none">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,213,61,0.18),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(97,88,255,0.22),transparent_28%)]" />
            <CardContent className="relative space-y-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[1.9rem] font-black tracking-[-0.03em] text-white">
                    {c.securityGuardTitle}
                  </p>
                  <p className="max-w-xl text-sm leading-7 text-slate-300">
                    {c.securityGuardDescription}
                  </p>
                </div>
                <Badge className="retro-badge retro-badge-gold border-none">
                  {securityTier}
                </Badge>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[1.15rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-slate-100">
                  {c.securityGuardEmail}
                </div>
                <div className="rounded-[1.15rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-slate-100">
                  {c.securityGuardPhone}
                </div>
                <div className="rounded-[1.15rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-slate-100">
                  {c.securityGuardSessions}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-[1.7rem] border-2 border-dashed border-[var(--retro-red)] bg-[#fff4ef] px-5 py-5">
            <p className="text-[0.8rem] font-black uppercase tracking-[0.22em] text-[var(--retro-red)]">
              {c.securityRiskTitle}
            </p>
            <p className="mt-3 text-sm leading-7 text-[rgba(15,17,31,0.72)]">
              {c.securityRiskDescription}
            </p>
          </div>
        </div>
      </div>

      <Card className="retro-panel rounded-[1.9rem] border-none" id="security-sessions">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-[var(--retro-ink)]">
                {c.sessionsTitle}
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                {c.sessionsDescription}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="arcadeOutline"
                size="sm"
                onClick={() => void controller.handleRefresh()}
                disabled={controller.refreshing}
              >
                {controller.refreshing ? t('common.loading') : c.refresh}
              </Button>
              <Button
                type="button"
                variant="arcade"
                size="sm"
                onClick={() => void controller.handleRevokeAllSessions()}
                disabled={controller.sessionLoading}
              >
                {controller.sessionLoading ? t('common.loading') : c.signOutEverywhere}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 xl:grid-cols-2">
          <SecuritySessionCard
            title={c.currentDevice}
            badge={
              <Badge
                variant={badgeVariant(true)}
                className="retro-badge retro-badge-gold border-none"
              >
                {c.currentDevice}
              </Badge>
            }
            userAgent={controller.currentSession.userAgent ?? c.unknown}
            details={
              <>
                <p>
                  {c.device}: {controller.currentSession.ip ?? c.unknown}
                </p>
                <p>
                  {c.createdAt}: {formatDateTime(controller.currentSession.createdAt)}
                </p>
                <p>
                  {c.expires}: {formatDateTime(controller.currentSession.expiresAt)}
                </p>
              </>
            }
            action={
              <Button
                type="button"
                variant="arcade"
                size="sm"
                onClick={() =>
                  void controller.handleRevokeSession(
                    controller.currentSession.sessionId,
                    true,
                  )
                }
                disabled={controller.sessionLoading}
              >
                {controller.sessionLoading ? t('common.loading') : c.signOutThisDevice}
              </Button>
            }
          />

          {otherSessions.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-[rgba(15,17,31,0.16)] bg-white/74 px-4 py-5 text-sm leading-7 text-[rgba(15,17,31,0.62)]">
              {c.noSessions}
            </div>
          ) : (
            <div className="space-y-4 xl:col-span-1" data-testid="security-other-sessions">
              {otherSessions.map((entry) => (
                <SecuritySessionCard
                  key={entry.sessionId}
                  title={c.activeSession}
                  badge={
                    <Badge
                      variant={badgeVariant(false)}
                      className="retro-badge retro-badge-violet border-none"
                    >
                      {formatStatus(entry.kind)}
                    </Badge>
                  }
                  userAgent={entry.userAgent ?? c.unknown}
                  details={
                    <>
                      <p>
                        {c.device}: {entry.ip ?? c.unknown}
                      </p>
                      <p>
                        {c.createdAt}: {formatDateTime(entry.createdAt)}
                      </p>
                      <p>
                        {c.expires}: {formatDateTime(entry.expiresAt)}
                      </p>
                    </>
                  }
                  action={
                    <Button
                      type="button"
                      variant="arcadeOutline"
                      size="sm"
                      onClick={() =>
                        void controller.handleRevokeSession(entry.sessionId, false)
                      }
                      disabled={controller.sessionLoading}
                    >
                      {controller.sessionLoading ? t('common.loading') : c.revoke}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
