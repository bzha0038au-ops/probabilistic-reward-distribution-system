import { logger } from './logger';
import { getRedis } from './redis';

type JsonCacheParser<T> = (value: unknown) => T | null;

type JsonCacheWriteEntry<T> = {
  key: string;
  value: T;
  ttlSeconds: number;
};

const resolveStrictTtlSeconds = (value: number) => {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
};

const parseCachedJson = <T>(
  key: string,
  rawValue: string,
  parse: JsonCacheParser<T>
) => {
  try {
    return parse(JSON.parse(rawValue) as unknown);
  } catch (error) {
    logger.warning('cache json parse failed', { key, err: error });
    return null;
  }
};

const deleteInvalidCacheKeys = async (keys: string[]) => {
  if (keys.length === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    await redis.del(...keys);
  } catch (error) {
    logger.warning('cache delete failed', { keys, err: error });
  }
};

export const readJsonCache = async <T>(
  key: string,
  parse: JsonCacheParser<T>
): Promise<T | null> => {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  try {
    const rawValue = await redis.get(key);
    if (!rawValue) {
      return null;
    }

    const parsed = parseCachedJson(key, rawValue, parse);
    if (parsed !== null) {
      return parsed;
    }
  } catch (error) {
    logger.warning('cache read failed', { key, err: error });
    return null;
  }

  await deleteInvalidCacheKeys([key]);
  return null;
};

export const readJsonCacheMany = async <T>(
  keys: string[],
  parse: JsonCacheParser<T>
): Promise<Map<string, T>> => {
  if (keys.length === 0) {
    return new Map();
  }

  const redis = getRedis();
  if (!redis) {
    return new Map();
  }

  try {
    const values = await redis.mget(keys);
    const output = new Map<string, T>();
    const invalidKeys: string[] = [];

    values.forEach((rawValue, index) => {
      const key = keys[index];
      if (!key || !rawValue) {
        return;
      }

      const parsed = parseCachedJson(key, rawValue, parse);
      if (parsed !== null) {
        output.set(key, parsed);
        return;
      }

      invalidKeys.push(key);
    });

    if (invalidKeys.length > 0) {
      void deleteInvalidCacheKeys(invalidKeys);
    }

    return output;
  } catch (error) {
    logger.warning('cache multi-read failed', { keys, err: error });
    return new Map();
  }
};

export const writeJsonCache = async <T>(
  key: string,
  value: T,
  ttlSeconds: number
) => {
  const normalizedTtlSeconds = resolveStrictTtlSeconds(ttlSeconds);
  if (normalizedTtlSeconds === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), 'EX', normalizedTtlSeconds);
  } catch (error) {
    logger.warning('cache write failed', { key, err: error });
  }
};

export const writeJsonCacheMany = async <T>(entries: JsonCacheWriteEntry<T>[]) => {
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      ttlSeconds: resolveStrictTtlSeconds(entry.ttlSeconds),
    }))
    .filter((entry) => entry.ttlSeconds > 0);

  if (normalizedEntries.length === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const pipeline = redis.pipeline();
    for (const entry of normalizedEntries) {
      pipeline.set(entry.key, JSON.stringify(entry.value), 'EX', entry.ttlSeconds);
    }
    await pipeline.exec();
  } catch (error) {
    logger.warning('cache multi-write failed', {
      keys: normalizedEntries.map((entry) => entry.key),
      err: error,
    });
  }
};

export const deleteCacheKeys = async (keys: string[]) => {
  if (keys.length === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    await redis.del(...keys);
  } catch (error) {
    logger.warning('cache delete failed', { keys, err: error });
  }
};
