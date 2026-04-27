import type { AppInstance } from '../types';

import { getUserById } from '../../../modules/user/service';
import {
  listActiveAuthSessions,
  revokeAuthSession,
  revokeAuthSessions,
} from '../../../modules/session/service';
import { recordAdminAction } from '../../../modules/admin/audit';
import { sendError, sendSuccess } from '../../respond';
import {
  readSessionIdParam,
  requireCurrentAdminSession,
  requireCurrentUserSession,
  resolveUserAgent,
  toSessionUser,
} from './support';
import { withAdminAuditContext } from '../../admin-audit';

export async function registerAuthSessionRoutes(app: AppInstance) {
  app.get('/auth/user/session', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const currentUser = await getUserById(user.userId);
    if (!currentUser) {
      return sendError(reply, 404, 'User not found.');
    }

    const sessions = await listActiveAuthSessions({
      userId: user.userId,
      kind: 'user',
      currentJti: user.sessionId,
    });
    const currentSession =
      sessions.find((session) => session.current) ??
      ({
        sessionId: user.sessionId,
        kind: 'user',
        role: user.role,
        ip: null,
        userAgent: null,
        createdAt: null,
        lastSeenAt: null,
        expiresAt: null,
        current: true,
      } as const);

    return sendSuccess(reply, {
      user: toSessionUser(currentUser),
      session: currentSession,
    });
  });

  app.get('/auth/user/sessions', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const sessions = await listActiveAuthSessions({
      userId: user.userId,
      kind: 'user',
      currentJti: user.sessionId,
    });

    return sendSuccess(reply, { items: sessions });
  });

  app.delete('/auth/user/session', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    await revokeAuthSession({
      jti: user.sessionId,
      userId: user.userId,
      kind: 'user',
      reason: 'logout',
      eventType: 'user_logout',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
    });

    return sendSuccess(reply, { revoked: true, scope: 'current' });
  });

  app.delete('/auth/user/sessions/:sessionId', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const sessionId = readSessionIdParam(request.params);
    if (!sessionId) {
      return sendError(reply, 400, 'Invalid session id.');
    }

    const revoked = await revokeAuthSession({
      jti: sessionId,
      userId: user.userId,
      kind: 'user',
      reason: sessionId === user.sessionId ? 'logout' : 'session_revoked',
      eventType:
        sessionId === user.sessionId ? 'user_logout' : 'user_session_revoked',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        initiatedBy: 'self_service',
      },
    });
    if (!revoked) {
      return sendError(reply, 404, 'Session not found.');
    }

    return sendSuccess(reply, {
      revoked: true,
      scope: sessionId === user.sessionId ? 'current' : 'single',
      sessionId,
    });
  });

  app.post('/auth/user/sessions/revoke-all', async (request, reply) => {
    const user = await requireCurrentUserSession(request, reply);
    if (!user) return;

    const revoked = await revokeAuthSessions({
      userId: user.userId,
      kind: 'user',
      reason: 'logout_all',
      eventType: 'user_sessions_revoked_all',
      email: user.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        initiatedBy: 'self_service',
      },
    });

    return sendSuccess(reply, {
      revokedCount: revoked.length,
      scope: 'all',
    });
  });

  app.get('/auth/admin/session', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessions = await listActiveAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      currentJti: admin.sessionId,
    });
    const currentSession =
      sessions.find((session) => session.current) ??
      ({
        sessionId: admin.sessionId,
        kind: 'admin',
        role: 'admin',
        ip: null,
        userAgent: null,
        createdAt: null,
        lastSeenAt: null,
        expiresAt: null,
        current: true,
      } as const);

    return sendSuccess(reply, {
      admin,
      session: currentSession,
    });
  });

  app.get('/auth/admin/sessions', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessions = await listActiveAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      currentJti: admin.sessionId,
    });

    return sendSuccess(reply, { items: sessions });
  });

  app.delete('/auth/admin/session', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    await revokeAuthSession({
      jti: admin.sessionId,
      userId: admin.userId,
      kind: 'admin',
      reason: 'logout',
      eventType: 'admin_logout',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
      },
    });
    await recordAdminAction(withAdminAuditContext(request, {
      adminId: admin.adminId,
      action: 'admin_logout',
      targetType: 'admin_session',
      targetId: admin.adminId,
      metadata: { sessionId: admin.sessionId },
    }));

    return sendSuccess(reply, { revoked: true, scope: 'current' });
  });

  app.delete('/auth/admin/sessions/:sessionId', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const sessionId = readSessionIdParam(request.params);
    if (!sessionId) {
      return sendError(reply, 400, 'Invalid session id.');
    }

    const revoked = await revokeAuthSession({
      jti: sessionId,
      userId: admin.userId,
      kind: 'admin',
      reason: sessionId === admin.sessionId ? 'logout' : 'session_revoked',
      eventType:
        sessionId === admin.sessionId
          ? 'admin_logout'
          : 'admin_session_revoked',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
        initiatedBy: 'self_service',
      },
    });
    if (!revoked) {
      return sendError(reply, 404, 'Session not found.');
    }

    await recordAdminAction(withAdminAuditContext(request, {
      adminId: admin.adminId,
      action:
        sessionId === admin.sessionId
          ? 'admin_logout'
          : 'admin_session_revoked',
      targetType: 'admin_session',
      targetId: admin.adminId,
      metadata: { sessionId },
    }));

    return sendSuccess(reply, {
      revoked: true,
      scope: sessionId === admin.sessionId ? 'current' : 'single',
      sessionId,
    });
  });

  app.post('/auth/admin/sessions/revoke-all', async (request, reply) => {
    const admin = await requireCurrentAdminSession(request, reply);
    if (!admin) return;

    const revoked = await revokeAuthSessions({
      userId: admin.userId,
      kind: 'admin',
      reason: 'logout_all',
      eventType: 'admin_sessions_revoked_all',
      email: admin.email,
      ip: request.ip,
      userAgent: resolveUserAgent(request),
      metadata: {
        adminId: admin.adminId,
        initiatedBy: 'self_service',
      },
    });
    await recordAdminAction(withAdminAuditContext(request, {
      adminId: admin.adminId,
      action: 'admin_sessions_revoked_all',
      targetType: 'admin_session',
      targetId: admin.adminId,
      metadata: { revokedCount: revoked.length },
    }));

    return sendSuccess(reply, {
      revokedCount: revoked.length,
      scope: 'all',
    });
  });
}
