'use client';

import type { Locale } from '@/lib/i18n/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserDashboardCopy } from './user-dashboard-copy';
import { WalletActivityCard, WalletSummaryCard } from './user-dashboard-domain-ui';
import type { UserDashboardController } from './use-user-dashboard';
import { UserDashboardEconomySection } from './user-dashboard-economy-section';
import {
  formatUserDashboardActivitySource,
  formatUserDashboardActivityType,
} from './user-dashboard-utils';

type WalletSectionController = Pick<
  UserDashboardController,
  | 'wallet'
  | 'walletBalance'
  | 'activityEntries'
  | 'handleRefresh'
  | 'refreshing'
>;

type UserDashboardWalletSectionProps = {
  controller: WalletSectionController;
  copy: UserDashboardCopy;
  locale: Locale;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  loadingLabel: string;
};

export function UserDashboardWalletSection({
  controller,
  copy: c,
  locale,
  formatAmount,
  formatDateTime,
  loadingLabel,
}: UserDashboardWalletSectionProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{c.walletTitle}</CardTitle>
          <CardDescription>{c.walletDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <UserDashboardEconomySection
            locale={locale}
            wallet={controller.wallet}
            formatAmount={formatAmount}
            formatDateTime={formatDateTime}
            onRefreshWallet={async () => {
              await controller.handleRefresh();
            }}
          />

          <WalletSummaryCard
            label={c.currentBalance}
            value={formatAmount(controller.walletBalance)}
            valueTestId="wallet-current-balance"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{c.transactionsTitle}</CardTitle>
              <CardDescription>{c.transactionsDescription}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void controller.handleRefresh()}
              disabled={controller.refreshing}
              data-testid="wallet-refresh-button"
            >
              {controller.refreshing ? loadingLabel : c.refresh}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {controller.activityEntries.length === 0 ? (
            <p className="text-sm text-slate-500">{c.noTransactions}</p>
          ) : (
            controller.activityEntries.map((entry) => (
              <WalletActivityCard
                key={entry.id}
                title={formatUserDashboardActivityType(locale, entry.entryType)}
                timestamp={formatDateTime(entry.createdAt)}
                amount={formatAmount(entry.amount)}
                amountTone={entry.amount.startsWith('-') ? 'negative' : 'positive'}
                beforeLabel={c.before}
                beforeValue={formatAmount(entry.balanceBefore)}
                afterLabel={c.after}
                afterValue={formatAmount(entry.balanceAfter)}
                badges={
                  <>
                    <Badge variant="outline">
                      {formatUserDashboardActivitySource(locale, entry.source)}
                    </Badge>
                    {entry.assetCode ? (
                      <Badge variant="secondary">{entry.assetCode}</Badge>
                    ) : null}
                  </>
                }
              />
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
