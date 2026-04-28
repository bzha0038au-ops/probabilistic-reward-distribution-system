import Link from "next/link";
import { notFound } from "next/navigation";
import type { HandHistory } from "@reward/shared-types/hand-history";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { USER_API_ROUTES } from "@/lib/api/user";
import { apiRequestServer } from "@/lib/api/server";
import { getServerLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { HoldemReplayDetail } from "@/modules/holdem/components/holdem-replay-detail";

const copy = {
  en: {
    title: "Hold'em Replay Detail",
    description:
      "Full hand replay, event timeline, and dispute metadata for the selected round.",
    backToTable: "Back to table",
  },
  "zh-CN": {
    title: "德州回放详情",
    description: "查看所选牌局的完整回放、事件时间线，以及争议排查所需的元数据。",
    backToTable: "返回牌桌",
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
      <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.42)]">
        <CardHeader className="border-b border-white/5 bg-[linear-gradient(135deg,_rgba(14,116,144,0.25),_rgba(8,47,73,0.2)_40%,_rgba(2,6,23,0.96)_100%)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>{c.title}</CardTitle>
              <CardDescription className="mt-2 text-slate-300">
                {c.description}{" "}
                <span className="font-medium text-slate-100">{response.data.roundId}</span>.
              </CardDescription>
            </div>

            <Link
              href="/app/holdem"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
              )}
            >
              {c.backToTable}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <HoldemReplayDetail history={response.data} mode="page" />
        </CardContent>
      </Card>
    </section>
  );
}
