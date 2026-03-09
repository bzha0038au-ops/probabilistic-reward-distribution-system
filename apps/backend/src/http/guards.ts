import type { FastifyRequest } from 'fastify';

import { context } from '../shared/context';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../shared/admin-session';
import { USER_SESSION_COOKIE, verifyUserSessionToken } from '../shared/user-session';

const setActorContext = (payload: { userId: number; role: 'user' | 'admin' }) => {
  const store = context().getStore();
  if (!store) return;
  store.userId = payload.userId;
  store.role = payload.role;
};

export const requireUser = async (request: FastifyRequest) => {
  const token = request.cookies[USER_SESSION_COOKIE];
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
