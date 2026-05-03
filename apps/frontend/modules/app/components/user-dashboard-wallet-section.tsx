'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/messages';
import type { UserDashboardCopy } from './user-dashboard-copy';
import { UserDashboardEconomySection } from './user-dashboard-economy-section';
import type { UserDashboardController } from './use-user-dashboard';
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

const walletSectionCopy = {
  en: {
    totalBalance: 'Total balance',
    liveBalance: 'Live treasury',
    withdrawableLabel: 'Withdrawable',
    bonusLabel: 'Reward reserve',
    jumpToTools: 'Open credit tools',
    jumpToLedger: 'Jump to ledger',
    lockedVault: 'Locked vault',
    lockedVaultDescription:
      'Protected balance sits here while pending flows, gifting limits, and higher-trust actions settle.',
    lockedShare: 'of treasury locked',
    recentLootTitle: 'Recent loot',
    recentLootDescription:
      'Latest positive credit movements across rewards, markets, and table play.',
    noRecentLoot: 'No fresh reward drops yet.',
    sourceLabel: 'Source',
    assetLabel: 'Asset',
    amountLabel: 'Amount',
    dateLabel: 'Date',
  },
  'zh-CN': {
    totalBalance: '总余额',
    liveBalance: '实时金库',
    withdrawableLabel: '可提余额',
    bonusLabel: '奖励储备',
    jumpToTools: '打开点券工具',
    jumpToLedger: '跳到账本',
    lockedVault: '锁定金库',
    lockedVaultDescription:
      '待处理流程、送礼限制和更高信任级操作占用的保护余额会暂时停留在这里。',
    lockedShare: '的金库余额处于锁定中',
    recentLootTitle: '最近战利品',
    recentLootDescription: '展示奖励、市场结算和牌桌玩法带来的最新正向入账。',
    noRecentLoot: '还没有新的奖励入账。',
    sourceLabel: '来源',
    assetLabel: '资产',
    amountLabel: '金额',
    dateLabel: '时间',
  },
} as const;

const parseAmountNumber = (value: string | number | null | undefined) => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(typeof value === 'string' ? value : '0');

  return Number.isFinite(parsed) ? parsed : 0;
};

