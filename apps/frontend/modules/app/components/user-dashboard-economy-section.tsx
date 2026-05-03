'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  GiftEnergyAccountRecord,
  GiftPackCatalogItem,
  GiftTransferRecord,
} from '@reward/shared-types/economy';
import type { WalletBalanceResponse } from '@reward/shared-types/user';
import type { Locale } from '@/lib/i18n/messages';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { browserUserApiClient } from '@/lib/api/user-client';
import { cn } from '@/lib/utils';

type EconomySectionProps = {
  locale: Locale;
  wallet: WalletBalanceResponse | null;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  onRefreshWallet: () => Promise<void>;
};

const copy = {
  en: {
    title: 'Credit tools',
    subtitle:
      'Move B luck between players, review catalog-only reward packs, and keep gifting activity visible without leaving the treasury.',
    giftEnergy: 'Gift energy',
    sendGift: 'Send B luck',
    receiverUserId: 'Receiver user ID',
    amount: 'Amount',
    send: 'Send gift',
    sending: 'Sending...',
    history: 'Gift history',
    giftPacks: 'Reward packs',
    giftPacksHint:
      'Web stays catalog-only. Packs are visible here, but purchase completes in the native iOS or Android app.',
    empty: 'Nothing yet.',
    webOnly: 'Web only',
    available: 'Available',
    locked: 'Locked',
    assets: 'Asset lanes',
    assetsHint: 'Live balances by asset, split between spendable and protected credits.',
    refresh: 'Refresh',
    loading: 'Loading credit tools...',
    invalidReceiver: 'Enter a valid receiver user ID.',
    sendFailed: 'Failed to send gift.',
  },
  'zh-CN': {
    title: '点券工具',
    subtitle:
      '在金库页内完成 B luck 送礼、查看奖励包目录，并持续跟踪送礼活动，不需要跳出当前页面。',
    giftEnergy: '送礼能量',
    sendGift: '赠送 B luck',
    receiverUserId: '接收用户 ID',
    amount: '金额',
    send: '发起赠送',
    sending: '赠送中...',
    history: '送礼记录',
    giftPacks: '奖励包目录',
    giftPacksHint:
      'Web 仍然只做目录展示。这里可以看到奖励包，但实际购买仍在 iOS 或 Android 原生端完成。',
    empty: '暂无数据。',
    webOnly: 'Web 只读',
    available: '可用',
    locked: '锁定',
    assets: '资产通道',
    assetsHint: '按资产拆分当前余额，并区分可用与受保护的锁定额度。',
    refresh: '刷新',
    loading: '正在加载点券工具...',
    invalidReceiver: '请输入有效的接收用户 ID。',
    sendFailed: '赠送失败。',
  },
} as const;

const assetLabels = {
  B_LUCK: 'B luck',
  IAP_VOUCHER: 'Voucher',
} as const;

const assetToneByCode: Record<string, string> = {
  B_LUCK:
    'border-[var(--retro-orange)] bg-[rgba(184,75,9,0.08)] text-[var(--retro-orange)]',
  IAP_VOUCHER:
    'border-[var(--retro-violet)] bg-[rgba(97,88,255,0.1)] text-[var(--retro-violet)]',
};

