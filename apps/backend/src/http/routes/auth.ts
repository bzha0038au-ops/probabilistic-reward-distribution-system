import type { FastifyInstance } from 'fastify';

import { createUserWithWallet, getUserByEmail } from '../../modules/user/service';
import { verifyCredentials, verifyAdminCredentials } from '../../modules/auth/service';
import { createAdminSessionToken } from '../../shared/admin-session';
import { createUserSessionToken } from '../../shared/user-session';
import { sendError, sendSuccess } from '../respond';
import { validateAuth } from '../validators';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) =>
    sendSuccess(reply, { status: 'ok' })
  );

  app.post('/auth/register', async (request, reply) => {
    const payload = request.body as { email?: string; password?: string };
    const validation = validateAuth(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const email = String(payload?.email ?? '').toLowerCase();
    const password = String(payload?.password ?? '');

    const existing = await getUserByEmail(email);
    if (existing) {
      return sendError(reply, 409, 'User already exists.');
    }

    const user = await createUserWithWallet(email, password);
    return sendSuccess(reply, { id: user.id, email: user.email }, 201);
  });

  app.post('/auth/user/session', async (request, reply) => {
    const payload = request.body as { email?: string; password?: string };
    const validation = validateAuth(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const email = String(payload?.email ?? '').toLowerCase();
    const password = String(payload?.password ?? '');

    const user = await verifyCredentials(email, password);
    if (!user) {
      return sendError(reply, 401, 'Invalid credentials.');
    }

    const { token, expiresAt } = await createUserSessionToken({
      userId: Number(user.id),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'user',
    });

    return sendSuccess(reply, {
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role === 'admin' ? 'admin' : 'user',
      },
    });
  });

  app.post('/auth/admin/login', async (request, reply) => {
    const payload = request.body as { email?: string; password?: string };
    const validation = validateAuth(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const email = String(payload?.email ?? '').toLowerCase();
    const password = String(payload?.password ?? '');

    const adminResult = await verifyAdminCredentials(email, password);
    if (!adminResult) {
      return sendError(reply, 401, 'Invalid admin credentials.');
    }

    const { user } = adminResult;

    const { token, expiresAt } = await createAdminSessionToken({
      userId: Number(user.id),
      email: user.email,
      role: 'admin',
    });

    return sendSuccess(reply, {
      token,
      expiresAt,
      user: { id: user.id, email: user.email },
    });
  });
}
