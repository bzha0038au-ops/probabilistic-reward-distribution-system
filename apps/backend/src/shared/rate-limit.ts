import { getConfig } from './config';
import { getRedis } from './redis';

type Bucket = {
  count: number;
  resetAt: number;
};

const inMemoryRateLimiterBuckets = new Set<Map<string, Bucket>>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  used: number;
  windowMs: number;
};

export type RateLimitSnapshot = {
  remaining: number;
  resetAt: number | null;
  limit: number;
  used: number;
  windowMs: number;
};

export const createRateLimiter = (options: {
  limit: number;
  windowMs: number;
  prefix?: string;
}) => {
  const buckets = new Map<string, Bucket>();
  inMemoryRateLimiterBuckets.add(buckets);
  const { limit, windowMs, prefix } = options;

  const resolveLimit = (overrideLimit?: number) => {
    const parsed = Math.floor(Number(overrideLimit ?? limit));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : limit;
  };

  const resolveRedisKey = (key: string) => {
    const { rateLimitRedisPrefix } = getConfig();
    const keyPrefix = prefix
      ? `${rateLimitRedisPrefix}:${prefix}`
      : rateLimitRedisPrefix;
    return `${keyPrefix}:${key}`;
  };

  const consume = async (
    key: string,
    overrideLimit?: number
  ): Promise<RateLimitResult> => {
    const now = Date.now();
    const resolvedLimit = resolveLimit(overrideLimit);
    const redis = getRedis();
    if (redis) {
      const redisKey = resolveRedisKey(key);
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pexpire(redisKey, windowMs);
      }
      const ttl = await redis.pttl(redisKey);
      const resetAt = now + Math.max(ttl, 0);

      return {
        allowed: count <= resolvedLimit,
        remaining: Math.max(resolvedLimit - count, 0),
        resetAt,
        limit: resolvedLimit,
        used: count,
        windowMs,
      };
    }

    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      const resetAt = now + windowMs;
      buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(resolvedLimit - 1, 0),
        resetAt,
        limit: resolvedLimit,
        used: 1,
        windowMs,
      };
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;
    buckets.set(key, existing);

    return {
      allowed: nextCount <= resolvedLimit,
      remaining: Math.max(resolvedLimit - nextCount, 0),
      resetAt: existing.resetAt,
      limit: resolvedLimit,
      used: nextCount,
      windowMs,
    };
  };

  const peek = async (
    key: string,
    overrideLimit?: number
  ): Promise<RateLimitSnapshot> => {
    const now = Date.now();
    const resolvedLimit = resolveLimit(overrideLimit);
    const redis = getRedis();

    if (redis) {
      const redisKey = resolveRedisKey(key);
      const [storedCount, ttl] = await Promise.all([
        redis.get(redisKey),
        redis.pttl(redisKey),
      ]);
      const count = Math.max(Number(storedCount ?? 0), 0);
      const resetAt = ttl > 0 ? now + ttl : null;

      return {
        remaining: Math.max(resolvedLimit - count, 0),
        resetAt,
        limit: resolvedLimit,
        used: count,
        windowMs,
      };
    }

    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      buckets.delete(key);
      return {
        remaining: resolvedLimit,
        resetAt: null,
        limit: resolvedLimit,
        used: 0,
        windowMs,
      };
    }

    return {
      remaining: Math.max(resolvedLimit - existing.count, 0),
      resetAt: existing.resetAt,
      limit: resolvedLimit,
      used: existing.count,
      windowMs,
    };
  };

  return { consume, peek };
};

export const resetInMemoryRateLimiters = () => {
  for (const buckets of inMemoryRateLimiterBuckets) {
    buckets.clear();
  }
};
