"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  EconomyLedgerEntryRecord,
  GiftEnergyAccountRecord,
  GiftPackCatalogItem,
  GiftTransferRecord,
} from "@reward/shared-types/economy";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserUserApiClient } from "@/lib/api/user-client";

type EconomySectionProps = {
  locale: string;
  wallet: WalletBalanceResponse | null;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  onRefreshWallet: () => Promise<void>;
};

const copy = {
  en: {
    title: "Economy wallet",
    subtitle:
      "B luck gifting lives here. Web can view voucher and gift pack catalog, but store purchases stay on mobile.",
    giftEnergy: "Gift energy",
    sendGift: "Send B luck",
    receiverUserId: "Receiver user ID",
    amount: "Amount",
    send: "Send gift",
    sending: "Sending...",
    history: "Gift history",
    ledger: "Economy ledger",
    giftPacks: "Gift packs",
    giftPacksHint:
      "Web is consume-only. Gift packs are configured here for visibility, but purchase completes in the native iOS/Android app.",
    empty: "Nothing yet.",
    webOnly: "Web view only",
    available: "Available",
    locked: "Locked",
    assets: "Assets",
    refresh: "Refresh",
    loading: "Loading economy...",
  },
  "zh-CN": {
    title: "经济钱包",
    subtitle:
      "B luck 送礼入口只在这里。Web 只展示点券和礼物包目录，不提供购买。",
    giftEnergy: "送礼能量",
    sendGift: "赠送 B luck",
    receiverUserId: "接收用户 ID",
    amount: "金额",
    send: "发起赠送",
    sending: "赠送中...",
    history: "送礼记录",
    ledger: "经济账本",
    giftPacks: "礼物包目录",
    giftPacksHint:
      "Web 只消费不购买。这里仅展示礼物包目录，实际购买需在 iOS/Android 原生商店完成。",
    empty: "暂无数据。",
    webOnly: "Web 只读",
    available: "可用",
    locked: "锁定",
    assets: "资产",
    refresh: "刷新",
    loading: "正在加载经济钱包...",
  },
} as const;

const assetLabels = {
  B_LUCK: "B luck",
  IAP_VOUCHER: "Voucher",
} as const;

const readLedgerLabel = (locale: string, entryType: string) => {
  const zh = locale === "zh-CN";

  if (
    entryType.includes("refund") ||
    entryType.includes("revoke") ||
    entryType.includes("reversal")
  ) {
    return zh ? "退款回滚" : "Refund reversal";
  }
  if (entryType.includes("gift_send")) {
    return zh ? "赠送" : "Gift sent";
  }
  if (entryType.includes("gift_receive") || entryType.includes("gift_pack")) {
    return zh ? "收礼" : "Gift received";
  }
  if (entryType.includes("purchase")) {
    return zh ? "购买" : "Purchase";
  }
  if (entryType.includes("spend") || entryType.includes("debit")) {
    return zh ? "消耗" : "Spend";
  }
  return zh ? "获得" : "Earned";
};

