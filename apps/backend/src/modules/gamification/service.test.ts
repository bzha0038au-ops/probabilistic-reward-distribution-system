import { describe, expect, it } from "vitest";

import { calculateDailyStreak, evaluateRewardCenter } from "./evaluation";
import type { RewardMissionDefinition } from "./catalog";

const atLocalNoon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0, 0);

const missionDefinitions = (
  overrides: Partial<Record<string, Partial<RewardMissionDefinition>>> = {},
): RewardMissionDefinition[] => {
  const definitions: RewardMissionDefinition[] = [
    {
      id: "daily_checkin",
      type: "daily_checkin",
      params: {
        title: "Daily check-in",
        description: "Daily login reward.",
        sortOrder: 10,
      },
      reward: "2.00",
      isActive: true,
      createdAt: atLocalNoon(2026, 4, 1),
      updatedAt: atLocalNoon(2026, 4, 1),
      sortOrder: 10,
    },
    {
      id: "profile_security",
      type: "metric_threshold",
      params: {
        title: "Security setup",
        description: "Verify email and phone.",
        metric: "verified_contacts",
        target: 2,
        cadence: "one_time",
        sortOrder: 20,
      },
      reward: "8.00",
      isActive: true,
      createdAt: atLocalNoon(2026, 4, 1),
      updatedAt: atLocalNoon(2026, 4, 1),
      sortOrder: 20,
    },
    {
      id: "first_draw",
      type: "metric_threshold",
      params: {
        title: "First draw",
        description: "Complete your first draw.",
        metric: "draw_count_all",
        target: 1,
        cadence: "one_time",
        sortOrder: 30,
      },
      reward: "3.00",
      isActive: true,
      createdAt: atLocalNoon(2026, 4, 1),
      updatedAt: atLocalNoon(2026, 4, 1),
      sortOrder: 30,
    },
    {
      id: "draw_streak_daily",
      type: "metric_threshold",
      params: {
        title: "Draw sprint",
        description: "Finish 3 draws today.",
        metric: "draw_count_today",
        target: 3,
        cadence: "daily",
        sortOrder: 40,
      },
      reward: "5.00",
      isActive: true,
      createdAt: atLocalNoon(2026, 4, 1),
      updatedAt: atLocalNoon(2026, 4, 1),
      sortOrder: 40,
    },
    {
      id: "top_up_starter",
      type: "metric_threshold",
      params: {
        title: "Top-up starter",
        description: "Create your first deposit request.",
        metric: "deposit_count",
        target: 1,
        cadence: "one_time",
        sortOrder: 50,
      },
      reward: "10.00",
      isActive: true,
      createdAt: atLocalNoon(2026, 4, 1),
      updatedAt: atLocalNoon(2026, 4, 1),
      sortOrder: 50,
    },
  ];

  return definitions.map((definition) => ({
    ...definition,
    ...(overrides[definition.id] ?? {}),
  })) as RewardMissionDefinition[];
};

describe("calculateDailyStreak", () => {
  it("deduplicates same-day claims and counts consecutive days", () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak(
      [
        atLocalNoon(2026, 4, 27),
        new Date(2026, 3, 27, 18, 0, 0, 0),
        atLocalNoon(2026, 4, 26),
        atLocalNoon(2026, 4, 25),
      ],
      now,
    );

    expect(streak).toBe(3);
  });

  it("breaks the streak when a day is skipped", () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak(
      [atLocalNoon(2026, 4, 26), atLocalNoon(2026, 4, 24)],
      now,
    );

    expect(streak).toBe(1);
  });

  it("returns zero when the latest claim is stale", () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak([atLocalNoon(2026, 4, 23)], now);

    expect(streak).toBe(0);
  });
});

