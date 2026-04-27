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

const resolveAdminJwtSecret = () => {
  const secret = env.ADMIN_JWT_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not set');
  }

  return secret;
};

const getSessionVerificationSecrets = () => {
  const currentSecret = resolveAdminJwtSecret();
  const previousSecret = env.ADMIN_JWT_SECRET_PREVIOUS?.trim() ?? '';
  const secrets = [currentSecret];

  if (previousSecret && previousSecret !== currentSecret) {
    secrets.push(previousSecret);
  }

  return secrets.map((secret) => encoder.encode(secret));
};

const verifySessionJwt = async (token: string) => {
  let lastError: unknown;

  for (const secret of getSessionVerificationSecrets()) {
    try {
      return await jwtVerify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to verify admin session token');
};

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await verifySessionJwt(token);
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
