import type {
  RewardCenterResponse,
  RewardMission,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import { toMoneyString } from "../../shared/money";

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
  dailyEnabled: boolean;
  dailyAmount: string;
  profileSecurityRewardAmount: string;
  firstDrawRewardAmount: string;
  drawStreakDailyRewardAmount: string;
  topUpStarterRewardAmount: string;
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

export function evaluateRewardCenter(
  snapshot: RewardCenterSnapshot,
  now = new Date(),
): RewardCenterResponse {
  const profileSecurityEnabled =
    Number(snapshot.profileSecurityRewardAmount) > 0;
  const firstDrawEnabled = Number(snapshot.firstDrawRewardAmount) > 0;
  const drawStreakDailyEnabled =
    Number(snapshot.drawStreakDailyRewardAmount) > 0;
  const topUpStarterEnabled = Number(snapshot.topUpStarterRewardAmount) > 0;
  const nextResetAt = addDays(startOfDay(now), 1);
  const todayDailyClaim =
    snapshot.dailyClaims.find((entry) => isSameDay(entry, now)) ?? null;
  const streakDays = calculateDailyStreak(snapshot.dailyClaims, now);

  const missions: RewardMission[] = [
    {
      id: "daily_checkin",
      cadence: "daily",
      status: !snapshot.dailyEnabled
        ? "disabled"
        : todayDailyClaim
          ? "claimed"
          : "in_progress",
      rewardAmount: snapshot.dailyAmount,
      progressCurrent: todayDailyClaim ? 1 : 0,
      progressTarget: 1,
      claimable: false,
      autoAwarded: true,
      claimedAt: todayDailyClaim,
      resetsAt: nextResetAt,
    },
    (() => {
      const claim = findMissionClaim(
        snapshot.missionClaims,
        "profile_security",
        now,
        "one_time",
      );
      const progressCurrent =
        Number(Boolean(snapshot.emailVerifiedAt)) +
        Number(Boolean(snapshot.phoneVerifiedAt));
      return {
        id: "profile_security" as const,
        cadence: "one_time" as const,
        status: !profileSecurityEnabled
          ? "disabled"
          : claim
            ? "claimed"
            : progressCurrent >= 2
              ? "ready"
              : "in_progress",
        rewardAmount: snapshot.profileSecurityRewardAmount,
        progressCurrent,
        progressTarget: 2,
        claimable: profileSecurityEnabled && !claim && progressCurrent >= 2,
        autoAwarded: false,
        claimedAt: claim?.createdAt ?? null,
        resetsAt: null,
      };
    })(),
    (() => {
      const claim = findMissionClaim(
        snapshot.missionClaims,
        "first_draw",
        now,
        "one_time",
      );
      const progressCurrent = Math.min(snapshot.drawCountAll, 1);
      return {
        id: "first_draw" as const,
        cadence: "one_time" as const,
        status: !firstDrawEnabled
          ? "disabled"
          : claim
            ? "claimed"
            : progressCurrent >= 1
              ? "ready"
              : "in_progress",
        rewardAmount: snapshot.firstDrawRewardAmount,
        progressCurrent,
        progressTarget: 1,
        claimable: firstDrawEnabled && !claim && progressCurrent >= 1,
        autoAwarded: false,
        claimedAt: claim?.createdAt ?? null,
        resetsAt: null,
      };
    })(),
    (() => {
      const claim = findMissionClaim(
        snapshot.missionClaims,
        "draw_streak_daily",
        now,
        "daily",
      );
      const progressCurrent = Math.min(snapshot.drawCountToday, 3);
      return {
        id: "draw_streak_daily" as const,
        cadence: "daily" as const,
        status: !drawStreakDailyEnabled
          ? "disabled"
          : claim
            ? "claimed"
            : progressCurrent >= 3
              ? "ready"
              : "in_progress",
        rewardAmount: snapshot.drawStreakDailyRewardAmount,
        progressCurrent,
        progressTarget: 3,
        claimable: drawStreakDailyEnabled && !claim && progressCurrent >= 3,
        autoAwarded: false,
        claimedAt: claim?.createdAt ?? null,
        resetsAt: nextResetAt,
      };
    })(),
    (() => {
      const claim = findMissionClaim(
        snapshot.missionClaims,
        "top_up_starter",
        now,
        "one_time",
      );
      const progressCurrent = Math.min(snapshot.depositCount, 1);
      return {
        id: "top_up_starter" as const,
        cadence: "one_time" as const,
        status: !topUpStarterEnabled
          ? "disabled"
          : claim
            ? "claimed"
            : progressCurrent >= 1
              ? "ready"
              : "in_progress",
        rewardAmount: snapshot.topUpStarterRewardAmount,
        progressCurrent,
        progressTarget: 1,
        claimable: topUpStarterEnabled && !claim && progressCurrent >= 1,
        autoAwarded: false,
        claimedAt: claim?.createdAt ?? null,
        resetsAt: null,
      };
    })(),
  ];

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
