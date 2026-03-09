import { SignJWT, jwtVerify } from 'jose';

import { getSessionSecret } from './session-secret';

export const USER_SESSION_COOKIE = 'reward_user_session';
export const USER_SESSION_TTL_SECONDS =
  Number(process.env.USER_SESSION_TTL ?? '') || 60 * 60 * 8;

export type UserSessionPayload = {
  userId: number;
  email: string;
  role: 'user' | 'admin';
};

export async function createUserSessionToken(payload: UserSessionPayload) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + USER_SESSION_TTL_SECONDS;

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret());

  return { token, expiresAt };
}

export async function verifyUserSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const userId = Number(payload.userId ?? payload.sub ?? 0);
    if (!userId) return null;

    return {
      userId,
      email: String(payload.email ?? ''),
      role: (payload.role as 'user' | 'admin') ?? 'user',
    } satisfies UserSessionPayload;
  } catch {
    return null;
  }
}
