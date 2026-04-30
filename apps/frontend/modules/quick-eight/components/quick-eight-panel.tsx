"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuickEightRound } from "@reward/shared-types/quick-eight";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslations } from "@/components/i18n-provider";
import {
  GameMetricTile,
  GameNumberChip,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { readBluckAvailableBalance } from "@/lib/economy-wallet";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    title: "Quick Eight",
    description:
      "Pick 8 numbers, stake one ticket, and settle immediately against the shared prize pool.",
    currentBalance: "Current balance",
    selectionLabel: "Your 8 numbers",
    selectionHint: "Pick exactly 8 unique numbers from 1 to 80.",
    selectionReady: "Selection locked",
    selectionRemaining: "Numbers left",
    clearSelection: "Clear",
    stakeLabel: "Stake amount",
    stakeHint: `Min ${QUICK_EIGHT_CONFIG.minStake} / Max ${QUICK_EIGHT_CONFIG.maxStake}`,
    play: "Play Quick Eight",
    playing: "Drawing numbers...",
    paytableTitle: "Payout table",
    hitsLabel: "Hits",
    resultTitle: "Latest round",
    drawnNumbers: "Drawn numbers",
    matchedNumbers: "Matched numbers",
    payoutAmount: "Payout",
    hitCount: "Hits",
    status: "Status",
    invalidSelection: `Select exactly ${QUICK_EIGHT_CONFIG.pickCount} numbers.`,
    invalidStake: "Enter a valid stake amount.",
    noMatch: "No matches this round.",
  },
  "zh-CN": {
    title: "快八",
    description: "从 1 到 80 里选 8 个号码，下一注即时开奖，并按共享奖池结算。",
    currentBalance: "当前余额",
    selectionLabel: "你的 8 个号码",
    selectionHint: "必须选满 8 个且不能重复。",
    selectionReady: "选号已满",
    selectionRemaining: "还可选择",
    clearSelection: "清空",
    stakeLabel: "下注金额",
    stakeHint: `最小 ${QUICK_EIGHT_CONFIG.minStake} / 最大 ${QUICK_EIGHT_CONFIG.maxStake}`,
    play: "开始快八",
    playing: "正在开奖...",
    paytableTitle: "赔率表",
    hitsLabel: "命中数",
    resultTitle: "最近一局",
    drawnNumbers: "开奖号码",
    matchedNumbers: "命中号码",
    payoutAmount: "派奖",
    hitCount: "命中",
    status: "结果",
    invalidSelection: `请先选满 ${QUICK_EIGHT_CONFIG.pickCount} 个号码。`,
    invalidStake: "请输入合法的下注金额。",
    noMatch: "本局没有命中号码。",
  },
} as const;

type QuickEightPanelProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  onBalanceChange?: (balance: string) => void;
  onPlayComplete?: () => void;
};

const normalizeNumbers = (numbers: number[]) =>
  [...numbers].sort((a, b) => a - b);

const getQuickEightDisplayBalance = (wallet: WalletBalanceResponse) =>
  readBluckAvailableBalance(wallet);