describe("evaluateRewardCenter", () => {
  it("marks ready missions from current engagement state", () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: "12.50",
        emailVerifiedAt: atLocalNoon(2026, 4, 20),
        phoneVerifiedAt: atLocalNoon(2026, 4, 21),
        drawCountAll: 4,
        drawCountToday: 3,
        depositCount: 1,
        dailyClaims: [atLocalNoon(2026, 4, 27), atLocalNoon(2026, 4, 26)],
        missionClaims: [],
        missions: missionDefinitions(),
      },
      now,
    );

    expect(center.summary.bonusBalance).toBe("12.50");
    expect(center.summary.streakDays).toBe(2);
    expect(center.summary.todayDailyClaimed).toBe(true);
    expect(center.summary.availableMissionCount).toBe(4);
    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "daily_checkin",
          status: "claimed",
          claimable: false,
          autoAwarded: true,
        }),
        expect.objectContaining({
          id: "profile_security",
          status: "ready",
          claimable: true,
        }),
        expect.objectContaining({
          id: "first_draw",
          status: "ready",
          claimable: true,
        }),
        expect.objectContaining({
          id: "draw_streak_daily",
          status: "ready",
          claimable: true,
        }),
        expect.objectContaining({
          id: "top_up_starter",
          status: "ready",
          claimable: true,
        }),
      ]),
    );
  });

  it("marks claimed and disabled missions correctly", () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: "5.00",
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        drawCountAll: 1,
        drawCountToday: 3,
        depositCount: 0,
        dailyClaims: [],
        missionClaims: [
          {
            missionId: "first_draw",
            createdAt: atLocalNoon(2026, 4, 20),
          },
          {
            missionId: "draw_streak_daily",
            createdAt: atLocalNoon(2026, 4, 27),
          },
        ],
        missions: missionDefinitions({
          daily_checkin: {
            isActive: false,
            reward: "0.00",
          },
        }),
      },
      now,
    );

    expect(center.summary.availableMissionCount).toBe(0);
    expect(center.summary.claimedMissionCount).toBe(2);
    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "daily_checkin",
          status: "disabled",
        }),
        expect.objectContaining({
          id: "first_draw",
          status: "claimed",
          claimable: false,
        }),
        expect.objectContaining({
          id: "draw_streak_daily",
          status: "claimed",
          claimable: false,
        }),
        expect.objectContaining({
          id: "profile_security",
          status: "in_progress",
        }),
        expect.objectContaining({
          id: "top_up_starter",
          status: "in_progress",
        }),
      ]),
    );
  });

  it("disables inactive or zero-reward missions", () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: "0.00",
        emailVerifiedAt: atLocalNoon(2026, 4, 20),
        phoneVerifiedAt: atLocalNoon(2026, 4, 21),
        drawCountAll: 9,
        drawCountToday: 3,
        depositCount: 2,
        dailyClaims: [],
        missionClaims: [],
        missions: missionDefinitions({
          profile_security: { reward: "0.00" },
          first_draw: { isActive: false },
          draw_streak_daily: { reward: "0.00" },
          top_up_starter: { isActive: false },
        }),
      },
      now,
    );

    expect(center.summary.availableMissionCount).toBe(0);
    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile_security", status: "disabled" }),
        expect.objectContaining({ id: "first_draw", status: "disabled" }),
        expect.objectContaining({ id: "draw_streak_daily", status: "disabled" }),
        expect.objectContaining({ id: "top_up_starter", status: "disabled" }),
      ]),
    );
  });

  it("evaluates custom mission ids from DB definitions without hardcoded branches", () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: "18.00",
        emailVerifiedAt: atLocalNoon(2026, 4, 20),
        phoneVerifiedAt: atLocalNoon(2026, 4, 21),
        drawCountAll: 5,
        drawCountToday: 0,
        depositCount: 0,
        dailyClaims: [],
        missionClaims: [],
        missions: [
          {
            id: "custom_draw_five",
            type: "metric_threshold",
            params: {
              title: "Draw five times",
              description: "Reach 5 total draws to unlock a custom reward.",
              metric: "draw_count_all",
              target: 5,
              cadence: "one_time",
              sortOrder: 5,
            },
            reward: "12.00",
            isActive: true,
            createdAt: atLocalNoon(2026, 4, 1),
            updatedAt: atLocalNoon(2026, 4, 1),
            sortOrder: 5,
          },
        ],
      },
      now,
    );

    expect(center.summary.availableMissionCount).toBe(1);
    expect(center.missions).toEqual([
      expect.objectContaining({
        id: "custom_draw_five",
        title: "Draw five times",
        description: "Reach 5 total draws to unlock a custom reward.",
        status: "ready",
        claimable: true,
        rewardAmount: "12.00",
        progressCurrent: 5,
        progressTarget: 5,
      }),
    ]);
  });
});
