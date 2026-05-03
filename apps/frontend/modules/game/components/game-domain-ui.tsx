import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GameSurfaceCardProps = {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light";
};

export function GameSurfaceCard({
  children,
  className,
  tone = "dark",
}: GameSurfaceCardProps) {
  return (
    <Card
      className={cn(
        tone === "light"
          ? "retro-panel-featured rounded-[1.8rem] border-none text-[var(--retro-ink)]"
          : "retro-panel-dark rounded-[1.9rem] border-none text-slate-100",
        className,
      )}
    >
      {children}
    </Card>
  );
}

type GameSectionBlockProps = {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light";
};

export function GameSectionBlock({
  children,
  className,
  tone = "dark",
}: GameSectionBlockProps) {
  return (
    <div
      className={cn(
        tone === "light"
          ? "rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/70 p-4"
          : "retro-panel-dark-soft rounded-[1.5rem] border-none p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

type GameMetricTileProps = {
  label: string;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  tone?: "dark" | "light";
};

export function GameMetricTile({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
  tone = "dark",
}: GameMetricTileProps) {
  return (
    <div
      className={cn(
        tone === "light"
          ? "rounded-[1.15rem] border border-[rgba(15,17,31,0.12)] bg-white/82 p-3"
          : "rounded-[1.15rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] p-3",
        className,
      )}
    >
      <p
        className={cn(
          tone === "light"
            ? "text-xs uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]"
            : "text-xs uppercase tracking-[0.18em] text-[var(--retro-gold)]",
          labelClassName,
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          tone === "light"
            ? "mt-2 text-lg font-semibold text-[var(--retro-ink)]"
            : "mt-2 text-lg font-semibold text-slate-50",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

type GameStatusNoticeProps = {
  tone: "info" | "warning" | "danger" | "success" | "neutral";
  children: ReactNode;
  className?: string;
  surface?: "dark" | "light";
};

export function GameStatusNotice({
  tone,
  children,
  className,
  surface = "dark",
}: GameStatusNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-[1.2rem] border-2 px-4 py-3 text-sm",
        surface === "light"
          ? tone === "warning"
            ? "border-[var(--retro-gold)] bg-[#fff6d8] text-[var(--retro-ink)]"
            : tone === "danger"
              ? "border-[var(--retro-red)] bg-[#ffebe6] text-[var(--retro-ink)]"
              : tone === "success"
                ? "border-[var(--retro-green)] bg-[#e7fff1] text-[var(--retro-ink)]"
                : tone === "info"
                  ? "border-[var(--retro-violet)] bg-[rgba(97,88,255,0.08)] text-[var(--retro-ink)]"
                  : "border-[rgba(15,17,31,0.12)] bg-white/82 text-[rgba(15,17,31,0.72)]"
          : tone === "warning"
            ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
            : tone === "danger"
              ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
              : tone === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : tone === "info"
                  ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                  : "border-white/10 bg-white/[0.04] text-slate-300",
        className,
      )}
    >
      {children}
    </div>
  );
}

type GamePillProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  className?: string;
  surface?: "dark" | "light";
};

export function GamePill({
  children,
  tone = "neutral",
  className,
  surface = "dark",
}: GamePillProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border-2 px-3 py-1 text-sm font-medium",
        surface === "light"
          ? tone === "success"
            ? "border-[var(--retro-green)] bg-[rgba(34,166,109,0.14)] text-[var(--retro-green)]"
            : tone === "warning"
              ? "border-[var(--retro-gold)] bg-[#fff2bf] text-[var(--retro-ink)]"
              : tone === "danger"
                ? "border-[var(--retro-red)] bg-[rgba(227,74,60,0.12)] text-[var(--retro-red)]"
                : tone === "info"
                  ? "border-[var(--retro-violet)] bg-[rgba(97,88,255,0.08)] text-[var(--retro-violet)]"
                  : tone === "accent"
                    ? "border-[var(--retro-ink)] bg-[var(--retro-gold)] text-[var(--retro-ink)]"
                    : "border-[rgba(15,17,31,0.12)] bg-white/84 text-[var(--retro-ink)]"
          : tone === "success"
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            : tone === "warning"
              ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
              : tone === "danger"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                : tone === "info"
                  ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                  : tone === "accent"
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-white/10 bg-white/[0.04] text-slate-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

type GameNumberChipProps = {
  children: ReactNode;
  tone?: "neutral" | "selected" | "success" | "warning";
  className?: string;
  surface?: "dark" | "light";
};

export function GameNumberChip({
  children,
  tone = "neutral",
  className,
  surface = "dark",
}: GameNumberChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-10 items-center justify-center rounded-full border-2 px-3 py-1 text-sm font-medium",
        surface === "light"
          ? tone === "selected"
            ? "border-[var(--retro-gold)] bg-[#fff2bf] text-[var(--retro-ink)]"
            : tone === "success"
              ? "border-[var(--retro-green)] bg-[rgba(34,166,109,0.14)] text-[var(--retro-green)]"
              : tone === "warning"
                ? "border-[var(--retro-orange)] bg-[var(--retro-orange)] text-[var(--retro-ivory)]"
                : "border-[rgba(15,17,31,0.14)] bg-white/84 text-[var(--retro-ink)]"
          : tone === "selected"
            ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
            : tone === "success"
              ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
              : tone === "warning"
                ? "border-amber-300 bg-amber-300 text-slate-950"
                : "border-slate-700 bg-slate-950 text-slate-200",
        className,
      )}
    >
      {children}
    </span>
  );
}
