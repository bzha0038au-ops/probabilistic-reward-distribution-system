import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
  RewardMissionMetric,
} from "@reward/shared-types/gamification";

import { toMoneyString } from "../../shared/money";
import type { RewardMissionDefinition } from "./catalog";

export type RewardCenterSnapshot = {
  bonusBalance: string | number;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  drawCountAll: number;
  drawCountToday: number;
  depositCount: number;
  dailyClaims: Array<Date>;
  missionClaims: Array<{
    missionId: RewardMissionId | null;
    createdAt: Date;
  }>;
  missions: RewardMissionDefinition[];
};

const startOfDay = (value = new Date()) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const isSameDay = (left: Date, right: Date) =>
  startOfDay(left).getTime() === startOfDay(right).getTime();

export function calculateDailyStreak(dates: readonly Date[], now = new Date()) {
  if (dates.length === 0) {
    return 0;
  }

  const uniqueDays = Array.from(
    new Set(dates.map((entry) => startOfDay(entry).getTime())),
  ).sort((left, right) => right - left);

  let streak = 0;
  let expectedDay = uniqueDays[0];
  for (const day of uniqueDays) {
    if (day !== expectedDay) {
      break;
    }
    streak += 1;
    expectedDay = startOfDay(addDays(new Date(expectedDay), -1)).getTime();
  }

  const today = startOfDay(now).getTime();
  const yesterday = startOfDay(addDays(now, -1)).getTime();
  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) {
    return 0;
  }

  return streak;
}

const findMissionClaim = (
  missionClaims: readonly RewardCenterSnapshot["missionClaims"][number][],
  missionId: RewardMissionId,
  now: Date,
  cadence: RewardMission["cadence"],
) => {
  const claims = missionClaims.filter((entry) => entry.missionId === missionId);
  if (claims.length === 0) {
    return null;
  }

  if (cadence === "daily") {
    return claims.find((entry) => isSameDay(entry.createdAt, now)) ?? null;
  }

  return claims[0] ?? null;
};

const evaluateMetricProgress = (
  snapshot: RewardCenterSnapshot,
  metric: RewardMissionMetric,
) => {
  if (metric === "verified_contacts") {
    return (
      Number(Boolean(snapshot.emailVerifiedAt)) +
      Number(Boolean(snapshot.phoneVerifiedAt))
    );
  }

  if (metric === "draw_count_all") {
    return snapshot.drawCountAll;
  }

  if (metric === "draw_count_today") {
    return snapshot.drawCountToday;
  }

  return snapshot.depositCount;
};

const evaluateMission = (
  definition: RewardMissionDefinition,
  snapshot: RewardCenterSnapshot,
  now: Date,
  nextResetAt: Date,
  todayDailyClaim: Date | null,
): RewardMission => {
  if (definition.type === "daily_checkin") {
    const enabled = definition.isActive && Number(definition.reward) > 0;
    return {
      id: definition.id,
      title: definition.params.title,
      description: definition.params.description,
      cadence: "daily",
      status: !enabled
        ? "disabled"
        : todayDailyClaim
          ? "claimed"
          : "in_progress",
      rewardAmount: definition.reward,
      progressCurrent: todayDailyClaim ? 1 : 0,
      progressTarget: 1,
      claimable: false,
      autoAwarded: true,
      claimedAt: todayDailyClaim,
      resetsAt: nextResetAt,
    };
  }

  const claim = findMissionClaim(
    snapshot.missionClaims,
    definition.id,
    now,
    definition.params.cadence,
  );
  const progressCurrent = Math.min(
    evaluateMetricProgress(snapshot, definition.params.metric),
    definition.params.target,
  );
  const enabled = definition.isActive && Number(definition.reward) > 0;

  return {
    id: definition.id,
    title: definition.params.title,
    description: definition.params.description,
    cadence: definition.params.cadence,
    status: !enabled
      ? "disabled"
      : claim
        ? "claimed"
        : progressCurrent >= definition.params.target
          ? "ready"
          : "in_progress",
    rewardAmount: definition.reward,
    progressCurrent,
    progressTarget: definition.params.target,
    claimable:
      enabled && claim === null && progressCurrent >= definition.params.target,
    autoAwarded: false,
    claimedAt: claim?.createdAt ?? null,
    resetsAt: definition.params.cadence === "daily" ? nextResetAt : null,
  };
};

export function evaluateRewardCenter(
  snapshot: RewardCenterSnapshot,
  now = new Date(),
): RewardCenterResponse {
  const nextResetAt = addDays(startOfDay(now), 1);
  const todayDailyClaim =
    snapshot.dailyClaims.find((entry) => isSameDay(entry, now)) ?? null;
  const streakDays = calculateDailyStreak(snapshot.dailyClaims, now);
  const missions = snapshot.missions.map((definition) =>
    evaluateMission(definition, snapshot, now, nextResetAt, todayDailyClaim),
  );

  return {
    summary: {
      bonusBalance: toMoneyString(snapshot.bonusBalance ?? 0),
      streakDays,
      todayDailyClaimed: Boolean(todayDailyClaim),
      availableMissionCount: missions.filter(
        (mission) => mission.status === "ready",
      ).length,
      claimedMissionCount: missions.filter(
        (mission) => mission.status === "claimed",
      ).length,
    },
    missions,
  };
}
