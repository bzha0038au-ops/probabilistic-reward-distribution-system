"use client";

import type {
  PlayModeGameKey,
  PlayModeSnapshot,
  PlayModeType,
} from "@reward/shared-types/play-mode";

import { useLocale } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const modeOrder: PlayModeType[] = [
  "standard",
  "dual_bet",
  "deferred_double",
  "snowball",
];

const copy = {
  en: {
    title: "Play mode",
    subtitle: "Apply strategy wrappers without changing the underlying game engine.",
    standard: "Standard",
    dual_bet: "Dual bet",
    deferred_double: "Deferred payout",
    snowball: "Snowball",
    applied: "Current",
    next: "Next",
    streak: "Streak",
    pending: "Pending",
    carry: "Carry",
    envelope: "Envelope",
    active: "Active carry",
    idle: "Idle",
    descriptions: {
      draw: {
        standard: "1 result",
        dual_bet: "2 independent results",
        deferred_double: "wins release on next play",
        snowball: "wins roll into carry, bank on miss",
      },
      blackjack: {
        standard: "x1 stake",
        dual_bet: "2 independent hands",
        deferred_double: "wins release on next hand",
        snowball: "wins roll into carry, bank on loss",
      },
      holdem: {
        standard: "x1 buy-in",
        dual_bet: "2 linked tables",
        deferred_double: "profit releases on next table",
        snowball: "profit rolls into carry, bank on loss",
      },
    },
  },
  "zh-CN": {
    title: "玩法增强",
    subtitle: "只加策略包装，不改底层游戏引擎。",
    standard: "标准",
    dual_bet: "双倍下注",
    deferred_double: "递延派发",
    snowball: "滚雪球",
    applied: "当前",
    next: "下次",
    streak: "连胜",
    pending: "挂起",
    carry: "滚存",
    envelope: "信封",
    active: "已挂起",
    idle: "待机",
    descriptions: {
      draw: {
        standard: "1 次结果",
        dual_bet: "2 次独立结果",
        deferred_double: "奖金延后到下一局释放",
        snowball: "连续命中滚存，失手后结算",
      },
      blackjack: {
        standard: "下注 x1",
        dual_bet: "2 局独立结果",
        deferred_double: "奖金延后到下手释放",
        snowball: "连续赢牌滚存，输牌后结算",
      },
      holdem: {
        standard: "买入 x1",
        dual_bet: "2 张联动牌桌",
        deferred_double: "盈利延后到下一桌释放",
        snowball: "连续盈利滚存，失利后结算",
      },
    },
  },
} as const;

type PlayModeSwitcherProps = {
  gameKey: PlayModeGameKey;
  snapshot: PlayModeSnapshot | null;
  disabled?: boolean;
  loading?: boolean;
  onSelect: (type: PlayModeType) => void;
};

export function PlayModeSwitcher(props: PlayModeSwitcherProps) {
  const locale = useLocale() === "zh-CN" ? "zh-CN" : "en";
  const c = copy[locale];
  const snapshot = props.snapshot;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            {c.title}
          </p>
          <p className="mt-1 text-sm text-slate-300">{c.subtitle}</p>
        </div>
        {snapshot ? (
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            {snapshot.type === "standard" || snapshot.type === "dual_bet" ? (
              <>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {c.applied}: x{snapshot.appliedMultiplier}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {c.next}: x{snapshot.nextMultiplier}
                </span>
              </>
            ) : null}
            <span className="rounded-full border border-white/10 px-3 py-1">
              {c.streak}: {snapshot.streak}
            </span>
            {snapshot.pendingPayoutCount > 0 ? (
              <span className="rounded-full border border-white/10 px-3 py-1">
                {c.pending}: {snapshot.pendingPayoutAmount}
              </span>
            ) : null}
            {snapshot.snowballCarryAmount !== "0.00" ? (
              <span className="rounded-full border border-white/10 px-3 py-1">
                {c.carry}: {snapshot.snowballCarryAmount}
              </span>
            ) : null}
            {snapshot.snowballEnvelopeAmount !== "0.00" ? (
              <span className="rounded-full border border-white/10 px-3 py-1">
                {c.envelope}: {snapshot.snowballEnvelopeAmount}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 px-3 py-1">
              {snapshot.carryActive ? c.active : c.idle}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {modeOrder.map((mode) => {
          const active = snapshot?.type === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={props.disabled || props.loading}
              onClick={() => props.onSelect(mode)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition-colors",
                active
                  ? "border-emerald-300/45 bg-emerald-300/12 text-white"
                  : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.06]",
                props.disabled || props.loading
                  ? "cursor-not-allowed opacity-60"
                  : null,
              )}
            >
              <p className="text-sm font-semibold">{c[mode]}</p>
              <p className="mt-1 text-xs text-slate-400">
                {c.descriptions[props.gameKey][mode]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
