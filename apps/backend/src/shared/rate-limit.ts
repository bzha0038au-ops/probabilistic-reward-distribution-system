import { getConfig } from './config';
import { getRedis } from './redis';

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

export const createRateLimiter = (options: {
  limit: number;
  windowMs: number;
  prefix?: string;
}) => {
  const buckets = new Map<string, Bucket>();
  const { limit, windowMs, prefix } = options;
  const redis = getRedis();
  const config = getConfig();
  const keyPrefix = prefix
    ? `${config.rateLimitRedisPrefix}:${prefix}`
    : config.rateLimitRedisPrefix;

  const consume = async (key: string): Promise<RateLimitResult> => {
    const now = Date.now();
    if (redis) {
      const redisKey = `${keyPrefix}:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pexpire(redisKey, windowMs);
      }
      const ttl = await redis.pttl(redisKey);
      const resetAt = now + Math.max(ttl, 0);

      return {
        allowed: count <= limit,
        remaining: Math.max(limit - count, 0),
        resetAt,
        limit,
      };
    }

    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      const resetAt = now + windowMs;
      buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(limit - 1, 0),
        resetAt,
        limit,
      };
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;
    buckets.set(key, existing);

    return {
      allowed: nextCount <= limit,
      remaining: Math.max(limit - nextCount, 0),
      resetAt: existing.resetAt,
      limit,
    };
  };

  return { consume };
};
