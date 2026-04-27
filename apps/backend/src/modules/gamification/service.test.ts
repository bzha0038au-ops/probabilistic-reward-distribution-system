import { describe, expect, it } from 'vitest';

import { calculateDailyStreak, evaluateRewardCenter } from './evaluation';

const atLocalNoon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0, 0);

describe('calculateDailyStreak', () => {
  it('deduplicates same-day claims and counts consecutive days', () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak(
      [
        atLocalNoon(2026, 4, 27),
        new Date(2026, 3, 27, 18, 0, 0, 0),
        atLocalNoon(2026, 4, 26),
        atLocalNoon(2026, 4, 25),
      ],
      now
    );

    expect(streak).toBe(3);
  });

  it('breaks the streak when a day is skipped', () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak(
      [atLocalNoon(2026, 4, 26), atLocalNoon(2026, 4, 24)],
      now
    );

    expect(streak).toBe(1);
  });

  it('returns zero when the latest claim is stale', () => {
    const now = atLocalNoon(2026, 4, 27);
    const streak = calculateDailyStreak([atLocalNoon(2026, 4, 23)], now);

    expect(streak).toBe(0);
  });
});

describe('evaluateRewardCenter', () => {
  it('marks ready missions from current engagement state', () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: '12.50',
        emailVerifiedAt: atLocalNoon(2026, 4, 20),
        phoneVerifiedAt: atLocalNoon(2026, 4, 21),
        drawCountAll: 4,
        drawCountToday: 3,
        depositCount: 1,
        dailyClaims: [atLocalNoon(2026, 4, 27), atLocalNoon(2026, 4, 26)],
        missionClaims: [],
        dailyEnabled: true,
        dailyAmount: '2.00',
        profileSecurityRewardAmount: '8.00',
        firstDrawRewardAmount: '3.00',
        drawStreakDailyRewardAmount: '5.00',
        topUpStarterRewardAmount: '10.00',
      },
      now
    );

    expect(center.summary.bonusBalance).toBe('12.50');
    expect(center.summary.streakDays).toBe(2);
    expect(center.summary.todayDailyClaimed).toBe(true);
    expect(center.summary.availableMissionCount).toBe(4);

    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'daily_checkin',
          status: 'claimed',
          claimable: false,
          autoAwarded: true,
        }),
        expect.objectContaining({
          id: 'profile_security',
          status: 'ready',
          claimable: true,
        }),
        expect.objectContaining({
          id: 'first_draw',
          status: 'ready',
          claimable: true,
        }),
        expect.objectContaining({
          id: 'draw_streak_daily',
          status: 'ready',
          claimable: true,
        }),
        expect.objectContaining({
          id: 'top_up_starter',
          status: 'ready',
          claimable: true,
        }),
      ])
    );
  });

  it('marks claimed and disabled missions correctly', () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: '5.00',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        drawCountAll: 1,
        drawCountToday: 3,
        depositCount: 0,
        dailyClaims: [],
        missionClaims: [
          {
            missionId: 'first_draw',
            createdAt: atLocalNoon(2026, 4, 20),
          },
          {
            missionId: 'draw_streak_daily',
            createdAt: atLocalNoon(2026, 4, 27),
          },
        ],
        dailyEnabled: false,
        dailyAmount: '0.00',
        profileSecurityRewardAmount: '8.00',
        firstDrawRewardAmount: '3.00',
        drawStreakDailyRewardAmount: '5.00',
        topUpStarterRewardAmount: '10.00',
      },
      now
    );

    expect(center.summary.availableMissionCount).toBe(0);
    expect(center.summary.claimedMissionCount).toBe(2);
    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'daily_checkin',
          status: 'disabled',
        }),
        expect.objectContaining({
          id: 'first_draw',
          status: 'claimed',
          claimable: false,
        }),
        expect.objectContaining({
          id: 'draw_streak_daily',
          status: 'claimed',
          claimable: false,
        }),
        expect.objectContaining({
          id: 'profile_security',
          status: 'in_progress',
        }),
        expect.objectContaining({
          id: 'top_up_starter',
          status: 'in_progress',
        }),
      ])
    );
  });

  it('disables manual missions when reward amount is zero', () => {
    const now = atLocalNoon(2026, 4, 27);
    const center = evaluateRewardCenter(
      {
        bonusBalance: '0.00',
        emailVerifiedAt: atLocalNoon(2026, 4, 20),
        phoneVerifiedAt: atLocalNoon(2026, 4, 21),
        drawCountAll: 9,
        drawCountToday: 3,
        depositCount: 2,
        dailyClaims: [],
        missionClaims: [],
        dailyEnabled: true,
        dailyAmount: '2.00',
        profileSecurityRewardAmount: '0.00',
        firstDrawRewardAmount: '0.00',
        drawStreakDailyRewardAmount: '0.00',
        topUpStarterRewardAmount: '0.00',
      },
      now
    );

    expect(center.summary.availableMissionCount).toBe(0);
    expect(center.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'profile_security', status: 'disabled' }),
        expect.objectContaining({ id: 'first_draw', status: 'disabled' }),
        expect.objectContaining({ id: 'draw_streak_daily', status: 'disabled' }),
        expect.objectContaining({ id: 'top_up_starter', status: 'disabled' }),
      ])
    );
  });
});
