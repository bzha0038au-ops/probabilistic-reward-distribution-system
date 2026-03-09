import type { FastifyReply, FastifyRequest } from 'fastify';

import { context } from '../shared/context';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../shared/admin-session';
import { USER_SESSION_COOKIE, verifyUserSessionToken } from '../shared/user-session';
import { sendError } from './respond';
import { isUserFrozen } from '../modules/risk/service';
import { getSystemFlags } from '../modules/system/service';
import { db } from '../db';

const setActorContext = (payload: { userId: number; role: 'user' | 'admin' }) => {
  const store = context().getStore();
  if (!store) return;
  store.userId = payload.userId;
  store.role = payload.role;
};

export const requireUser = async (request: FastifyRequest) => {
  const header = request.headers.authorization;
  const bearer =
    header && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const token = bearer ?? request.cookies[USER_SESSION_COOKIE];
  const user = await verifyUserSessionToken(token);
  if (user) {
    setActorContext({ userId: user.userId, role: user.role });
  }
  return user;
};

export const requireAdmin = async (request: FastifyRequest) => {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const admin = await verifyAdminSessionToken(token);
  if (admin) {
    setActorContext({ userId: admin.userId, role: 'admin' });
  }
  return admin;
};

export const requireUserGuard = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = await requireUser(request);
  if (!user) {
    return sendError(reply, 401, 'Unauthorized');
  }
  const systemFlags = await getSystemFlags(db);
  if (systemFlags.maintenanceMode) {
    return sendError(reply, 503, 'System under maintenance.');
  }
  const frozen = await isUserFrozen(user.userId);
  if (frozen) {
    return sendError(reply, 423, 'Account locked.');
  }
  request.user = user;
};

export const requireAdminGuard = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const admin = await requireAdmin(request);
  if (!admin) {
    return sendError(reply, 401, 'Unauthorized');
  }
  const frozen = await isUserFrozen(admin.userId);
  if (frozen) {
    return sendError(reply, 423, 'Account locked.');
  }
  request.admin = admin;
};
