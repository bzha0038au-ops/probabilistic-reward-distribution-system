import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { Server } from 'http';

import { logger } from './logger';
import { context } from './context';
import { translate } from './i18n';
import { captureException, shutdownObservability } from './telemetry';

export class AppError extends Error {
  constructor(
    public name: string,
    public message: string,
    public statusCode: number = 500,
    public isCatastrophic = false,
    public cause?: unknown
  ) {
    super(message);
  }
}

const getFromObject = <T>(
  target: Record<string, unknown>,
  keys: string[],
  fallback: T
): T => {
  for (const key of keys) {
    if (key in target) {
      return target[key] as T;
    }
  }
  return fallback;
};

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

export const toAppError = (error: unknown) => {
  if (error instanceof AppError) return error;

  const enriched = ensureObject(error);
  const message = getFromObject(enriched, ['message', 'reason', 'description'], 'Unknown error');
  const name = getFromObject(enriched, ['name', 'code'], 'unknown-error');
  const statusCode = getFromObject(enriched, ['statusCode', 'status', 'HTTPStatus'], 500);
  const isCatastrophic = getFromObject(enriched, ['isCatastrophic', 'catastrophic'], true);
  const stack = getFromObject(enriched, ['stack'], undefined) as string | undefined;

  const appError = new AppError(name, message, statusCode, isCatastrophic, error);
  appError.stack = stack;

  return Object.assign(appError, enriched);
};

const formatErrorResponse = (error: AppError) => {
  const requestId = context().getStore()?.requestId;
  const message = error.statusCode >= 500 ? 'Internal server error' : error.message;
  const localizedMessage = translate(message, context().getStore()?.locale);
  return {
    ok: false,
    error: {
      message: localizedMessage,
    },
    requestId,
    traceId: context().getStore()?.traceId,
  };
};

export const fastifyErrorHandler = (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  const appError = toAppError(error);
  appError.isCatastrophic = false;

  logger.error(appError.message, {
    name: appError.name,
    statusCode: appError.statusCode,
    requestId: context().getStore()?.requestId,
    traceId: context().getStore()?.traceId,
  });
  captureException(appError, {
    tags: {
      handled: true,
      status_code: appError.statusCode,
    },
    extra: {
      requestId: context().getStore()?.requestId,
      traceId: context().getStore()?.traceId,
    },
  });

  reply.status(appError.statusCode ?? 500).send(formatErrorResponse(appError));
};

const terminateServer = async (server?: Server) => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await shutdownObservability();
  process.exit(1);
};

export const installProcessHandlers = (server?: Server) => {
  process.on('uncaughtException', async (error) => {
    const appError = toAppError(error);
    logger.error('Uncaught exception', {
      name: appError.name,
      message: appError.message,
    });
    captureException(appError, {
      tags: { lifecycle: 'uncaught_exception' },
    });
    await terminateServer(server);
  });

  process.on('unhandledRejection', async (reason) => {
    const appError = toAppError(reason);
    logger.error('Unhandled rejection', {
      name: appError.name,
      message: appError.message,
    });
    captureException(appError, {
      tags: { lifecycle: 'unhandled_rejection' },
    });
    await terminateServer(server);
  });

  process.on('SIGTERM', async () => {
    logger.error('Received SIGTERM, shutting down');
    await terminateServer(server);
  });

  process.on('SIGINT', async () => {
    logger.error('Received SIGINT, shutting down');
    await terminateServer(server);
  });
};
