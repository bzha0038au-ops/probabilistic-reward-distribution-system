import Link from "next/link";
import { notFound } from "next/navigation";
import type { HandHistory } from "@reward/shared-types/hand-history";

import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { USER_API_ROUTES } from "@/lib/api/user";
import { apiRequestServer } from "@/lib/api/server";
import { getServerLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import {
  GameMetricTile,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { HoldemReplayDetail } from "@/modules/holdem/components/holdem-replay-detail";

const copy = {
  en: {
    title: "Hold'em Replay Detail",
    description:
      "Full hand replay, event timeline, and dispute metadata for the selected round.",
    backToTable: "Back to table",
    roundId: "Round id",
    status: "Status",
    reference: "Reference",
    events: "Events",
  },
  "zh-CN": {
    title: "德州回放详情",
    description: "查看所选牌局的完整回放、事件时间线，以及争议排查所需的元数据。",
    backToTable: "返回牌桌",
    roundId: "回合编号",
    status: "状态",
    reference: "记录号",
    events: "事件数",
  },
} as const;

export default async function HoldemReplayDetailPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const locale = await getServerLocale();
  const c = copy[locale === "zh-CN" ? "zh-CN" : "en"];
  const { roundId } = await params;
  const response = await apiRequestServer<HandHistory>(
    `${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}`,
    { cache: "no-store" },
  );

  if (!response.ok || response.data.roundType !== "holdem") {
    notFound();
  }

  return (
    <section className="space-y-6">
      <GameSurfaceCard className="overflow-hidden" tone="light">
        <CardContent className="retro-ivory-surface relative p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
            <div className="space-y-4">
              <span className="retro-kicker">{c.title}</span>
              <div className="space-y-3">
                <h1 className="text-[2.7rem] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--retro-ink)] md:text-[3.7rem]">
                  {c.title}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.7)]">
                  {c.description}{" "}
                  <span className="font-semibold text-[var(--retro-ink)]">
                    {response.data.roundId}
                  </span>
                  .
                </p>
              </div>

              <Link
                href="/app/holdem"
                className={cn(
                  buttonVariants({ variant: "arcadeDark" }),
                  "w-fit",
                )}
              >
                {c.backToTable}
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <GameMetricTile
                tone="light"
                label={c.roundId}
                value={response.data.roundId}
                valueClassName="break-all text-sm font-semibold text-[var(--retro-ink)]"
              />
              <GameMetricTile
                tone="light"
                label={c.status}
                value={response.data.status}
                valueClassName="text-base font-black uppercase tracking-[0.16em] text-[var(--retro-violet)]"
              />
              <GameMetricTile
                tone="light"
                label={c.reference}
                value={`#${response.data.referenceId}`}
                valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-orange)]"
              />
              <GameMetricTile
                tone="light"
                label={c.events}
                value={response.data.events.length}
                valueClassName="text-base font-black tracking-[-0.03em] text-[var(--retro-ink)]"
              />
            </div>
          </div>
        </CardContent>
      </GameSurfaceCard>

      <HoldemReplayDetail history={response.data} mode="page" />
    </section>
  );
}
