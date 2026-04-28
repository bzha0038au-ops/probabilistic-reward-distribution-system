import type { FastifyReply, FastifyRequest } from 'fastify';

import { API_ERROR_CODES } from '@reward/shared-types/api';

import { db } from '../db';
import { sendError } from '../http/respond';
import { isUserFrozen } from '../modules/risk/service';
import { getSystemFlags } from '../modules/system/service';
import { bindActorObservability } from '../shared/telemetry';
import {
  USER_SESSION_COOKIE,
  verifyUserRealtimeToken,
  verifyUserSessionToken,
} from '../shared/user-session';
import { bindRealtimeActorContext } from './service';

const readQueryToken = (request: FastifyRequest) => {
  const query =
    typeof request.query === 'object' && request.query !== null
      ? (request.query as Record<string, unknown>)
      : null;
  const value = query?.token;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
};

const readRealtimeAuthToken = (request: FastifyRequest) => {
  const header = request.headers.authorization;
  const bearer =
    header && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : null;

  return bearer ?? request.cookies[USER_SESSION_COOKIE] ?? readQueryToken(request);
};

export const requireRealtimeUserGuard = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const token = readRealtimeAuthToken(request);
  const user =
    (await verifyUserRealtimeToken(token)) ??
    (await verifyUserSessionToken(token));
  if (!user) {
    return sendError(
      reply,
      401,
      'Unauthorized',
      undefined,
      API_ERROR_CODES.UNAUTHORIZED
    );
  }

  const systemFlags = await getSystemFlags(db);
  if (systemFlags.maintenanceMode) {
    return sendError(reply, 503, 'System under maintenance.');
  }

  const frozen = await isUserFrozen(user.userId, { scope: 'account_lock' });
  if (frozen) {
    return sendError(
      reply,
      423,
      'Account locked.',
      undefined,
      API_ERROR_CODES.ACCOUNT_LOCKED
    );
  }

  request.user = user;
  bindRealtimeActorContext({ userId: user.userId, role: user.role });
  bindActorObservability({ userId: user.userId, role: user.role });
};
