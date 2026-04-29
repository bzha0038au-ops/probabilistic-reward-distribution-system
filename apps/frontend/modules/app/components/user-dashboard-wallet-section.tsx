'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserDashboardCopy } from './user-dashboard-copy';
import type { UserDashboardController } from './use-user-dashboard';
import { UserDashboardEconomySection } from './user-dashboard-economy-section';
import {
  cryptoChannelLabel,
  readVisibleFinanceStatus,
  resolveUserDashboardBadgeVariant as badgeVariant,
} from './user-dashboard-utils';

type Translate = (key: string) => string;

type WalletSectionController = Pick<
  UserDashboardController,
  | 'wallet'
  | 'walletBalance'
  | 'topUpAmount'
  | 'setTopUpAmount'
  | 'topUpReferenceId'
  | 'setTopUpReferenceId'
  | 'topUpSubmitting'
  | 'selectedCryptoChannelId'
  | 'setSelectedCryptoChannelId'
  | 'cryptoDepositAmount'
  | 'setCryptoDepositAmount'
  | 'cryptoDepositTxHash'
  | 'setCryptoDepositTxHash'
  | 'cryptoDepositFromAddress'
  | 'setCryptoDepositFromAddress'
  | 'cryptoDepositSubmitting'
  | 'cryptoDepositChannels'
  | 'fiatTopUps'
  | 'cryptoTopUps'
  | 'refreshing'
  | 'handleCreateTopUp'
  | 'handleRefresh'
  | 'handleCreateCryptoDeposit'
>;

type UserDashboardWalletSectionProps = {
  controller: WalletSectionController;
  copy: UserDashboardCopy;
  locale: string;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatStatus: (value: string | null | undefined) => string;
  t: Translate;
};

export function UserDashboardWalletSection({
  controller,
  copy: c,
  locale,
  formatAmount,
  formatDateTime,
  formatStatus,
  t,
}: UserDashboardWalletSectionProps) {
  return (
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
            await controller.handleRefresh()
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

        <div className="grid gap-2 text-sm text-slate-600">
          <p>{c.topUpSectionLabel}</p>
          <p>{t('app.notes.0')}</p>
          <p>{t('app.notes.1')}</p>
          <p>{t('app.notes.2')}</p>
        </div>

        <form className="space-y-4" onSubmit={controller.handleCreateTopUp}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="top-up-amount">{c.topUpAmount}</Label>
              <Input
                id="top-up-amount"
                value={controller.topUpAmount}
                onChange={(event) => controller.setTopUpAmount(event.target.value)}
                inputMode="decimal"
                placeholder="100.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="top-up-reference">{c.referenceId}</Label>
              <Input
                id="top-up-reference"
                value={controller.topUpReferenceId}
                onChange={(event) =>
                  controller.setTopUpReferenceId(event.target.value)
                }
                placeholder={c.referencePlaceholder}
              />
            </div>
          </div>
          <Button type="submit" disabled={controller.topUpSubmitting}>
            {controller.topUpSubmitting ? t('common.loading') : c.createTopUp}
          </Button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">{c.recentTopUps}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="wallet-refresh-button"
              onClick={() => void controller.handleRefresh()}
              disabled={controller.refreshing}
            >
              {controller.refreshing ? t('common.loading') : c.refresh}
            </Button>
          </div>
          {controller.fiatTopUps.length === 0 ? (
            <p className="text-sm text-slate-500">{c.noTopUps}</p>
          ) : (
            <div className="space-y-3">
              {controller.fiatTopUps.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium">{formatAmount(entry.amount)}</span>
                    <Badge
                      variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}
                    >
                      {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                    <span>
                      {c.createdAt}: {formatDateTime(entry.createdAt)}
                    </span>
                    <span>
                      {c.reference}: {entry.referenceId ?? c.unknown}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {c.cryptoDepositTitle}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {c.cryptoDepositDescription}
            </p>
          </div>

          {controller.cryptoDepositChannels.length === 0 ? (
            <p className="text-sm text-slate-500">{c.noCryptoChannels}</p>
          ) : (
            <div className="space-y-3">
              {controller.cryptoDepositChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium text-slate-950">
                      {cryptoChannelLabel(channel)}
                    </span>
                    <Badge variant={badgeVariant(channel.isActive)}>
                      {channel.isActive ? c.verified : c.pending}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-slate-500">
                    <p>{channel.receiveAddress}</p>
                    <p>
                      {c.cryptoChain}: {channel.chain} · {c.cryptoNetwork}: {channel.network}
                    </p>
                    {channel.memoRequired ? (
                      <p>Memo/Tag: {channel.memoValue ?? c.unknown}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={controller.handleCreateCryptoDeposit}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crypto-channel">{c.depositChannel}</Label>
                <select
                  id="crypto-channel"
                  value={controller.selectedCryptoChannelId}
                  onChange={(event) =>
                    controller.setSelectedCryptoChannelId(event.target.value)
                  }
                  disabled={
                    controller.cryptoDepositChannels.length === 0 ||
                    controller.cryptoDepositSubmitting
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{c.depositChannelPlaceholder}</option>
                  {controller.cryptoDepositChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {cryptoChannelLabel(channel)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-deposit-amount">{c.amount}</Label>
                <Input
                  id="crypto-deposit-amount"
                  value={controller.cryptoDepositAmount}
                  onChange={(event) =>
                    controller.setCryptoDepositAmount(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="100.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-deposit-tx">{c.depositTxHash}</Label>
                <Input
                  id="crypto-deposit-tx"
                  value={controller.cryptoDepositTxHash}
                  onChange={(event) =>
                    controller.setCryptoDepositTxHash(event.target.value)
                  }
                  placeholder="0x..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-deposit-from">{c.depositFromAddress}</Label>
                <Input
                  id="crypto-deposit-from"
                  value={controller.cryptoDepositFromAddress}
                  onChange={(event) =>
                    controller.setCryptoDepositFromAddress(event.target.value)
                  }
                  placeholder="0x..."
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                controller.cryptoDepositSubmitting ||
                controller.cryptoDepositChannels.length === 0
              }
            >
              {controller.cryptoDepositSubmitting
                ? t('common.loading')
                : c.submitCryptoDeposit}
            </Button>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {c.recentCryptoDeposits}
            </h3>
            {controller.cryptoTopUps.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noCryptoDeposits}</p>
            ) : (
              <div className="space-y-3">
                {controller.cryptoTopUps.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">
                        {formatAmount(entry.amount)} {entry.assetCode ?? ''}
                      </span>
                      <Badge
                        variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}
                      >
                        {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                      <span>
                        {c.createdAt}: {formatDateTime(entry.createdAt)}
                      </span>
                      <span>
                        {c.reference}: {entry.submittedTxHash ?? c.unknown}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
