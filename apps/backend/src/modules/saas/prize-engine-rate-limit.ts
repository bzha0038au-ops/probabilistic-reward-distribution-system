import type {
  PrizeEngineApiRateLimitUsage,
  PrizeEngineApiRateLimitWindow,
  PrizeEngineProjectApiRateLimitUsage,
} from "@reward/shared-types/saas";

import {
  createRateLimiter,
  type RateLimitResult,
  type RateLimitSnapshot,
} from "../../shared/rate-limit";
import {
  DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
  PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
  PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
  type ProjectApiAuth,
  resolveProjectApiRateLimit,
} from "./prize-engine-domain";

type ProjectApiRateLimitSource = Pick<
  ProjectApiAuth,
  "apiRateLimitBurst" | "apiRateLimitHourly" | "apiRateLimitDaily"
>;

const burstRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_BURST,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
  prefix: "prize-engine:burst",
});

const hourlyRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_HOURLY,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
  prefix: "prize-engine:hourly",
});

const dailyRateLimiter = createRateLimiter({
  limit: DEFAULT_PROJECT_API_RATE_LIMIT_DAILY,
  windowMs: PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
  prefix: "prize-engine:daily",
});

const toRateLimitWindow = (
  snapshot: RateLimitResult | RateLimitSnapshot,
): PrizeEngineApiRateLimitWindow => ({
  limit: snapshot.limit,
  used: snapshot.used,
  remaining: snapshot.remaining,
  resetAt: snapshot.resetAt ? new Date(snapshot.resetAt) : null,
  windowMs: snapshot.windowMs,
});

const buildUsage = (windows: {
  burst: RateLimitResult | RateLimitSnapshot;
  hourly: RateLimitResult | RateLimitSnapshot;
  daily: RateLimitResult | RateLimitSnapshot;
}): PrizeEngineApiRateLimitUsage => ({
  burst: toRateLimitWindow(windows.burst),
  hourly: toRateLimitWindow(windows.hourly),
  daily: toRateLimitWindow(windows.daily),
});

const aggregateWindows = (
  windows: PrizeEngineApiRateLimitWindow[],
  windowMs: number,
): PrizeEngineApiRateLimitWindow => {
  const limit = windows.reduce((sum, item) => sum + item.limit, 0);
  const used = windows.reduce((sum, item) => sum + item.used, 0);
  const remaining = Math.max(limit - used, 0);
  const resetAtValues = windows
    .map((item) => (item.resetAt ? new Date(item.resetAt).getTime() : null))
    .filter((value): value is number => value !== null);

  return {
    limit,
    used,
    remaining,
    resetAt:
      resetAtValues.length > 0 ? new Date(Math.max(...resetAtValues)) : null,
    windowMs,
  };
};

export const peekPrizeEngineApiRateLimitUsage = async (
  apiKeyId: number,
  source: ProjectApiRateLimitSource,
) => {
  const config = resolveProjectApiRateLimit(source);
  const key = String(apiKeyId);
  const [burst, hourly, daily] = await Promise.all([
    burstRateLimiter.peek(key, config.apiRateLimitBurst),
    hourlyRateLimiter.peek(key, config.apiRateLimitHourly),
    dailyRateLimiter.peek(key, config.apiRateLimitDaily),
  ]);

  return buildUsage({ burst, hourly, daily });
};

export const summarizePrizeEngineProjectRateLimitUsage = async (
  source: ProjectApiRateLimitSource,
  activeApiKeyIds: number[],
): Promise<PrizeEngineProjectApiRateLimitUsage> => {
  const usages = await Promise.all(
    activeApiKeyIds.map((apiKeyId) =>
      peekPrizeEngineApiRateLimitUsage(apiKeyId, source),
    ),
  );

  return {
    activeKeyCount: activeApiKeyIds.length,
    aggregate: {
      burst: aggregateWindows(
        usages.map((usage) => usage.burst),
        PRIZE_ENGINE_API_RATE_LIMIT_BURST_WINDOW_MS,
      ),
      hourly: aggregateWindows(
        usages.map((usage) => usage.hourly),
        PRIZE_ENGINE_API_RATE_LIMIT_HOURLY_WINDOW_MS,
      ),
      daily: aggregateWindows(
        usages.map((usage) => usage.daily),
        PRIZE_ENGINE_API_RATE_LIMIT_DAILY_WINDOW_MS,
      ),
    },
  };
};

export const consumePrizeEngineApiRateLimit = async (
  apiKeyId: number,
  source: ProjectApiRateLimitSource,
) => {
  const config = resolveProjectApiRateLimit(source);
  const key = String(apiKeyId);
  const [burst, hourly, daily] = await Promise.all([
    burstRateLimiter.consume(key, config.apiRateLimitBurst),
    hourlyRateLimiter.consume(key, config.apiRateLimitHourly),
    dailyRateLimiter.consume(key, config.apiRateLimitDaily),
  ]);

  const blockedWindows = (
    [
      ["burst", burst],
      ["hourly", hourly],
      ["daily", daily],
    ] as const
  )
    .filter(([, result]) => !result.allowed)
    .map(([window]) => window);

  const blockedResetAt = [burst, hourly, daily]
    .filter((result) => !result.allowed)
    .map((result) => result.resetAt);

  const retryAfterSeconds =
    blockedResetAt.length > 0
      ? Math.max(
          Math.ceil((Math.max(...blockedResetAt) - Date.now()) / 1000),
          1,
        )
      : 0;

  return {
    allowed: blockedWindows.length === 0,
    usage: buildUsage({ burst, hourly, daily }),
    blockedWindows,
    retryAfterSeconds,
  };
};
