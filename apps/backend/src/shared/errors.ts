import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "http";
import {
  normalizeApiErrorCode,
  type ApiErrorCode,
} from "@reward/shared-types/api";

import { logger } from "./logger";
import { context } from "./context";
import { translate } from "./i18n";
import { captureException, shutdownObservability } from "./telemetry";

export class AppError extends Error {
  constructor(
    public name: string,
    public message: string,
    public statusCode: number = 500,
    public isCatastrophic = false,
    public cause?: unknown,
    public code?: ApiErrorCode,
    public details?: string[],
  ) {
    super(message);
    this.name = name;
  }
}

type DomainErrorOptions = {
  name?: string;
  cause?: unknown;
  code?: ApiErrorCode;
  details?: string[];
};

export const normalizeErrorCode = normalizeApiErrorCode;

export class DomainError extends AppError {
  constructor(
    message: string,
    statusCode = 422,
    options: DomainErrorOptions = {},
  ) {
    super(
      options.name ?? "DomainError",
      message,
      statusCode,
      false,
      options.cause,
      options.code ?? normalizeErrorCode(message),
      options.details,
    );
  }
}

class InternalError extends AppError {
  constructor(name: string, message: string, options: DomainErrorOptions = {}) {
    super(
      name,
      message,
      500,
      true,
      options.cause,
      options.code ?? normalizeErrorCode(message),
      options.details,
    );
  }
}

export class InternalInvariantError extends InternalError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(options.name ?? "InternalInvariantError", message, options);
  }
}

export class PersistenceError extends InternalError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(options.name ?? "PersistenceError", message, options);
  }
}

export const domainError = (
  statusCode: number,
  message: string,
  options?: DomainErrorOptions,
) => new DomainError(message, statusCode, options);

export const badRequestError = (
  message: string,
  options?: DomainErrorOptions,
) => domainError(400, message, options);

export const unauthorizedError = (
  message: string,
  options?: DomainErrorOptions,
) => domainError(401, message, options);

export const forbiddenError = (message: string, options?: DomainErrorOptions) =>
  domainError(403, message, options);

export const notFoundError = (message: string, options?: DomainErrorOptions) =>
  domainError(404, message, options);

export const conflictError = (message: string, options?: DomainErrorOptions) =>
  domainError(409, message, options);

export const unprocessableEntityError = (
  message: string,
  options?: DomainErrorOptions,
) => domainError(422, message, options);

export const serviceUnavailableError = (
  message: string,
  options?: DomainErrorOptions,
) => domainError(503, message, options);

export const internalInvariantError = (
  message: string,
  options?: DomainErrorOptions,
) => new InternalInvariantError(message, options);

export const persistenceError = (
  message: string,
  options?: DomainErrorOptions,
) => new PersistenceError(message, options);

const getFromObject = <T>(
  target: Record<string, unknown>,
  keys: string[],
  fallback: T,
): T => {
  for (const key of keys) {
    if (key in target) {
      return target[key] as T;
    }
  }
  return fallback;
};

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

export const toAppError = (error: unknown) => {
  if (error instanceof AppError) return error;

  const enriched = ensureObject(error);
  const message = getFromObject(
    enriched,
    ["message", "reason", "description"],
    "Unknown error",
  );
  const name = getFromObject(enriched, ["name", "code"], "unknown-error");
  const statusCode = getFromObject(
    enriched,
    ["statusCode", "status", "HTTPStatus"],
    500,
  );
  const isCatastrophic = getFromObject(
    enriched,
    ["isCatastrophic", "catastrophic"],
    statusCode >= 500,
  );
  const stack = getFromObject(enriched, ["stack"], undefined) as
    | string
    | undefined;
  const code = getFromObject(enriched, ["code"], undefined) as
    | string
    | undefined;
  const details = getFromObject(enriched, ["details"], undefined) as
    | string[]
    | undefined;

  const appError = new AppError(
    name,
    message,
    statusCode,
    isCatastrophic,
    error,
    code,
    details,
  );
  appError.stack = stack;

  return Object.assign(appError, enriched);
};

export const toPublicError = (error: AppError) => {
  const isInternal = error.statusCode >= 500;
  return {
    statusCode: error.statusCode,
    message: isInternal ? "Internal server error" : error.message,
    code: isInternal ? undefined : error.code,
    details: isInternal ? undefined : error.details,
  };
};

export const shouldCaptureAppError = (error: AppError) =>
  error.isCatastrophic || error.statusCode >= 500;

export const reportHandledAppError = (
  error: AppError,
  extra: Record<string, unknown> = {},
) => {
  const requestId = context().getStore()?.requestId;
  const traceId = context().getStore()?.traceId;
  const logContext = {
    name: error.name,
    statusCode: error.statusCode,
    code: error.code,
    requestId,
    traceId,
    ...extra,
  };

  if (shouldCaptureAppError(error)) {
    logger.error(error.message, logContext);
    captureException(error, {
      tags: {
        handled: true,
        status_code: error.statusCode,
      },
      extra: {
        requestId,
        traceId,
        ...extra,
      },
    });
    return;
  }

  logger.warning(error.message, logContext);
};

const formatErrorResponse = (error: AppError) => {
  const requestId = context().getStore()?.requestId;
  const publicError = toPublicError(error);
  const localizedMessage = translate(
    publicError.message,
    context().getStore()?.locale,
  );
  return {
    ok: false,
    error: {
      message: localizedMessage,
      code: publicError.code,
      details: publicError.details,
    },
    requestId,
    traceId: context().getStore()?.traceId,
  };
};

export const fastifyErrorHandler = (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
) => {
  const appError = toAppError(error);
  reportHandledAppError(appError);

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
  process.on("uncaughtException", async (error) => {
    const appError = toAppError(error);
    logger.error("Uncaught exception", {
      name: appError.name,
      message: appError.message,
    });
    captureException(appError, {
      tags: { lifecycle: "uncaught_exception" },
    });
    await terminateServer(server);
  });

  process.on("unhandledRejection", async (reason) => {
    const appError = toAppError(reason);
    logger.error("Unhandled rejection", {
      name: appError.name,
      message: appError.message,
    });
    captureException(appError, {
      tags: { lifecycle: "unhandled_rejection" },
    });
    await terminateServer(server);
  });

  process.on("SIGTERM", async () => {
    logger.error("Received SIGTERM, shutting down");
    await terminateServer(server);
  });

  process.on("SIGINT", async () => {
    logger.error("Received SIGINT, shutting down");
    await terminateServer(server);
  });
};
