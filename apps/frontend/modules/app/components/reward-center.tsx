"use client";
import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocale } from "@/components/i18n-provider";

const copy = {
  en: {
    title: "Reward center",
    description:
      "Turn raw account actions into streaks, missions, and claimable bonus loops.",
    bonusBalance: "Bonus balance",
    rewardLabel: "Bonus",
    streakDays: "Check-in streak",
    available: "Ready to claim",
    missions: "Mission board",
    loading: "Loading reward missions...",
    claiming: "Claiming...",
    claim: "Claim reward",
    auto: "Auto",
    todayCheckInGranted: "Today's check-in granted",
    claimed: "Claimed",
    ready: "Ready",
    inProgress: "In progress",
    disabled: "Disabled",
    completedAt: "Claimed at",
    resetsAt: "Resets at",
    progress: "{current}/{target}",
    empty: "No missions are available yet.",
    legacyMissionCopy: {
      daily_checkin: {
        title: "Daily check-in",
        description:
          "Sign in each day to keep the streak active and receive the daily auto bonus.",
      },
      profile_security: {
        title: "Security setup",
        description:
          "Verify email and phone to unlock finance tools and earn a profile setup bonus.",
      },
      first_draw: {
        title: "First draw",
        description: "Complete your first draw to start the engagement ladder.",
      },
      draw_streak_daily: {
        title: "Draw sprint",
        description:
          "Finish 3 draws in one day to unlock the daily sprint payout.",
      },
      top_up_starter: {
        title: "Top-up starter",
        description:
          "Create your first deposit request to unlock a starter economy reward.",
      },
    } satisfies Record<string, { title: string; description: string }>,
  },
  "zh-CN": {
    title: "奖励中心",
    description:
      "把账户动作包装成签到、任务和可领取奖励，形成真正可感知的游戏化循环。",
    bonusBalance: "奖励余额",
    rewardLabel: "奖励",
    streakDays: "签到连击",
    available: "待领取任务",
    missions: "任务看板",
    loading: "正在加载奖励任务...",
    claiming: "领取中...",
    claim: "领取奖励",
    auto: "自动发放",
    todayCheckInGranted: "今日签到奖励已发放",
    claimed: "已领取",
    ready: "可领取",
    inProgress: "进行中",
    disabled: "已关闭",
    completedAt: "领取时间",
    resetsAt: "重置时间",
    progress: "{current}/{target}",
    empty: "当前还没有可展示的奖励任务。",
    legacyMissionCopy: {
      daily_checkin: {
        title: "每日签到",
        description: "每天登录保持连击，系统会自动发放当日签到奖励。",
      },
      profile_security: {
        title: "安全档案",
        description: "完成邮箱和手机号验证，解锁出款能力并领取安全设置奖励。",
      },
      first_draw: {
        title: "首次抽奖",
        description: "完成第一次抽奖，开启后续活跃任务链。",
      },
      draw_streak_daily: {
        title: "连抽冲刺",
        description: "单日完成 3 次抽奖，解锁当日冲刺奖励。",
      },
      top_up_starter: {
        title: "首充起步",
        description: "创建第一笔充值申请，领取起步型经济奖励。",
      },
    } satisfies Record<string, { title: string; description: string }>,
  },
} as const;

type RewardCenterProps = {
  center: RewardCenterResponse | null;
  loading?: boolean;
  claimingMissionId?: RewardMissionId | null;
  onClaim: (missionId: RewardMissionId) => void | Promise<void>;
};

const badgeVariant = (mission: RewardMission) => {
  if (mission.status === "claimed") return "default" as const;
  if (mission.status === "ready") return "secondary" as const;
  if (mission.status === "disabled") return "outline" as const;
  return "outline" as const;
};

export function RewardCenter({
  center,
  loading = false,
  claimingMissionId = null,
  onClaim,
}: RewardCenterProps) {
  const locale = useLocale();
  const c = copy[locale];
  const legacyMissionCopy = c.legacyMissionCopy as Record<
    string,
    { title: string; description: string }
  >;

  const formatAmount = (value: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return value;
    }
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  };

  const formatDateTime = (value: string | Date | null) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  };

  const formatStatus = (mission: RewardMission) => {
    if (mission.status === "claimed") return c.claimed;
    if (mission.status === "ready") return c.ready;
    if (mission.status === "disabled") return c.disabled;
    return c.inProgress;
  };

  const resolveMissionCopy = (mission: RewardMission) =>
    (mission.title.trim() !== "" || mission.description.trim() !== ""
      ? {
          title: mission.title,
          description: mission.description,
        }
      : legacyMissionCopy[mission.id]) ?? {
      title: mission.title,
      description: mission.description,
    };

  return (
    <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-cyan-50 shadow-sm">
      <CardHeader className="border-b border-amber-100/80">
        <CardTitle>{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
            <p className="text-sm text-slate-500">{c.bonusBalance}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {center ? formatAmount(center.summary.bonusBalance) : "0.00"}
            </p>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
            <p className="text-sm text-slate-500">{c.streakDays}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {center?.summary.streakDays ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
            <p className="text-sm text-slate-500">{c.available}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {center?.summary.availableMissionCount ?? 0}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {c.missions}
            </h3>
            {center?.summary.todayDailyClaimed ? (
              <Badge variant="default">{c.todayCheckInGranted}</Badge>
            ) : null}
          </div>

          {loading && !center ? (
            <p className="text-sm text-slate-500">{c.loading}</p>
          ) : null}

          {!loading && center && center.missions.length === 0 ? (
            <p className="text-sm text-slate-500">{c.empty}</p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {center?.missions.map((mission) => {
              const missionCopy = resolveMissionCopy(mission);
              const ratio = Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    (mission.progressCurrent / mission.progressTarget) * 100,
                  ),
                ),
              );
              const claimedAt = formatDateTime(mission.claimedAt);
              const resetsAt = formatDateTime(mission.resetsAt);
              const progressLabel = c.progress
                .replace("{current}", String(mission.progressCurrent))
                .replace("{target}", String(mission.progressTarget));

              return (
                <div
                  key={mission.id}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-950">
                          {missionCopy.title}
                        </h4>
                        <Badge variant={badgeVariant(mission)}>
                          {formatStatus(mission)}
                        </Badge>
                        {mission.autoAwarded ? (
                          <Badge variant="outline">{c.auto}</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-600">
                        {missionCopy.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {c.rewardLabel}
                      </p>
                      <p className="text-lg font-semibold text-slate-950">
                        {formatAmount(mission.rewardAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{progressLabel}</span>
                      <span>{ratio}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-500 transition-[width]"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <div className="space-y-1">
                      {claimedAt ? (
                        <p>
                          {c.completedAt}: {claimedAt}
                        </p>
                      ) : null}
                      {!claimedAt && resetsAt ? (
                        <p>
                          {c.resetsAt}: {resetsAt}
                        </p>
                      ) : null}
                    </div>
                    {!mission.autoAwarded ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          !mission.claimable || claimingMissionId === mission.id
                        }
                        onClick={() => void onClaim(mission.id)}
                      >
                        {claimingMissionId === mission.id
                          ? c.claiming
                          : c.claim}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
