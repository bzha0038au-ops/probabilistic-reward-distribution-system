'use client';

import type { Locale } from '@/lib/i18n/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserDashboardCopy } from './user-dashboard-copy';
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

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm text-slate-500">{c.currentBalance}</p>
            <p
              className="mt-2 text-3xl font-semibold text-slate-950"
              data-testid="wallet-current-balance"
            >
              {formatAmount(controller.walletBalance)}
            </p>
          </div>
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
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">
                      {formatUserDashboardActivityType(
                        locale,
                        entry.entryType,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        entry.amount.startsWith('-')
                          ? 'font-semibold text-rose-600'
                          : 'font-semibold text-emerald-600'
                      }
                    >
                      {formatAmount(entry.amount)}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <Badge variant="outline">
                        {formatUserDashboardActivitySource(
                          locale,
                          entry.source,
                        )}
                      </Badge>
                      {entry.assetCode ? (
                        <Badge variant="secondary">{entry.assetCode}</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-1 text-sm text-slate-500 sm:grid-cols-2">
                  <p>
                    {c.before}: {formatAmount(entry.balanceBefore)}
                  </p>
                  <p>
                    {c.after}: {formatAmount(entry.balanceAfter)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
