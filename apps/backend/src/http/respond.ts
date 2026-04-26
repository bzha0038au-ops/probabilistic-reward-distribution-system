import type { FastifyReply } from 'fastify';
import type { ApiError, ApiFailure, ApiResponse, ApiSuccess } from '@reward/shared-types';

import { context } from '../shared/context';
import { translate } from '../shared/i18n';

export type { ApiError, ApiFailure, ApiResponse, ApiSuccess };

export const sendSuccess = <T>(
  reply: FastifyReply,
  data: T,
  status = 200
) => {
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
  code?: string
) => {
  const locale = context().getStore()?.locale;
  const localizedMessage = translate(message, locale);
  const payload: ApiFailure = {
    ok: false,
    error: {
      message: localizedMessage,
      code,
      details,
    },
  };

  const requestId = context().getStore()?.requestId;
  if (requestId) payload.requestId = requestId;
  const traceId = context().getStore()?.traceId;
  if (traceId) payload.traceId = traceId;

  return reply.status(status).send(payload);
};
