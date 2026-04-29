import { env } from '$env/dynamic/private';
import { verifyAdminSessionTokenWithEnv } from './admin-session-core';

export type { AdminSessionPayload } from './admin-session-core';

export const ADMIN_SESSION_COOKIE = 'reward_admin_session';
export const ADMIN_CSRF_COOKIE = 'reward_csrf';
export const ADMIN_SESSION_TTL_SECONDS =
  Number(env.ADMIN_SESSION_TTL ?? '') || 60 * 60 * 2;

export type AdminMfaRecoveryMode = 'none' | 'recovery_code' | 'break_glass';

export async function verifyAdminSessionToken(token?: string | null) {
  return await verifyAdminSessionTokenWithEnv(token, env);
}
