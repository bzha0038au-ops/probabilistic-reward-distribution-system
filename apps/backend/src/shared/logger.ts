import pino, { type Logger as PinoLogger } from 'pino';

import { getConfig } from './config';
import { context } from './context';
import { getRuntimeMetadata } from './runtime-metadata';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  debug(message: string, metadata?: Record<string, unknown>): void;
  warning(message: string, metadata?: Record<string, unknown>): void;
}

let baseLogger: PinoLogger | null = null;

const buildLogger = () =>
  pino({
    level: getConfig().logLevel,
    base: getRuntimeMetadata(),
    mixin() {
      const store = context().getStore();
      return store ? { ...store } : {};
    },
  });

export const getPinoLogger = () => {
  if (!baseLogger) {
    baseLogger = buildLogger();
  }

  return baseLogger;
};

export const resetLogger = () => {
  baseLogger = null;
};

const logWithMetadata = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, unknown>
) => {
  const logger = getPinoLogger();
  if (metadata) {
    logger[level](metadata, message);
  } else {
    logger[level](message);
  }
};

export const logger: Logger = {
  debug(message, metadata) {
    logWithMetadata('debug', message, metadata);
  },
  info(message, metadata) {
    logWithMetadata('info', message, metadata);
  },
  warning(message, metadata) {
    logWithMetadata('warn', message, metadata);
  },
  error(message, metadata) {
    logWithMetadata('error', message, metadata);
  },
};
