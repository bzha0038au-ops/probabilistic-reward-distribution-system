import { SignJWT, jwtVerify } from 'jose';

import {
  createAuthSession,
  type AuthSessionRole,
  validateAuthSession,
} from '../modules/session/service';
import { getSessionSecret } from './session-secret';

export const USER_SESSION_COOKIE = 'reward_user_session';
export const USER_SESSION_TTL_SECONDS =
  Number(process.env.USER_SESSION_TTL ?? '') || 60 * 60 * 8;

export type UserSessionPayload = {
  userId: number;
  email: string;
  role: AuthSessionRole;
  sessionId: string;
};

export async function createUserSessionToken(
  payload: Omit<UserSessionPayload, 'sessionId'>,
  options: {
    ip?: string | null;
    userAgent?: string | null;
  } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + USER_SESSION_TTL_SECONDS;
  const session = await createAuthSession({
    userId: payload.userId,
    kind: 'user',
    role: payload.role,
    ttlSeconds: USER_SESSION_TTL_SECONDS,
    ip: options.ip,
    userAgent: options.userAgent,
  });

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setJti(session.jti)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret('user'));

  return { token, expiresAt, sessionId: session.jti };
}

export async function verifyUserSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret('user'));
    const userId = Number(payload.userId ?? payload.sub ?? 0);
    const sessionId = typeof payload.jti === 'string' ? payload.jti : '';
    if (!userId || !sessionId) return null;

    const session = await validateAuthSession({
      jti: sessionId,
      userId,
      kind: 'user',
    });
    if (!session) return null;

    return {
      userId,
      email: String(payload.email ?? ''),
      role: (payload.role as AuthSessionRole) ?? 'user',
      sessionId: session.jti,
    } satisfies UserSessionPayload;
  } catch {
    return null;
  }
}
