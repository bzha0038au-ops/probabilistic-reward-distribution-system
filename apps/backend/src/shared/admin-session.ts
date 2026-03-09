import { SignJWT, jwtVerify } from 'jose';

import { getSessionSecret } from './session-secret';

export const ADMIN_SESSION_COOKIE = 'reward_admin_session';
export const ADMIN_SESSION_TTL_SECONDS =
  Number(process.env.ADMIN_SESSION_TTL ?? '') || 60 * 60 * 8;

export type AdminSessionPayload = {
  userId: number;
  email: string;
  role: 'admin';
};

export async function createAdminSessionToken(payload: AdminSessionPayload) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ADMIN_SESSION_TTL_SECONDS;

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getSessionSecret('admin'));

  return { token, expiresAt };
}

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret('admin'));
    if (payload.role !== 'admin') return null;

    const userId = Number(payload.userId ?? payload.sub ?? 0);
    if (!userId) return null;

    return {
      userId,
      email: String(payload.email ?? ''),
      role: 'admin' as const,
    } satisfies AdminSessionPayload;
  } catch {
    return null;
  }
}
