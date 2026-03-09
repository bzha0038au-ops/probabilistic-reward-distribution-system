import { jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

const encoder = new TextEncoder();

export const ADMIN_SESSION_COOKIE = 'reward_admin_session';
export const ADMIN_SESSION_TTL_SECONDS =
  Number(env.ADMIN_SESSION_TTL ?? '') || 60 * 60 * 8;

export type AdminSessionPayload = {
  userId: number;
  email: string;
  role: 'admin';
};

const getSessionSecret = () => {
  const secret = env.ADMIN_JWT_SECRET || env.AUTH_SECRET || '';
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }

  return encoder.encode(secret);
};

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
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