export function QuickEightPanel({
  disabled = false,
  disabledReason = null,
  onBalanceChange,
  onPlayComplete,
}: QuickEightPanelProps) {
  const locale = useLocale();
  const t = useTranslations();
  const c = copy[locale];
  const [balance, setBalance] = useState("0");
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [stakeAmount, setStakeAmount] = useState(QUICK_EIGHT_CONFIG.minStake);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickEightRound | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedNumbers.length;
  const matchedSet = useMemo(
    () => new Set(result?.matchedNumbers ?? []),
    [result?.matchedNumbers],
  );

  const refreshBalance = useCallback(async () => {
    const response = await browserUserApiClient.getWalletBalance();
    if (response.ok) {
      const nextBalance = getQuickEightDisplayBalance(response.data);
      setBalance(nextBalance);
      onBalanceChange?.(nextBalance);
    }
  }, [onBalanceChange]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  function toggleNumber(number: number) {
    setSelectedNumbers((current) => {
      if (current.includes(number)) {
        return current.filter((value) => value !== number);
      }
      if (current.length >= QUICK_EIGHT_CONFIG.pickCount) {
        return current;
      }
      return normalizeNumbers([...current, number]);
    });
  }

  async function handlePlay() {
    if (selectedNumbers.length !== QUICK_EIGHT_CONFIG.pickCount) {
      setError(c.invalidSelection);
      return;
    }
    if (!stakeAmount.trim()) {
      setError(c.invalidStake);
      return;
    }

    setLoading(true);
    setError(null);

    const response = await browserUserApiClient.playQuickEight({
        numbers: selectedNumbers,
        stakeAmount: stakeAmount.trim(),
    });

    if (!response.ok) {
      setError(response.error?.message ?? t("draw.errorFallback"));
    } else {
      setResult(response.data);
      setSelectedNumbers(response.data.selectedNumbers);
      await refreshBalance();
      onPlayComplete?.();
    }

    setLoading(false);
  }

  return (
    <GameSurfaceCard>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{c.title}</CardTitle>
            <CardDescription className="mt-1 text-slate-400">
              {c.description}
            </CardDescription>
          </div>
          <GamePill tone="success">
            {c.currentBalance}: {balance}
          </GamePill>
        </div>
        <GameSectionBlock>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-100">
                {c.selectionLabel}
              </p>
              <p className="mt-1 text-sm text-slate-400">{c.selectionHint}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <GamePill tone="accent">
                {selectedCount === QUICK_EIGHT_CONFIG.pickCount
                  ? c.selectionReady
                  : `${c.selectionRemaining}: ${
                      QUICK_EIGHT_CONFIG.pickCount - selectedCount
                    }`}
              </GamePill>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedNumbers([])}
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
              >
                {c.clearSelection}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
            {Array.from(
              { length: QUICK_EIGHT_CONFIG.boardSize },
              (_, index) => index + 1,
            ).map((number) => {
              const active = selectedNumbers.includes(number);
              return (
                <button
                  key={number}
                  type="button"
                  onClick={() => toggleNumber(number)}
                  className={cn(
                    "rounded-xl border px-0 py-2 text-sm font-medium transition",
                    active
                      ? "border-amber-300 bg-amber-300 text-slate-950 shadow-[0_0_0_1px_rgba(253,224,71,0.4)]"
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-slate-100",
                  )}
                >
                  {number}
                </button>
              );
            })}
          </div>
        </GameSectionBlock>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),220px]">
          <GameSectionBlock>
            <p className="text-sm font-medium text-slate-100">
              {c.paytableTitle}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {QUICK_EIGHT_CONFIG.payoutTable.map((rule) => (
                <GameMetricTile
                  key={rule.hits}
                  className="px-3 py-2"
                  label={`${c.hitsLabel} ${rule.hits}`}
                  value={`${rule.multiplier}x`}
                  valueClassName="mt-1 text-base font-semibold text-slate-100"
                />
              ))}
            </div>
          </GameSectionBlock>

          <GameSectionBlock>
            <label
              className="text-sm font-medium text-slate-100"
              htmlFor="quick-eight-stake"
            >
              {c.stakeLabel}
            </label>
            <Input
              id="quick-eight-stake"
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
              inputMode="decimal"
              className="mt-3 border-slate-700 bg-slate-950 text-slate-100"
            />
            <p className="mt-2 text-sm text-slate-400">{c.stakeHint}</p>
            <Button
              type="button"
              onClick={() => void handlePlay()}
              disabled={loading || disabled}
              className="mt-4 w-full bg-amber-300 text-slate-950 hover:bg-amber-200"
            >
              {loading ? c.playing : c.play}
            </Button>
          </GameSectionBlock>
        </div>

        {disabledReason ? (
          <GameStatusNotice tone="warning">
            {disabledReason}
          </GameStatusNotice>
        ) : null}
        {error ? <GameStatusNotice tone="danger">{error}</GameStatusNotice> : null}

        {result ? (
          <GameSectionBlock>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {c.resultTitle}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {c.status}: {result.status}
                </p>
              </div>
              <div className="grid gap-1 text-right text-sm">
                <span className="text-slate-400">
                  {c.hitCount}: {result.hitCount}
                </span>
                <span className="font-semibold text-emerald-200">
                  {c.payoutAmount}: {result.payoutAmount}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-2 text-sm text-slate-400">{c.drawnNumbers}</p>
                <div className="flex flex-wrap gap-2">
                  {result.drawnNumbers.map((number) => (
                    <GameNumberChip
                      key={number}
                      tone={matchedSet.has(number) ? "success" : "neutral"}
                    >
                      {number}
                    </GameNumberChip>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm text-slate-400">
                  {c.matchedNumbers}
                </p>
                {result.matchedNumbers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {result.matchedNumbers.map((number) => (
                      <GameNumberChip key={number} tone="selected">
                        {number}
                      </GameNumberChip>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{c.noMatch}</p>
                )}
              </div>
            </div>
          </GameSectionBlock>
        ) : null}
      </CardContent>
    </GameSurfaceCard>
  );
}