export function UserDashboardWalletSection({
  controller,
  copy: c,
  locale,
  formatAmount,
  formatDateTime,
  loadingLabel,
}: UserDashboardWalletSectionProps) {
  const labels = walletSectionCopy[locale] ?? walletSectionCopy.en;
  const totalBalanceRaw = controller.wallet?.balance.totalBalance ?? controller.walletBalance;
  const withdrawableRaw =
    controller.wallet?.balance.withdrawableBalance ?? controller.walletBalance;
  const bonusRaw = controller.wallet?.balance.bonusBalance ?? '0';
  const lockedRaw = controller.wallet?.balance.lockedBalance ?? '0';

  const totalBalanceNumber = parseAmountNumber(totalBalanceRaw);
  const lockedBalanceNumber = parseAmountNumber(lockedRaw);
  const lockedSharePercent =
    totalBalanceNumber > 0
      ? Math.max(0, Math.min(100, Math.round((lockedBalanceNumber / totalBalanceNumber) * 100)))
      : 0;

  const recentLootEntries = controller.activityEntries
    .filter((entry) => !entry.amount.startsWith('-'))
    .slice(0, 3);

  const ledgerEntries = controller.activityEntries.slice(0, 8);

  return (
    <div className="space-y-6">
      <Card className="retro-panel-featured rounded-[1.9rem] border-none">
        <CardContent className="space-y-6 p-6 pt-6 lg:p-8">
          <div className="space-y-3">
            <h2 className="text-[2.8rem] font-semibold leading-[0.94] tracking-[-0.05em] text-[var(--retro-orange)] md:text-[4.25rem]">
              {c.walletTitle}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.72)]">
              {c.walletDescription}
            </p>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.28fr,0.72fr]">
            <Card className="retro-panel overflow-hidden rounded-[1.75rem] border-none">
              <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] px-5 py-4 text-[var(--retro-ivory)]">
                <p className="text-sm font-black uppercase tracking-[0.2em]">
                  {labels.totalBalance}
                </p>
                <Badge className="retro-badge retro-badge-ink border-none">
                  {labels.liveBalance}
                </Badge>
              </div>
              <div className="relative overflow-hidden p-6 md:p-8">
                <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-20" />
                <div className="relative space-y-6">
                  <div className="flex flex-wrap items-end gap-3">
                    <span
                      className="text-[3.8rem] font-semibold leading-none tracking-[-0.06em] text-[var(--retro-orange)] md:text-[5.4rem]"
                      data-testid="wallet-current-balance"
                    >
                      {formatAmount(totalBalanceRaw)}
                    </span>
                    <span className="pb-2 text-xl font-semibold text-[var(--retro-orange)] md:pb-4 md:text-2xl">
                      B luck
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="retro-stat-chip">
                      {labels.withdrawableLabel}: {formatAmount(withdrawableRaw)}
                    </div>
                    <div className="retro-stat-chip">
                      {labels.bonusLabel}: {formatAmount(bonusRaw)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 border-t-2 border-[var(--retro-ink)] bg-[rgba(255,255,255,0.62)] p-5 md:grid-cols-2">
                <Button asChild variant="arcade">
                  <a href="#wallet-tools">{labels.jumpToTools}</a>
                </Button>
                <Button asChild variant="arcadeOutline">
                  <a href="#wallet-ledger">{labels.jumpToLedger}</a>
                </Button>
              </div>
            </Card>

            <Card className="retro-panel overflow-hidden rounded-[1.75rem] border-none">
              <div className="border-b-2 border-[var(--retro-ink)] bg-[linear-gradient(135deg,#655dfb,#8e85ff)] px-5 py-4 text-white">
                <p className="text-sm font-black uppercase tracking-[0.2em]">
                  {labels.lockedVault}
                </p>
              </div>
              <div className="space-y-5 p-6 text-center md:p-8">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-[rgba(97,88,255,0.86)] bg-[rgba(97,88,255,0.06)] text-[rgba(97,88,255,0.98)]">
                  <span className="text-3xl font-black">{lockedSharePercent}%</span>
                </div>
                <div>
                  <p className="text-[3rem] font-semibold leading-none tracking-[-0.05em] text-[var(--retro-violet)]">
                    {formatAmount(lockedRaw)}
                  </p>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.48)]">
                    {labels.lockedShare}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="h-4 overflow-hidden rounded-full border border-[rgba(15,17,31,0.18)] bg-[rgba(15,17,31,0.06)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#655dfb,#8e85ff)] transition-[width]"
                      style={{ width: `${lockedSharePercent}%` }}
                    />
                  </div>
                  <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                    {labels.lockedVaultDescription}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.74fr,1.26fr]">
        <Card className="retro-panel rounded-[1.8rem] border-none">
          <CardHeader>
            <CardTitle className="text-[1.65rem] text-[var(--retro-ink)]">
              {labels.recentLootTitle}
            </CardTitle>
            <CardDescription className="text-[rgba(15,17,31,0.68)]">
              {labels.recentLootDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLootEntries.length === 0 ? (
              <p className="text-sm text-[rgba(15,17,31,0.56)]">{labels.noRecentLoot}</p>
            ) : (
              recentLootEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 rounded-[1.15rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-3"
                >
                  <div
                    className={cn(
                      'grid h-12 w-12 shrink-0 place-items-center rounded-[0.95rem] border-2 text-base font-black',
                      index === 0
                        ? 'border-[var(--retro-orange)] bg-[rgba(184,75,9,0.12)] text-[var(--retro-orange)]'
                        : index === 1
                          ? 'border-[var(--retro-violet)] bg-[rgba(97,88,255,0.12)] text-[var(--retro-violet)]'
                          : 'border-[rgba(15,17,31,0.18)] bg-[rgba(15,17,31,0.04)] text-[var(--retro-ink)]',
                    )}
                  >
                    +{index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--retro-ink)]">
                      {formatUserDashboardActivityType(locale, entry.entryType)}
                    </p>
                    <p className="mt-1 text-sm text-[rgba(15,17,31,0.56)]">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[var(--retro-green)]">
                      {formatAmount(entry.amount)}
                    </p>
                    <div className="mt-2 flex justify-end">
                      <Badge
                        variant="outline"
                        className="retro-badge retro-badge-gold border-none"
                      >
                        {formatUserDashboardActivitySource(locale, entry.source)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card
          id="wallet-ledger"
          className="retro-panel rounded-[1.8rem] border-none overflow-hidden"
        >
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-[1.7rem] text-[var(--retro-ink)]">
                  {c.transactionsTitle}
                </CardTitle>
                <CardDescription className="text-[rgba(15,17,31,0.68)]">
                  {c.transactionsDescription}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="arcadeOutline"
                size="sm"
                onClick={() => void controller.handleRefresh()}
                disabled={controller.refreshing}
                data-testid="wallet-refresh-button"
              >
                {controller.refreshing ? loadingLabel : c.refresh}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {ledgerEntries.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-[rgba(15,17,31,0.56)]">{c.noTransactions}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-y-2 border-[var(--retro-ink)] bg-[rgba(15,17,31,0.04)] text-xs font-black uppercase tracking-[0.18em] text-[rgba(15,17,31,0.54)]">
                      <th className="px-6 py-4">{c.type}</th>
                      <th className="px-6 py-4">{labels.amountLabel}</th>
                      <th className="px-6 py-4">{labels.sourceLabel}</th>
                      <th className="px-6 py-4 text-right">{labels.dateLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[rgba(15,17,31,0.12)] bg-white/52 align-top transition-colors hover:bg-white/84"
                      >
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--retro-ink)]">
                              {formatUserDashboardActivityType(locale, entry.entryType)}
                            </p>
                            {entry.assetCode ? (
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,17,31,0.46)]">
                                {labels.assetLabel}: {entry.assetCode}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'font-semibold',
                              entry.amount.startsWith('-')
                                ? 'text-[var(--retro-red)]'
                                : 'text-[var(--retro-green)]',
                            )}
                          >
                            {formatAmount(entry.amount)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={
                              entry.source === 'economy'
                                ? 'retro-badge retro-badge-violet border-none'
                                : 'retro-badge retro-badge-gold border-none'
                            }
                          >
                            {formatUserDashboardActivitySource(locale, entry.source)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-[rgba(15,17,31,0.56)]">
                          {formatDateTime(entry.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UserDashboardEconomySection
        locale={locale}
        wallet={controller.wallet}
        formatAmount={formatAmount}
        formatDateTime={formatDateTime}
        onRefreshWallet={async () => {
          await controller.handleRefresh();
        }}
      />
    </div>
  );
}
