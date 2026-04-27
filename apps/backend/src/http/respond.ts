import type { FastifyReply } from "fastify";
import { normalizeApiErrorCode } from "@reward/shared-types/api";
import type {
  ApiError,
  ApiErrorCode,
  ApiFailure,
  ApiResponse,
  ApiSuccess,
} from "@reward/shared-types/api";

import { context } from "../shared/context";
import { translate } from "../shared/i18n";
import {
  reportHandledAppError,
  toAppError,
  toPublicError,
} from "../shared/errors";

export type { ApiError, ApiFailure, ApiResponse, ApiSuccess };

export const sendSuccess = <T>(reply: FastifyReply, data: T, status = 200) => {
  const payload: ApiSuccess<T> = {
    ok: true,
    data,
  };

  const requestId = context().getStore()?.requestId;
  if (requestId) payload.requestId = requestId;
  const traceId = context().getStore()?.traceId;
  if (traceId) payload.traceId = traceId;

  return reply.status(status).send(payload);
};

export const sendError = (
  reply: FastifyReply,
  status: number,
  message: string,
  details?: string[],
  code?: ApiErrorCode,
) => {
  const locale = context().getStore()?.locale;
  const localizedMessage = translate(message, locale);
  const resolvedCode =
    status >= 500 ? undefined : (code ?? normalizeApiErrorCode(message));
  const payload: ApiFailure = {
    ok: false,
    error: {
      message: localizedMessage,
      code: resolvedCode,
      details,
    },
  };

  const requestId = context().getStore()?.requestId;
  if (requestId) payload.requestId = requestId;
  const traceId = context().getStore()?.traceId;
  if (traceId) payload.traceId = traceId;

  return reply.status(status).send(payload);
};

export const sendErrorForException = (
  reply: FastifyReply,
  error: unknown,
  fallbackMessage = "Request failed.",
) => {
  const appError = toAppError(error);
  reportHandledAppError(appError, { source: "route_catch" });

  const publicError = toPublicError(appError);
  return sendError(
    reply,
    publicError.statusCode,
    publicError.statusCode >= 500 ? fallbackMessage : publicError.message,
    publicError.details,
    publicError.code,
  );
};
