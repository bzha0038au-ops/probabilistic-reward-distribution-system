import { randomInt } from 'node:crypto';

import { getConfig } from './config';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const applyAuthFailureDelay = async () => {
  const config = getConfig();
  const base = Math.max(0, Number(config.authFailureDelayMs) || 0);
  const jitter = Math.max(0, Number(config.authFailureJitterMs) || 0);
  const extra = jitter > 0 ? randomInt(0, jitter + 1) : 0;
  const delay = base + extra;
  if (delay > 0) {
    await sleep(delay);
  }
};