export function UserDashboardEconomySection(props: EconomySectionProps) {
  const c = copy[props.locale as keyof typeof copy] ?? copy.en;
  const [giftEnergy, setGiftEnergy] = useState<GiftEnergyAccountRecord | null>(null);
  const [gifts, setGifts] = useState<GiftTransferRecord[]>([]);
  const [ledger, setLedger] = useState<EconomyLedgerEntryRecord[]>([]);
  const [giftPacks, setGiftPacks] = useState<GiftPackCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiverUserId, setReceiverUserId] = useState("");
  const [amount, setAmount] = useState("");

  const assets = props.wallet?.assets ?? [];

  const loadEconomy = async () => {
    setLoading(true);
    setError(null);

    const [energyRes, giftsRes, ledgerRes, giftPackRes] = await Promise.all([
      browserUserApiClient.getGiftEnergy(),
      browserUserApiClient.listGifts({ limit: 6 }),
      browserUserApiClient.getEconomyLedger({ limit: 8 }),
      browserUserApiClient.listGiftPackCatalog(),
    ]);

    if (energyRes.ok) setGiftEnergy(energyRes.data);
    if (giftsRes.ok) setGifts(giftsRes.data);
    if (ledgerRes.ok) setLedger(ledgerRes.data);
    if (giftPackRes.ok) setGiftPacks(giftPackRes.data);

    const firstFailure = [energyRes, giftsRes, ledgerRes, giftPackRes].find(
      (response) => !response.ok,
    );
    if (firstFailure && !firstFailure.ok) {
      setError(firstFailure.error?.message ?? c.loading);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadEconomy();
  }, []);

  const handleSendGift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);

    const parsedReceiverUserId = Number(receiverUserId);
    if (!Number.isInteger(parsedReceiverUserId) || parsedReceiverUserId <= 0) {
      setError("Invalid receiver user ID.");
      setSending(false);
      return;
    }

    const response = await browserUserApiClient.createGift({
      receiverUserId: parsedReceiverUserId,
      amount,
      idempotencyKey: `web-gift:${parsedReceiverUserId}:${Date.now()}`,
    });

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to send gift.");
      setSending(false);
      return;
    }

    setReceiverUserId("");
    setAmount("");
    setSending(false);
    await Promise.all([loadEconomy(), props.onRefreshWallet()]);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">
            {c.title}
          </p>
          <p className="mt-2 text-sm text-slate-600">{c.subtitle}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void loadEconomy()}>
          {c.refresh}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {assets.map((asset) => (
              <Card key={asset.assetCode}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {assetLabels[asset.assetCode]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  <div className="text-2xl font-semibold text-slate-950">
                    {props.formatAmount(asset.availableBalance)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{c.available}</span>
                    <span>{props.formatAmount(asset.availableBalance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{c.locked}</span>
                    <span>{props.formatAmount(asset.lockedBalance)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.sendGift}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span>{c.giftEnergy}</span>
                <span>
                  {giftEnergy
                    ? `${giftEnergy.currentEnergy}/${giftEnergy.maxEnergy}`
                    : c.loading}
                </span>
              </div>

              <form className="grid gap-4 md:grid-cols-[1fr,1fr,auto]" onSubmit={handleSendGift}>
                <div className="space-y-2">
                  <Label htmlFor="gift-receiver-user-id">{c.receiverUserId}</Label>
                  <Input
                    id="gift-receiver-user-id"
                    value={receiverUserId}
                    onChange={(event) => setReceiverUserId(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gift-amount">{c.amount}</Label>
                  <Input
                    id="gift-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={sending}>
                    {sending ? c.sending : c.send}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.giftPacks}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">{c.giftPacksHint}</p>
            {loading ? (
              <p className="text-sm text-slate-500">{c.loading}</p>
            ) : giftPacks.length === 0 ? (
              <p className="text-sm text-slate-500">{c.empty}</p>
            ) : (
              giftPacks.map((item) => (
                <div
                  key={`${item.product.sku}:${item.giftPack.code}`}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{item.giftPack.code}</p>
                      <p className="text-sm text-slate-500">{item.product.sku}</p>
                    </div>
                    <Badge variant="secondary">{c.webOnly}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    {props.formatAmount(item.giftPack.rewardAmount)} B luck
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.history}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gifts.length === 0 ? (
              <p className="text-sm text-slate-500">{c.empty}</p>
            ) : (
              gifts.map((gift) => (
                <div
                  key={gift.id}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{props.formatAmount(gift.amount)}</span>
                    <Badge variant="secondary">{gift.status}</Badge>
                  </div>
                  <p className="mt-2 text-slate-500">
                    #{gift.senderUserId} → #{gift.receiverUserId}
                  </p>
                  <p className="text-slate-400">{props.formatDateTime(gift.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.ledger}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ledger.length === 0 ? (
              <p className="text-sm text-slate-500">{c.empty}</p>
            ) : (
              ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {readLedgerLabel(props.locale, entry.entryType)}
                    </span>
                    <span>{props.formatAmount(entry.amount)}</span>
                  </div>
                  <p className="mt-2 text-slate-500">{assetLabels[entry.assetCode]}</p>
                  <p className="text-slate-400">{props.formatDateTime(entry.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
