'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserDashboardCopy } from './user-dashboard-copy';
import { GameplayRouteCard } from './user-dashboard-route-card';
import type { UserDashboardController } from './use-user-dashboard';
import { resolveUserDashboardBadgeVariant as badgeVariant } from './user-dashboard-utils';

type Translate = (key: string) => string;

type AccountSectionController = Pick<
  UserDashboardController,
  | 'phone'
  | 'setPhone'
  | 'phoneCode'
  | 'setPhoneCode'
  | 'emailSubmitting'
  | 'phoneRequestSubmitting'
  | 'phoneConfirmSubmitting'
  | 'handleSendVerificationEmail'
  | 'handleSendPhoneCode'
  | 'handleConfirmPhone'
>;

type UserDashboardAccountSectionProps = {
  copy: UserDashboardCopy;
  controller: AccountSectionController;
  emailVerified: boolean;
  financeUnlocked: boolean;
  phoneVerified: boolean;
  showAccountRoutes: boolean;
  showGameplayRoutes: boolean;
  t: Translate;
};

export function UserDashboardAccountSection({
  copy: c,
  controller,
  emailVerified,
  financeUnlocked,
  phoneVerified,
  showAccountRoutes,
  showGameplayRoutes,
  t,
}: UserDashboardAccountSectionProps) {
  return (
    <>
      <section
        className={`grid gap-6 ${
          showGameplayRoutes ? 'xl:grid-cols-[1.2fr,0.8fr]' : 'xl:grid-cols-1'
        }`}
      >
        <Card>
          <CardHeader>
            <CardTitle>{c.accountTitle}</CardTitle>
            <CardDescription>{c.accountDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant={badgeVariant(emailVerified)}>
                {emailVerified ? c.emailVerified : c.emailPending}
              </Badge>
              <Badge variant={badgeVariant(phoneVerified)}>
                {phoneVerified ? c.phoneVerified : c.phonePending}
              </Badge>
              <Badge variant={badgeVariant(emailVerified)}>
                {emailVerified ? c.drawUnlocked : c.drawLocked}
              </Badge>
              <Badge variant={badgeVariant(financeUnlocked)}>
                {financeUnlocked ? c.financeUnlocked : c.financeLocked}
              </Badge>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {c.verificationBanner}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {emailVerified ? c.emailVerified : c.emailPending}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.drawLocked}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void controller.handleSendVerificationEmail()}
                  disabled={controller.emailSubmitting || emailVerified}
                >
                  {controller.emailSubmitting ? t('common.loading') : c.sendEmail}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {phoneVerified ? c.phoneVerified : c.phonePending}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.financeLocked}</p>
                </div>

                {!phoneVerified ? (
                  <div className="space-y-4">
                    <form
                      className="space-y-3"
                      onSubmit={controller.handleSendPhoneCode}
                    >
                      <div className="space-y-2">
                        <Label htmlFor="phone-number">{c.phoneLabel}</Label>
                        <Input
                          id="phone-number"
                          value={controller.phone}
                          onChange={(event) => controller.setPhone(event.target.value)}
                          placeholder={c.phonePlaceholder}
                          autoComplete="tel"
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={controller.phoneRequestSubmitting}
                      >
                        {controller.phoneRequestSubmitting
                          ? t('common.loading')
                          : c.sendCode}
                      </Button>
                    </form>

                    <form className="space-y-3" onSubmit={controller.handleConfirmPhone}>
                      <div className="space-y-2">
                        <Label htmlFor="phone-code">{c.codeLabel}</Label>
                        <Input
                          id="phone-code"
                          value={controller.phoneCode}
                          onChange={(event) => controller.setPhoneCode(event.target.value)}
                          placeholder={c.codePlaceholder}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </div>
                      <Button type="submit" disabled={controller.phoneConfirmSubmitting}>
                        {controller.phoneConfirmSubmitting
                          ? t('common.loading')
                          : c.confirmPhone}
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {c.phoneVerifiedNotice}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {showGameplayRoutes ? (
          <Card className="border-slate-200 bg-slate-50/80">
            <CardHeader>
              <CardTitle>{c.routesTitle}</CardTitle>
              <CardDescription>{c.routesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-4">
              <GameplayRouteCard
                href="/app/slot"
                title={c.gachaTitle}
                description={c.gachaDescription}
                openLabel={c.gachaOpen}
                statusLabel={t('draw.fairnessLive')}
                lockedNote={!emailVerified ? c.routeLockedHint : null}
              />
              <GameplayRouteCard
                href="/app/quick-eight"
                title={c.quickEightTitle}
                description={c.quickEightDescription}
                openLabel={c.quickEightOpen}
                statusLabel={c.drawUnlocked}
                lockedNote={!emailVerified ? c.routeLockedHint : null}
              />
              <GameplayRouteCard
                href="/app/blackjack"
                title={c.blackjackTitle}
                description={c.blackjackDescription}
                openLabel={c.blackjackOpen}
                statusLabel={c.drawUnlocked}
                lockedNote={!emailVerified ? c.routeLockedHint : null}
              />
              <GameplayRouteCard
                href="/app/fairness"
                title={c.fairnessTitle}
                description={c.fairnessDescription}
                openLabel={c.fairnessOpen}
                statusLabel={c.fairnessStatus}
                lockedNote={null}
              />
            </CardContent>
          </Card>
        ) : null}
      </section>

      {showAccountRoutes ? (
        <section>
          <Card className="border-slate-200 bg-slate-50/80">
            <CardHeader>
              <CardTitle>{c.accountRoutesTitle}</CardTitle>
              <CardDescription>{c.accountRoutesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-4">
              <GameplayRouteCard
                href="/app/rewards"
                title={c.rewardsRouteTitle}
                description={c.rewardsRouteDescription}
                openLabel={c.rewardsRouteOpen}
                statusLabel={c.rewardsRouteStatus}
              />
              <GameplayRouteCard
                href="/app/wallet"
                title={c.walletRouteTitle}
                description={c.walletRouteDescription}
                openLabel={c.walletRouteOpen}
                statusLabel={c.walletRouteStatus}
              />
              <GameplayRouteCard
                href="/app/payments"
                title={c.paymentsRouteTitle}
                description={c.paymentsRouteDescription}
                openLabel={c.paymentsRouteOpen}
                statusLabel={financeUnlocked ? c.financeUnlocked : c.paymentsRouteStatus}
                lockedNote={!financeUnlocked ? c.financeLocked : null}
              />
              <GameplayRouteCard
                href="/app/security"
                title={c.securityRouteTitle}
                description={c.securityRouteDescription}
                openLabel={c.securityRouteOpen}
                statusLabel={c.securityRouteStatus}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}
    </>
  );
}
