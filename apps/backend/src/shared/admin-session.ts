import { SignJWT, jwtVerify } from 'jose';

import {
  createAuthSession,
  validateAuthSession,
} from '../modules/session/service';
import { getSessionSecret } from './session-secret';

export const ADMIN_SESSION_COOKIE = 'reward_admin_session';
export const ADMIN_SESSION_TTL_SECONDS =
  Number(process.env.ADMIN_SESSION_TTL ?? '') || 60 * 60 * 2;

export type AdminSessionPayload = {
  adminId: number;
  userId: number;
  email: string;
  role: 'admin';
  mfaEnabled: boolean;
  sessionId: string;
};

export type AuthenticatedAdmin = AdminSessionPayload & {
  permissions: string[];
  requiresMfa: boolean;
};

export async function createAdminSessionToken(
  payload: Omit<AdminSessionPayload, 'sessionId'>,
  options: {
    ip?: string | null;
    userAgent?: string | null;
  } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ADMIN_SESSION_TTL_SECONDS;
  const session = await createAuthSession({
    userId: payload.userId,
    kind: 'admin',
    role: 'admin',
    ttlSeconds: ADMIN_SESSION_TTL_SECONDS,
    ip: options.ip,
    userAgent: options.userAgent,
  });

  const token = await new SignJWT({
    adminId: payload.adminId,
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    mfaEnabled: payload.mfaEnabled,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setJti(session.jti)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret('admin'));

  return { token, expiresAt, sessionId: session.jti };
}

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret('admin'));
    if (payload.role !== 'admin') return null;

    const adminId = Number(payload.adminId ?? 0);
    const userId = Number(payload.userId ?? payload.sub ?? 0);
    const sessionId = typeof payload.jti === 'string' ? payload.jti : '';
    if (!adminId || !userId || !sessionId) return null;

    const session = await validateAuthSession({
      jti: sessionId,
      userId,
      kind: 'admin',
    });
    if (!session) return null;

    return {
      adminId,
      userId,
      email: String(payload.email ?? ''),
      role: 'admin' as const,
      mfaEnabled: Boolean(payload.mfaEnabled),
      sessionId: session.jti,
    } satisfies AdminSessionPayload;
  } catch {
    return null;
  }
}
