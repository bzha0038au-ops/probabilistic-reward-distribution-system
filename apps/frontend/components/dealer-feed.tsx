"use client";

import type { DealerEvent } from "@reward/shared-types/dealer";

import { cn } from "@/lib/utils";

const formatDealerTimestamp = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fallbackDealerText = (event: DealerEvent) => {
  if (event.text) {
    return event.text;
  }

  if (event.actionCode) {
    return event.actionCode
      .split("_")
      .filter((part) => part.length > 0)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(" ");
  }

  if (event.pace) {
    return event.pace[0]!.toUpperCase() + event.pace.slice(1);
  }

  return "Dealer update";
};

const dealerBubbleTone = (event: DealerEvent) => {
  if (event.kind === "message") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-50";
  }

  if (event.kind === "pace_hint") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-50";
  }

  return "border-white/10 bg-black/20 text-slate-100";
};

export function DealerFeed(props: {
  aiLabel?: string;
  className?: string;
  dealerLabel: string;
  emptyLabel: string;
  title: string;
  events: DealerEvent[];
  ruleLabel?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5",
        props.className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-100">
            AI
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/80">
              {props.title}
            </p>
            <p className="text-sm font-semibold text-white">{props.dealerLabel}</p>
          </div>
        </div>
        {props.events.length > 0 ? (
          <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {props.events.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {props.events.length > 0 ? (
          props.events.map((event) => (
            <div
              key={event.id}
              className={cn(
                "rounded-2xl border px-4 py-3 shadow-[0_12px_32px_rgba(2,6,23,0.22)]",
                dealerBubbleTone(event),
              )}
            >
              {(() => {
                const timestamp = formatDealerTimestamp(event.createdAt);
                return (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-inherit">
                        {props.dealerLabel}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] opacity-70">
                        <span>
                          {event.source === "llm"
                            ? (props.aiLabel ?? "AI")
                            : (props.ruleLabel ?? "Rule")}
                        </span>
                        {timestamp ? <span>{timestamp}</span> : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-inherit">
                      {fallbackDealerText(event)}
                    </p>
                  </>
                );
              })()}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
            {props.emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
