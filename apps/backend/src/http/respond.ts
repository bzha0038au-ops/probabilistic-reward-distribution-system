import type { FastifyReply } from 'fastify';

import { context } from '../shared/context';
import { translate } from '../shared/i18n';

export type ApiError = {
  message: string;
  code?: string;
  details?: string[];
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

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

  return reply.status(status).send(payload);
};
