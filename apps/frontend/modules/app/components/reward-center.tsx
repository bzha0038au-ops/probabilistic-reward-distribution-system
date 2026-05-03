"use client";
import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/i18n-provider";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { RewardMissionCard } from "./user-dashboard-domain-ui";

const copy = {
  en: {
    title: "Reward center",
    description:
      "Turn raw account actions into streaks, missions, and claimable bonus loops.",
    eyebrow: "Daily quest board",
    cycleTitle: "Reward cycle",
    cycleDescription:
      "Track the missions that are already unlocked, the loops still in progress, and the bonus credits waiting on the board.",
    streakDeck: "Streak deck",
    streakStatusGranted: "Check-in granted",
    streakStatusOpen: "Check-in open",
    claimWindowTitle: "Claim window",
    claimWindowReady:
      "Ready missions can be claimed immediately from the board below.",
    claimWindowWaiting:
      "No missions are claimable yet. Finish the active loops to unlock the next drop.",
    progressLabel: "Completion ratio",
    progressSummary: "{claimed}/{total} claimed",
    railTitle: "Progress rail",
    missionMix: "Mission cadence",
    recentClaims: "Recent claims",
    noClaims: "No claimed rewards yet.",
    availableBounty: "Live bounty",
    claimedCount: "Claimed missions",
    oneTime: "One-time drops",
    daily: "Daily loops",
    nextReset: "Next reset",
    noReset: "No reset scheduled",
    boardSummary: "{ready} ready · {active} active",
    boardEmpty: "The mission board will repopulate as new loops unlock.",
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
        title: "First deposit bonus",
        description:
          "Complete your first credited deposit to receive an automatic starter bonus.",
      },
    } satisfies Record<string, { title: string; description: string }>,
  },
  "zh-CN": {
    title: "奖励中心",
    description:
      "把账户动作包装成签到、任务和可领取奖励，形成真正可感知的游戏化循环。",
    eyebrow: "每日任务大厅",
    cycleTitle: "奖励循环",
    cycleDescription:
      "把已解锁任务、进行中的循环和待领取奖励，收进同一个更清晰的任务面板里。",
    streakDeck: "连击卡组",
    streakStatusGranted: "签到已发放",
    streakStatusOpen: "签到可领取",
    claimWindowTitle: "领取窗口",
    claimWindowReady: "当前可领取任务已经就绪，可以直接在下方任务板中领取。",
    claimWindowWaiting: "目前还没有可领取任务，继续完成进行中的循环来解锁下一批奖励。",
    progressLabel: "完成比例",
    progressSummary: "已领取 {claimed}/{total}",
    railTitle: "进度侧轨",
    missionMix: "任务节奏",
    recentClaims: "最近领取",
    noClaims: "还没有已领取的奖励记录。",
    availableBounty: "待领奖励",
    claimedCount: "已领取任务",
    oneTime: "一次性任务",
    daily: "每日循环",
    nextReset: "下次重置",
    noReset: "暂无重置时间",
    boardSummary: "{ready} 个待领 · {active} 个进行中",
    boardEmpty: "新的奖励循环解锁后，任务看板会自动补充。",
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
        title: "首充奖励",
        description: "完成第一笔到账充值后，系统会自动发放首充奖励。",
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

const missionStatusOrder: Record<RewardMission["status"], number> = {
  ready: 0,
  in_progress: 1,
  claimed: 2,
  disabled: 3,
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

  const missions = [...(center?.missions ?? [])].sort((left, right) => {
    const statusDelta =
      missionStatusOrder[left.status] - missionStatusOrder[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return left.id.localeCompare(right.id);
  });

  const readyMissions = missions.filter((mission) => mission.status === "ready");
  const claimedMissions = missions
    .filter((mission) => mission.status === "claimed" && mission.claimedAt)
    .sort((left, right) => {
      const leftDate = new Date(left.claimedAt ?? 0).valueOf();
      const rightDate = new Date(right.claimedAt ?? 0).valueOf();
      return rightDate - leftDate;
    });
  const dailyMissionCount = missions.filter(
    (mission) => mission.cadence === "daily",
  ).length;
  const oneTimeMissionCount = missions.length - dailyMissionCount;
  const inProgressCount = missions.filter(
    (mission) => mission.status === "in_progress",
  ).length;
  const totalMissionCount = missions.length;
  const overallProgressPercent =
    totalMissionCount > 0
      ? Math.round(
          ((center?.summary.claimedMissionCount ?? 0) / totalMissionCount) * 100,
        )
      : 0;
  const nextResetAt = missions
    .map((mission) => mission.resetsAt)
    .filter((value): value is string | Date => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0];

  const totalRewardFor = (list: RewardMission[]) =>
    list.reduce((sum, mission) => {
      const amount = Number(mission.rewardAmount);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

  const readyRewardTotal = formatAmount(totalRewardFor(readyMissions).toFixed(2));
  const boardSummary = c.boardSummary
    .replace("{ready}", String(readyMissions.length))
    .replace("{active}", String(inProgressCount));
  const progressSummary = c.progressSummary
    .replace("{claimed}", String(center?.summary.claimedMissionCount ?? 0))
    .replace("{total}", String(totalMissionCount));

  return (
    <div className="space-y-6">
      <div data-testid="reward-hero">
        <GameSurfaceCard tone="light" className="overflow-hidden">
          <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_top,var(--retro-gold)_0,rgba(255,213,61,0.12)_18%,transparent_60%)] xl:block" />
            <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_320px]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <Badge className="retro-badge retro-badge-gold border-none">
                    {c.eyebrow}
                  </Badge>
                  <div className="space-y-3">
                    <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)] md:text-[2.55rem]">
                      {c.title}
                    </h2>
                    <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.72)]">
                      {c.cycleDescription}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <GameMetricTile
                    tone="light"
                    label={c.bonusBalance}
                    value={center ? formatAmount(center.summary.bonusBalance) : "0.00"}
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.streakDays}
                    value={center?.summary.streakDays ?? 0}
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.available}
                    value={center?.summary.availableMissionCount ?? 0}
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.claimedCount}
                    value={center?.summary.claimedMissionCount ?? 0}
                  />
                </div>

                <GameSectionBlock tone="light" className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                        {c.cycleTitle}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--retro-ink)]">
                        {progressSummary}
                      </p>
                    </div>
                    <GamePill
                      surface="light"
                      tone={center?.summary.todayDailyClaimed ? "success" : "warning"}
                    >
                      {center?.summary.todayDailyClaimed
                        ? c.todayCheckInGranted
                        : c.streakStatusOpen}
                    </GamePill>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[rgba(15,17,31,0.56)]">
                      <span>{c.progressLabel}</span>
                      <span>{overallProgressPercent}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full border border-[rgba(15,17,31,0.12)] bg-white/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--retro-gold)] via-[var(--retro-orange)] to-[var(--retro-violet)] transition-[width]"
                        style={{ width: `${overallProgressPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <GameStatusNotice
                      surface="light"
                      tone={readyMissions.length > 0 ? "success" : "neutral"}
                    >
                      <p className="font-semibold text-[var(--retro-ink)]">
                        {c.claimWindowTitle}
                      </p>
                      <p className="mt-1 text-[rgba(15,17,31,0.68)]">
                        {readyMissions.length > 0
                          ? c.claimWindowReady
                          : c.claimWindowWaiting}
                      </p>
                    </GameStatusNotice>
                    <GameStatusNotice surface="light" tone="info">
                      <p className="font-semibold text-[var(--retro-ink)]">
                        {c.nextReset}
                      </p>
                      <p className="mt-1 text-[rgba(15,17,31,0.68)]">
                        {nextResetAt ? formatDateTime(nextResetAt) : c.noReset}
                      </p>
                    </GameStatusNotice>
                  </div>
                </GameSectionBlock>
              </div>

              <GameSectionBlock tone="dark" className="space-y-5 self-stretch">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {c.streakDeck}
                  </p>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-5xl font-semibold tracking-[-0.05em] text-white">
                        {center?.summary.streakDays ?? 0}
                      </p>
                      <p className="mt-2 text-sm uppercase tracking-[0.22em] text-slate-300">
                        {c.streakDays}
                      </p>
                    </div>
                    <span
                      className={`retro-badge ${
                        center?.summary.todayDailyClaimed
                          ? "retro-badge-green"
                          : "retro-badge-gold"
                      } border-none`}
                    >
                      {center?.summary.todayDailyClaimed
                        ? c.streakStatusGranted
                        : c.streakStatusOpen}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3">
                  <GameMetricTile
                    label={c.availableBounty}
                    value={readyRewardTotal}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                  <GameMetricTile
                    label={c.daily}
                    value={dailyMissionCount}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                  <GameMetricTile
                    label={c.oneTime}
                    value={oneTimeMissionCount}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                </div>
              </GameSectionBlock>
            </div>
          </CardContent>
        </GameSurfaceCard>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_320px]">
        <GameSurfaceCard className="overflow-hidden">
          <CardContent className="space-y-5 p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-slate-50">
                  {c.missions}
                </h3>
                <p className="text-sm text-slate-300">{boardSummary}</p>
              </div>
              {center?.summary.todayDailyClaimed ? (
                <Badge
                  variant="default"
                  className="retro-badge retro-badge-gold border-none"
                >
                  {c.todayCheckInGranted}
                </Badge>
              ) : null}
            </div>

            {loading && !center ? (
              <GameStatusNotice tone="neutral">{c.loading}</GameStatusNotice>
            ) : null}

            {!loading && center && center.missions.length === 0 ? (
              <GameStatusNotice tone="neutral">
                <p>{c.empty}</p>
                <p className="mt-1 text-slate-400">{c.boardEmpty}</p>
              </GameStatusNotice>
            ) : null}

            <div className="grid gap-4">
              {missions.map((mission) => {
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
                    data-testid={`reward-mission-card-${mission.id}`}
                  >
                    <RewardMissionCard
                      title={missionCopy.title}
                      description={missionCopy.description}
                      rewardLabel={c.rewardLabel}
                      rewardAmount={formatAmount(mission.rewardAmount)}
                      progressLabel={progressLabel}
                      progressPercent={ratio}
                      statusBadges={
                        <>
                          <Badge
                            variant={badgeVariant(mission)}
                            className={
                              mission.status === "claimed"
                                ? "retro-badge retro-badge-green border-none"
                                : mission.status === "ready"
                                  ? "retro-badge retro-badge-gold border-none"
                                  : "retro-badge retro-badge-ink border-none"
                            }
                          >
                            {formatStatus(mission)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              mission.cadence === "daily"
                                ? "retro-badge retro-badge-violet border-none"
                                : "retro-badge retro-badge-ink border-none"
                            }
                          >
                            {mission.cadence === "daily" ? c.daily : c.oneTime}
                          </Badge>
                          {mission.autoAwarded ? (
                            <Badge
                              variant="outline"
                              className="retro-badge retro-badge-violet border-none"
                            >
                              {c.auto}
                            </Badge>
                          ) : null}
                        </>
                      }
                      metaLines={
                        <>
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
                        </>
                      }
                      action={
                        !mission.autoAwarded ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={mission.claimable ? "arcade" : "arcadeOutline"}
                            disabled={
                              !mission.claimable ||
                              claimingMissionId === mission.id
                            }
                            onClick={() => void onClaim(mission.id)}
                          >
                            {claimingMissionId === mission.id
                              ? c.claiming
                              : c.claim}
                          </Button>
                        ) : null
                      }
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </GameSurfaceCard>

        <div className="space-y-6">
          <div data-testid="reward-progress-rail">
            <GameSurfaceCard tone="light" className="overflow-hidden">
              <CardContent className="retro-ivory-surface space-y-5 px-6 py-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                    {c.railTitle}
                  </p>
                  <h3 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                    {c.missionMix}
                  </h3>
                </div>

                <div className="grid gap-3">
                  <GameMetricTile
                    tone="light"
                    label={c.availableBounty}
                    value={readyRewardTotal}
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.nextReset}
                    value={nextResetAt ? formatDateTime(nextResetAt) : c.noReset}
                    valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
                  />
                </div>

                <GameSectionBlock tone="light" className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-[rgba(15,17,31,0.68)]">
                      <span>{c.daily}</span>
                      <span>{dailyMissionCount}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[rgba(15,17,31,0.08)]">
                      <div
                        className="h-full rounded-full bg-[var(--retro-violet)]"
                        style={{
                          width: `${
                            totalMissionCount > 0
                              ? Math.round((dailyMissionCount / totalMissionCount) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-[rgba(15,17,31,0.68)]">
                      <span>{c.oneTime}</span>
                      <span>{oneTimeMissionCount}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[rgba(15,17,31,0.08)]">
                      <div
                        className="h-full rounded-full bg-[var(--retro-orange)]"
                        style={{
                          width: `${
                            totalMissionCount > 0
                              ? Math.round((oneTimeMissionCount / totalMissionCount) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </GameSectionBlock>
              </CardContent>
            </GameSurfaceCard>
          </div>

          <div data-testid="reward-recent-claims">
            <GameSurfaceCard className="overflow-hidden">
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {c.recentClaims}
                  </p>
                  <p className="text-sm text-slate-300">
                    {claimedMissions.length > 0 ? progressSummary : c.noClaims}
                  </p>
                </div>

                <div className="space-y-3">
                  {claimedMissions.slice(0, 3).map((mission) => {
                    const missionCopy = resolveMissionCopy(mission);
                    const claimedAt = formatDateTime(mission.claimedAt);
                    return (
                      <GameSectionBlock
                        key={`claimed-${mission.id}`}
                        className="space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-50">
                              {missionCopy.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {claimedAt ? `${c.completedAt}: ${claimedAt}` : c.claimed}
                            </p>
                          </div>
                          <span className="retro-badge retro-badge-green border-none">
                            +{formatAmount(mission.rewardAmount)}
                          </span>
                        </div>
                      </GameSectionBlock>
                    );
                  })}

                  {claimedMissions.length === 0 ? (
                    <GameStatusNotice tone="neutral">{c.noClaims}</GameStatusNotice>
                  ) : null}
                </div>
              </CardContent>
            </GameSurfaceCard>
          </div>
        </div>
      </section>
    </div>
  );
}
