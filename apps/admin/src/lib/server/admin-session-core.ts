import { jwtVerify } from 'jose';

const encoder = new TextEncoder();

type AdminSessionEnv = {
  ADMIN_JWT_SECRET?: string;
  ADMIN_JWT_SECRET_PREVIOUS?: string;
};

export type AdminSessionPayload = {
  adminId: number;
  userId: number;
  email: string;
  role: 'admin';
  mfaEnabled: boolean;
  mfaRecoveryMode: 'none' | 'recovery_code' | 'break_glass';
  sessionId: string;
  permissions: string[];
  requiresMfa: boolean;
  managedScopes?: string[];
};

const resolveAdminJwtSecret = (env: AdminSessionEnv) => {
  const secret = env.ADMIN_JWT_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not set');
  }

  return secret;
};

const getSessionVerificationSecrets = (env: AdminSessionEnv) => {
  const currentSecret = resolveAdminJwtSecret(env);
  const previousSecret = env.ADMIN_JWT_SECRET_PREVIOUS?.trim() ?? '';
  const secrets = [currentSecret];

  if (previousSecret && previousSecret !== currentSecret) {
    secrets.push(previousSecret);
  }

  return secrets.map((secret) => encoder.encode(secret));
};

const verifySessionJwt = async (token: string, env: AdminSessionEnv) => {
  let lastError: unknown;

  for (const secret of getSessionVerificationSecrets(env)) {
    try {
      return await jwtVerify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to verify admin session token');
};

export async function verifyAdminSessionTokenWithEnv(
  token: string | null | undefined,
  env: AdminSessionEnv,
) {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await verifySessionJwt(token, env);
    if (payload.role !== 'admin') {
      return null;
    }

    const adminId = Number(payload.adminId ?? 0);
    const userId = Number(payload.userId ?? payload.sub ?? 0);
    const sessionId = typeof payload.jti === 'string' ? payload.jti : '';
    if (!adminId || !userId || !sessionId) {
      return null;
    }

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
      permissions: [],
      requiresMfa: false,
    } satisfies AdminSessionPayload;
  } catch {
    return null;
  }
}
