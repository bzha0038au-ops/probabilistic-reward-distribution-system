"use client";

import type {
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
    deferred_double: "Deferred x2",
    snowball: "Snowball",
    applied: "Current",
    next: "Next",
    streak: "Streak",
    active: "Active carry",
    idle: "Idle",
  },
  "zh-CN": {
    title: "玩法增强",
    subtitle: "只加策略包装，不改底层游戏引擎。",
    standard: "标准",
    dual_bet: "双倍下注",
    deferred_double: "递延翻倍",
    snowball: "滚雪球",
    applied: "当前",
    next: "下次",
    streak: "连胜",
    active: "已挂起",
    idle: "待机",
  },
} as const;

type PlayModeSwitcherProps = {
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
            <span className="rounded-full border border-white/10 px-3 py-1">
              {c.applied}: x{snapshot.appliedMultiplier}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              {c.next}: x{snapshot.nextMultiplier}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              {c.streak}: {snapshot.streak}
            </span>
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
                {mode === "standard"
                  ? "x1"
                  : mode === "dual_bet"
                    ? "x2"
                    : mode === "deferred_double"
                      ? "loss -> x2"
                      : "win -> +1"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
