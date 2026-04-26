import { jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

const encoder = new TextEncoder();

export const ADMIN_SESSION_COOKIE = 'reward_admin_session';
export const ADMIN_CSRF_COOKIE = 'reward_csrf';
export const ADMIN_SESSION_TTL_SECONDS =
  Number(env.ADMIN_SESSION_TTL ?? '') || 60 * 60 * 2;

export type AdminMfaRecoveryMode = 'none' | 'recovery_code' | 'break_glass';

export type AdminSessionPayload = {
  adminId: number;
  userId: number;
  email: string;
  role: 'admin';
  mfaEnabled: boolean;
  mfaRecoveryMode: AdminMfaRecoveryMode;
  sessionId: string;
};

const getSessionSecret = () => {
  const secret = env.ADMIN_JWT_SECRET || '';
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not set');
  }

  return encoder.encode(secret);
};

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    if (payload.role !== 'admin') return null;

    const adminId = Number(payload.adminId ?? 0);
    const userId = Number(payload.userId ?? payload.sub ?? 0);
    const sessionId = typeof payload.jti === 'string' ? payload.jti : '';
    if (!adminId || !userId || !sessionId) return null;

    return {
      adminId,
      userId,
      email: String(payload.email ?? ''),
      role: 'admin' as const,
      mfaEnabled: Boolean(payload.mfaEnabled),
      mfaRecoveryMode:
        payload.mfaRecoveryMode === 'recovery_code' ||
        payload.mfaRecoveryMode === 'break_glass'
          ? payload.mfaRecoveryMode
          : 'none',
      sessionId,
    } satisfies AdminSessionPayload;
  } catch {
    return null;
  }
}
