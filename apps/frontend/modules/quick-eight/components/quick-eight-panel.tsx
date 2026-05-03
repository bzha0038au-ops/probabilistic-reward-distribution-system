"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuickEightRound } from "@reward/shared-types/quick-eight";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
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
    drawArenaTitle: "Draw arena",
    drawArenaHint:
      "Build one 8-number ticket, then settle the full 20-ball draw in a single round.",
    boardTitle: "Number board",
    boardHint: "Gold = selected, green = hit, slate = drawn but missed.",
    roundReady: "Ready to draw",
    roundSettled: "Round settled",
    fairnessTitle: "Provably fair",
    fairnessHint:
      "Every result publishes the hash, nonce source, and digest used for this round.",
    drawCountLabel: "Numbers drawn",
    pickCountLabel: "Numbers picked",
    maxPayoutLabel: "Top payout",
    ticketDockTitle: "Ticket dock",
    ticketDockHint: "Set the stake, lock 8 numbers, and settle the next round.",
    ticketSummary: "Ticket summary",
    selectedDeckTitle: "Selected numbers",
    fairnessCommit: "Commit hash",
    roundId: "Round ID",
    multiplierLabel: "Multiplier",
    nonceSource: "Nonce source",
    clientNonce: "Client nonce",
    algorithm: "Algorithm",
    rngDigest: "RNG digest",
    nonceClient: "Client",
    nonceServer: "Server",
    potentialReward: "Potential top reward",
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
    wonStatus: "Won",
    lostStatus: "Lost",
    invalidSelection: `Select exactly ${QUICK_EIGHT_CONFIG.pickCount} numbers.`,
    invalidStake: "Enter a valid stake amount.",
    noMatch: "No matches this round.",
    noResult: "No settled round yet. Your next ticket will land here.",
  },
  "zh-CN": {
    title: "快八",
    description: "从 1 到 80 里选 8 个号码，下一注即时开奖，并按共享奖池结算。",
    currentBalance: "当前余额",
    drawArenaTitle: "开奖舞台",
    drawArenaHint: "先锁定 8 个号码，再一次性完成 20 球开奖与派奖。",
    boardTitle: "选号盘",
    boardHint: "金色为已选，绿色为命中，灰蓝色为已开未中。",
    roundReady: "等待开奖",
    roundSettled: "本局已结算",
    fairnessTitle: "可验证公平",
    fairnessHint: "每一局都会回传本轮使用的哈希、nonce 来源和随机摘要。",
    drawCountLabel: "开奖号码数",
    pickCountLabel: "选号数",
    maxPayoutLabel: "最高倍率",
    ticketDockTitle: "下注控制坞",
    ticketDockHint: "设置下注、锁定 8 个号码，然后开始下一局。",
    ticketSummary: "票面摘要",
    selectedDeckTitle: "已选号码",
    fairnessCommit: "提交哈希",
    roundId: "局号",
    multiplierLabel: "倍率",
    nonceSource: "Nonce 来源",
    clientNonce: "客户端 Nonce",
    algorithm: "算法",
    rngDigest: "RNG 摘要",
    nonceClient: "客户端",
    nonceServer: "服务端",
    potentialReward: "潜在最高派奖",
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
    wonStatus: "中奖",
    lostStatus: "未中",
    invalidSelection: `请先选满 ${QUICK_EIGHT_CONFIG.pickCount} 个号码。`,
    invalidStake: "请输入合法的下注金额。",
    noMatch: "本局没有命中号码。",
    noResult: "还没有已结算牌局，下一张票会显示在这里。",
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

function formatAmount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCommitHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function formatRoundStatus(
  locale: keyof typeof copy,
  status: QuickEightRound["status"],
) {
  if (status === "won") {
    return copy[locale].wonStatus;
  }

  return copy[locale].lostStatus;
}

function formatNonceSource(
  locale: keyof typeof copy,
  source: QuickEightRound["fairness"]["nonceSource"],
) {
  return source === "client" ? copy[locale].nonceClient : copy[locale].nonceServer;
}

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
  const remainingCount = QUICK_EIGHT_CONFIG.pickCount - selectedCount;
  const selectedSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const matchedSet = useMemo(
    () => new Set(result?.matchedNumbers ?? []),
    [result?.matchedNumbers],
  );
  const drawnSet = useMemo(() => new Set(result?.drawnNumbers ?? []), [result?.drawnNumbers]);
  const maximumPayoutMultiplier =
    QUICK_EIGHT_CONFIG.payoutTable[QUICK_EIGHT_CONFIG.payoutTable.length - 1]?.multiplier ??
    "0.00";
  const potentialReward = (() => {
    const numericStake = Number(stakeAmount);
    const numericMultiplier = Number(maximumPayoutMultiplier);
    if (!Number.isFinite(numericStake) || !Number.isFinite(numericMultiplier)) {
      return "—";
    }

    return formatAmount((numericStake * numericMultiplier).toFixed(2));
  })();

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
    <section className="grid gap-6 2xl:grid-cols-[340px,minmax(0,1fr)]">
      <div className="space-y-6">
        <GameSurfaceCard tone="light" className="overflow-hidden">
          <CardContent className="p-0">
            <div className="retro-ivory-surface relative overflow-hidden px-6 py-7">
              <div className="absolute inset-0 retro-dot-overlay opacity-20" />
              <div className="relative space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <span className="retro-badge retro-badge-gold border-none">
                      {c.drawArenaTitle}
                    </span>
                    <div className="space-y-2">
                      <CardTitle className="text-[2.4rem] tracking-[-0.05em] text-[var(--retro-orange)]">
                        {c.title}
                      </CardTitle>
                      <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                        {c.description}
                      </CardDescription>
                    </div>
                  </div>
                  <GamePill tone="accent" surface="light">
                    {c.currentBalance}: {balance}
                  </GamePill>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <GameMetricTile
                    tone="light"
                    label={c.pickCountLabel}
                    value={QUICK_EIGHT_CONFIG.pickCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.drawCountLabel}
                    value={QUICK_EIGHT_CONFIG.drawCount}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.maxPayoutLabel}
                    value={`${formatAmount(maximumPayoutMultiplier)}x`}
                    valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <GameSectionBlock tone="light" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                      {c.ticketSummary}
                    </p>
                    <p className="mt-2 text-sm text-[rgba(15,17,31,0.68)]">
                      {c.selectionHint}
                    </p>
                  </div>
                  <GamePill tone="warning" surface="light">
                    {selectedCount === QUICK_EIGHT_CONFIG.pickCount
                      ? c.selectionReady
                      : `${c.selectionRemaining}: ${remainingCount}`}
                  </GamePill>
                </div>

                <div className="flex min-h-14 flex-wrap gap-2">
                  {selectedNumbers.length > 0 ? (
                    selectedNumbers.map((number) => (
                      <GameNumberChip key={`selected-${number}`} tone="selected" surface="light">
                        {number}
                      </GameNumberChip>
                    ))
                  ) : (
                    <GameStatusNotice tone="neutral" surface="light" className="w-full">
                      {c.selectionLabel}
                    </GameStatusNotice>
                  )}
                </div>
              </GameSectionBlock>
            </div>
          </CardContent>
        </GameSurfaceCard>

        <GameSurfaceCard className="overflow-hidden">
          <CardContent className="space-y-5 p-6">
            <GameSectionBlock className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                  {c.ticketDockTitle}
                </p>
                <p className="mt-2 text-sm text-slate-300">{c.ticketDockHint}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-100" htmlFor="quick-eight-stake">
                  {c.stakeLabel}
                </label>
                <Input
                  id="quick-eight-stake"
                  value={stakeAmount}
                  onChange={(event) => setStakeAmount(event.target.value)}
                  inputMode="decimal"
                  className="retro-field-dark h-12"
                />
                <p className="text-sm text-slate-400">{c.stakeHint}</p>
              </div>

              <GameStatusNotice tone="info">
                {c.potentialReward}: {potentialReward}
              </GameStatusNotice>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="arcadeOutline"
                  onClick={() => setSelectedNumbers([])}
                  disabled={loading}
                >
                  {c.clearSelection}
                </Button>
                <Button
                  type="button"
                  variant="arcadeDark"
                  size="xl"
                  className="flex-1"
                  onClick={() => void handlePlay()}
                  disabled={loading || disabled}
                >
                  {loading ? c.playing : c.play}
                </Button>
              </div>
            </GameSectionBlock>

            <GameSectionBlock className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                  {c.paytableTitle}
                </p>
                <p className="mt-2 text-sm text-slate-300">{c.boardHint}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                {QUICK_EIGHT_CONFIG.payoutTable.map((rule) => (
                  <GameMetricTile
                    key={rule.hits}
                    className="px-3 py-2"
                    label={`${c.hitsLabel} ${rule.hits}`}
                    value={`${formatAmount(rule.multiplier)}x`}
                    valueClassName="mt-1 text-base font-semibold text-slate-100"
                  />
                ))}
              </div>
            </GameSectionBlock>
          </CardContent>
        </GameSurfaceCard>
      </div>

      <div className="space-y-6">
        {disabledReason ? (
          <GameStatusNotice tone="warning">{disabledReason}</GameStatusNotice>
        ) : null}
        {error ? <GameStatusNotice tone="danger">{error}</GameStatusNotice> : null}

        <GameSurfaceCard tone="light" className="overflow-hidden">
          <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8">
            <div className="absolute inset-0 retro-dot-overlay opacity-20" />
            <div className="relative space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GamePill tone="warning" surface="light">
                      {result ? c.roundSettled : c.roundReady}
                    </GamePill>
                    <GamePill
                      tone={selectedCount === QUICK_EIGHT_CONFIG.pickCount ? "success" : "info"}
                      surface="light"
                    >
                      {selectedCount}/{QUICK_EIGHT_CONFIG.pickCount}
                    </GamePill>
                  </div>
                  <CardTitle className="text-[2.45rem] tracking-[-0.05em] text-[var(--retro-ink)]">
                    {result ? c.resultTitle : c.selectionLabel}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                    {result ? c.fairnessHint : c.drawArenaHint}
                  </CardDescription>
                </div>

                <div className="rounded-[1.4rem] border-2 border-[var(--retro-ink)] bg-white/84 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.18)]">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                    {c.fairnessTitle}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--retro-ink)]">
                    {result ? formatCommitHash(result.fairness.commitHash) : "—"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <GameMetricTile
                  tone="light"
                  label={c.stakeLabel}
                  value={result ? formatAmount(result.stakeAmount) : formatAmount(stakeAmount)}
                  valueClassName="text-2xl font-black tracking-[-0.04em]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.payoutAmount}
                  value={result ? formatAmount(result.payoutAmount) : potentialReward}
                  valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.hitCount}
                  value={result?.hitCount ?? 0}
                  valueClassName="text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]"
                />
                <GameMetricTile
                  tone="light"
                  label={c.multiplierLabel}
                  value={result ? `${formatAmount(result.multiplier)}x` : `${formatAmount(maximumPayoutMultiplier)}x`}
                  valueClassName="text-2xl font-black tracking-[-0.04em]"
                />
              </div>
            </div>
          </CardContent>
        </GameSurfaceCard>

        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <GameSurfaceCard className="overflow-hidden">
            <CardContent className="space-y-6 p-6">
              <div className="retro-felt-surface rounded-[2.7rem] px-6 py-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                      {c.boardTitle}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">{c.boardHint}</p>
                  </div>
                  <GamePill tone="success">
                    {selectedCount === QUICK_EIGHT_CONFIG.pickCount
                      ? c.selectionReady
                      : `${c.selectionRemaining}: ${remainingCount}`}
                  </GamePill>
                </div>

                <div className="mt-6 grid grid-cols-5 gap-3 sm:grid-cols-8 xl:grid-cols-10">
                  {Array.from(
                    { length: QUICK_EIGHT_CONFIG.boardSize },
                    (_, index) => index + 1,
                  ).map((number) => {
                    const isMatched = matchedSet.has(number);
                    const isSelected = selectedSet.has(number);
                    const isDrawn = drawnSet.has(number);

                    return (
                      <button
                        key={number}
                        type="button"
                        onClick={() => toggleNumber(number)}
                        className={cn(
                          "rounded-[1rem] border-2 px-0 py-3 text-sm font-bold shadow-[3px_3px_0px_0px_rgba(3,5,14,0.45)] transition-transform hover:-translate-y-0.5",
                          isMatched
                            ? "border-emerald-300 bg-emerald-300 text-slate-950"
                            : isSelected
                              ? "border-amber-300 bg-amber-300 text-slate-950"
                              : isDrawn
                                ? "border-slate-500 bg-slate-700 text-slate-100"
                                : "border-[#253150] bg-[rgba(255,255,255,0.06)] text-slate-200 hover:bg-[rgba(255,255,255,0.12)]",
                        )}
                      >
                        {number}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </GameSurfaceCard>

          <div className="space-y-6">
            <GameSurfaceCard tone="light" className="overflow-hidden">
              <CardContent className="space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                      {c.resultTitle}
                    </p>
                    <p className="mt-2 text-sm text-[rgba(15,17,31,0.68)]">
                      {result ? `${c.status}: ${formatRoundStatus(locale, result.status)}` : c.noResult}
                    </p>
                  </div>
                  {result ? (
                    <GamePill
                      tone={result.status === "won" ? "success" : "neutral"}
                      surface="light"
                    >
                      {formatRoundStatus(locale, result.status)}
                    </GamePill>
                  ) : null}
                </div>

                <GameSectionBlock tone="light" className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                    {c.selectedDeckTitle}
                  </p>
                  <div className="flex min-h-12 flex-wrap gap-2">
                    {selectedNumbers.length > 0 ? (
                      selectedNumbers.map((number) => (
                        <GameNumberChip key={`deck-${number}`} tone="selected" surface="light">
                          {number}
                        </GameNumberChip>
                      ))
                    ) : (
                      <GameStatusNotice tone="neutral" surface="light" className="w-full">
                        {c.selectionLabel}
                      </GameStatusNotice>
                    )}
                  </div>
                </GameSectionBlock>

                <GameSectionBlock tone="light" className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                    {c.drawnNumbers}
                  </p>
                  <div className="flex min-h-12 flex-wrap gap-2">
                    {result ? (
                      result.drawnNumbers.map((number) => (
                        <GameNumberChip
                          key={`drawn-${number}`}
                          tone={matchedSet.has(number) ? "success" : "neutral"}
                          surface="light"
                        >
                          {number}
                        </GameNumberChip>
                      ))
                    ) : (
                      <GameStatusNotice tone="neutral" surface="light" className="w-full">
                        {c.noResult}
                      </GameStatusNotice>
                    )}
                  </div>
                </GameSectionBlock>

                <GameSectionBlock tone="light" className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(15,17,31,0.48)]">
                    {c.matchedNumbers}
                  </p>
                  {result && result.matchedNumbers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {result.matchedNumbers.map((number) => (
                        <GameNumberChip key={`matched-${number}`} tone="success" surface="light">
                          {number}
                        </GameNumberChip>
                      ))}
                    </div>
                  ) : (
                    <GameStatusNotice tone="neutral" surface="light">
                      {result ? c.noMatch : c.noResult}
                    </GameStatusNotice>
                  )}
                </GameSectionBlock>
              </CardContent>
            </GameSurfaceCard>

            <GameSurfaceCard className="overflow-hidden">
              <CardContent className="space-y-4 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--retro-gold)]">
                    {c.fairnessTitle}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{c.fairnessHint}</p>
                </div>

                {result ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <GameMetricTile
                      label={c.fairnessCommit}
                      value={formatCommitHash(result.fairness.commitHash)}
                      valueClassName="text-sm font-semibold"
                    />
                    <GameMetricTile
                      label={c.roundId}
                      value={result.roundId}
                      valueClassName="text-sm font-semibold"
                    />
                    <GameMetricTile
                      label={c.nonceSource}
                      value={formatNonceSource(locale, result.fairness.nonceSource)}
                      valueClassName="text-sm font-semibold"
                    />
                    <GameMetricTile
                      label={c.clientNonce}
                      value={result.fairness.clientNonce}
                      valueClassName="text-sm font-semibold"
                    />
                    <GameMetricTile
                      label={c.algorithm}
                      value={result.fairness.algorithm}
                      valueClassName="text-sm font-semibold"
                    />
                    <GameMetricTile
                      label={c.rngDigest}
                      value={formatCommitHash(result.fairness.rngDigest)}
                      valueClassName="text-sm font-semibold"
                    />
                  </div>
                ) : (
                  <GameStatusNotice tone="neutral">{c.noResult}</GameStatusNotice>
                )}
              </CardContent>
            </GameSurfaceCard>
          </div>
        </div>
      </div>
    </section>
  );
}
