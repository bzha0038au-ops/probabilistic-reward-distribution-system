import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GameSurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

export function GameSurfaceCard({
  children,
  className,
}: GameSurfaceCardProps) {
  return (
    <Card
      className={cn(
        "border-slate-800 bg-slate-950/90 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]",
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
};

export function GameSectionBlock({
  children,
  className,
}: GameSectionBlockProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800 bg-slate-900/70 p-4",
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
};

export function GameMetricTile({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: GameMetricTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-950/80 p-3",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs uppercase tracking-[0.18em] text-slate-500",
          labelClassName,
        )}
      >
        {label}
      </p>
      <div className={cn("mt-2 text-lg font-semibold text-slate-100", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

type GameStatusNoticeProps = {
  tone: "info" | "warning" | "danger" | "success" | "neutral";
  children: ReactNode;
  className?: string;
};

export function GameStatusNotice({
  tone,
  children,
  className,
}: GameStatusNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "warning"
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
};

export function GamePill({
  children,
  tone = "neutral",
  className,
}: GamePillProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-sm font-medium",
        tone === "success"
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
};

export function GameNumberChip({
  children,
  tone = "neutral",
  className,
}: GameNumberChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-10 items-center justify-center rounded-full border px-3 py-1 text-sm font-medium",
        tone === "selected"
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
