import { and, eq, gt, isNull } from '@reward/database/orm';

import { prizes } from '@reward/database';
import { db } from '../../db';
import { getConfig } from '../../shared/config';
import { getRedis } from '../../shared/redis';
import { logger } from '../../shared/logger';
import type { PrizeCandidate } from './types';

const CACHE_KEY = 'reward:draw:probability_pool:v1';

type MemoryCache = {
  expiresAt: number;
  items: PrizeCandidate[];
};

let memoryCache: MemoryCache | null = null;

const loadProbabilityPoolFromDb = async () =>
  db
    .select({
      id: prizes.id,
      weight: prizes.weight,
      rewardAmount: prizes.rewardAmount,
      poolThreshold: prizes.poolThreshold,
      userPoolThreshold: prizes.userPoolThreshold,
    })
    .from(prizes)
    .where(
      and(eq(prizes.isActive, true), isNull(prizes.deletedAt), gt(prizes.weight, 0))
    );

export const getProbabilityPool = async () => {
  const { drawPoolCacheTtlSeconds } = getConfig();
  const ttlSeconds = Math.max(0, Number(drawPoolCacheTtlSeconds ?? 0));
  if (ttlSeconds === 0) {
    // 禁用缓存时直接从数据库取概率池
    return loadProbabilityPoolFromDb();
  }

  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.items;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const items = JSON.parse(cached) as PrizeCandidate[];
        memoryCache = { items, expiresAt: now + ttlSeconds * 1000 };
        return items;
      }
    } catch (error) {
      logger.warning('probability pool cache read failed', { err: error });
    }
  }

  const items = await loadProbabilityPoolFromDb();
  memoryCache = { items, expiresAt: now + ttlSeconds * 1000 };
  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(items), 'EX', ttlSeconds);
    } catch (error) {
      logger.warning('probability pool cache write failed', { err: error });
    }
  }
  return items;
};

export const invalidateProbabilityPool = async () => {
  // 后台更新奖品时调用，确保概率池缓存失效
  memoryCache = null;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CACHE_KEY);
  } catch (error) {
    logger.warning('probability pool cache invalidate failed', { err: error });
  }
};
