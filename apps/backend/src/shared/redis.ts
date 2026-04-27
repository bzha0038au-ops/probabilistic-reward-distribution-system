import Redis from 'ioredis';

import { getConfig } from './config';
import { logger } from './logger';

let cachedClient: Redis | null = null;

export const getRedis = () => {
  if (cachedClient) return cachedClient;

  const { redisUrl } = getConfig();
  if (!redisUrl) return null;

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('error', (error) => {
    logger.warning('redis error', { err: error });
  });

  cachedClient = client;
  return cachedClient;
};

export const closeRedis = async () => {
  if (!cachedClient) {
    return;
  }

  const client = cachedClient;
  cachedClient = null;

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
};