export function UserDashboardEconomySection(props: EconomySectionProps) {
  const c = copy[props.locale as keyof typeof copy] ?? copy.en;
  const [giftEnergy, setGiftEnergy] = useState<GiftEnergyAccountRecord | null>(null);
  const [gifts, setGifts] = useState<GiftTransferRecord[]>([]);
  const [giftPacks, setGiftPacks] = useState<GiftPackCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiverUserId, setReceiverUserId] = useState('');
  const [amount, setAmount] = useState('');

  const assets = props.wallet?.assets ?? [];

  const loadEconomy = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [energyRes, giftsRes, giftPackRes] = await Promise.all([
      browserUserApiClient.getGiftEnergy(),
      browserUserApiClient.listGifts({ limit: 6 }),
      browserUserApiClient.listGiftPackCatalog(),
    ]);

    if (energyRes.ok) setGiftEnergy(energyRes.data);
    if (giftsRes.ok) setGifts(giftsRes.data);
    if (giftPackRes.ok) setGiftPacks(giftPackRes.data);

    const firstFailure = [energyRes, giftsRes, giftPackRes].find((response) => !response.ok);
    if (firstFailure && !firstFailure.ok) {
      setError(firstFailure.error?.message ?? c.loading);
    }

    setLoading(false);
  }, [c.loading]);

  useEffect(() => {
    void loadEconomy();
  }, [loadEconomy]);

  const handleRefresh = async () => {
    await Promise.all([loadEconomy(), props.onRefreshWallet()]);
  };

  const handleSendGift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);

    const parsedReceiverUserId = Number(receiverUserId);
    if (!Number.isInteger(parsedReceiverUserId) || parsedReceiverUserId <= 0) {
      setError(c.invalidReceiver);
      setSending(false);
      return;
    }

    const response = await browserUserApiClient.createGift({
      receiverUserId: parsedReceiverUserId,
      amount,
      idempotencyKey: `web-gift:${parsedReceiverUserId}:${Date.now()}`,
    });

    if (!response.ok) {
      setError(response.error?.message ?? c.sendFailed);
      setSending(false);
      return;
    }

    setReceiverUserId('');
    setAmount('');
    setSending(false);
    await handleRefresh();
  };

  return (
    <section id="wallet-tools" className="space-y-6">
      <Card className="retro-panel-featured rounded-[1.85rem] border-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-[1.75rem] text-[var(--retro-ink)]">
                {c.title}
              </CardTitle>
              <CardDescription className="max-w-3xl text-[rgba(15,17,31,0.68)]">
                {c.subtitle}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="arcadeOutline"
              size="sm"
              onClick={() => void handleRefresh()}
            >
              {c.refresh}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <div className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-3 py-2 text-sm text-[var(--retro-ink)]">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-5">
              <Card className="retro-panel rounded-[1.5rem] border-none">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base text-[var(--retro-ink)]">
                    {c.assets}
                  </CardTitle>
                  <CardDescription className="text-[rgba(15,17,31,0.62)]">
                    {c.assetsHint}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {assets.length === 0 ? (
                    <p className="text-sm text-[rgba(15,17,31,0.56)]">{c.empty}</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {assets.map((asset) => (
                        <div
                          key={asset.assetCode}
                          className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-4"
                        >
                          <div
                            className={cn(
                              'inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.18em]',
                              assetToneByCode[asset.assetCode] ??
                                'border-[rgba(15,17,31,0.18)] bg-[rgba(15,17,31,0.04)] text-[var(--retro-ink)]',
                            )}
                          >
                            {assetLabels[asset.assetCode] ?? asset.assetCode}
                          </div>
                          <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--retro-ink)]">
                            {props.formatAmount(asset.availableBalance)}
                          </p>
                          <div className="mt-4 space-y-2 text-sm text-[rgba(15,17,31,0.68)]">
                            <div className="flex items-center justify-between">
                              <span>{c.available}</span>
                              <span className="font-medium text-[var(--retro-ink)]">
                                {props.formatAmount(asset.availableBalance)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{c.locked}</span>
                              <span className="font-medium text-[var(--retro-ink)]">
                                {props.formatAmount(asset.lockedBalance)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="retro-panel rounded-[1.5rem] border-none">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--retro-ink)]">
                    {c.sendGift}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-[1rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-3 py-2 text-sm text-[var(--retro-ink)]">
                    <span>{c.giftEnergy}</span>
                    <span className="font-medium">
                      {giftEnergy
                        ? `${giftEnergy.currentEnergy}/${giftEnergy.maxEnergy}`
                        : c.loading}
                    </span>
                  </div>

                  <form
                    className="grid gap-4 md:grid-cols-[1fr,1fr,auto]"
                    onSubmit={handleSendGift}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="gift-receiver-user-id">{c.receiverUserId}</Label>
                      <Input
                        id="gift-receiver-user-id"
                        value={receiverUserId}
                        onChange={(event) => setReceiverUserId(event.target.value)}
                        inputMode="numeric"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gift-amount">{c.amount}</Label>
                      <Input
                        id="gift-amount"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        inputMode="decimal"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" variant="arcade" disabled={sending}>
                        {sending ? c.sending : c.send}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card className="retro-panel-dark rounded-[1.5rem] border-none">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base text-white">{c.giftPacks}</CardTitle>
                <CardDescription className="text-slate-300">
                  {c.giftPacksHint}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <p className="text-sm text-slate-400">{c.loading}</p>
                ) : giftPacks.length === 0 ? (
                  <p className="text-sm text-slate-400">{c.empty}</p>
                ) : (
                  giftPacks.map((item) => (
                    <div
                      key={`${item.product.sku}:${item.giftPack.code}`}
                      className="rounded-[1rem] border border-white/12 bg-white/[0.06] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{item.giftPack.code}</p>
                          <p className="text-sm text-slate-400">{item.product.sku}</p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="retro-badge retro-badge-gold border-none"
                        >
                          {c.webOnly}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-300">Reward</span>
                        <span className="font-semibold text-white">
                          {props.formatAmount(item.giftPack.rewardAmount)} B luck
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="retro-panel rounded-[1.75rem] border-none">
        <CardHeader>
          <CardTitle className="text-[1.55rem] text-[var(--retro-ink)]">
            {c.history}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {gifts.length === 0 ? (
            <p className="text-sm text-[rgba(15,17,31,0.56)]">{c.empty}</p>
          ) : (
            gifts.map((gift) => (
              <div
                key={gift.id}
                className="rounded-[1.15rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-4 text-sm text-[rgba(15,17,31,0.74)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[var(--retro-ink)]">
                    {props.formatAmount(gift.amount)}
                  </span>
                  <Badge
                    variant="secondary"
                    className="retro-badge retro-badge-violet border-none"
                  >
                    {gift.status}
                  </Badge>
                </div>
                <p className="mt-3 text-[rgba(15,17,31,0.56)]">
                  #{gift.senderUserId} -&gt; #{gift.receiverUserId}
                </p>
                <p className="mt-1 text-[rgba(15,17,31,0.46)]">
                  {props.formatDateTime(gift.createdAt)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
