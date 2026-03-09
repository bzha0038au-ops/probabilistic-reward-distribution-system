const encoder = new TextEncoder();

type SessionKind = 'admin' | 'user';

const readSecret = (name: string) => (process.env[name] ?? '').trim();

export function getSessionSecret(kind: SessionKind) {
  const secret =
    kind === 'admin' ? readSecret('ADMIN_JWT_SECRET') : readSecret('USER_JWT_SECRET');

  if (!secret) {
    throw new Error(
      `${kind.toUpperCase()}_JWT_SECRET is not set (required for ${kind} sessions).`
    );
  }

  return encoder.encode(secret);
}

export function validateSessionSecrets() {
  const adminSecret = readSecret('ADMIN_JWT_SECRET');
  const userSecret = readSecret('USER_JWT_SECRET');
  const webSecret = readSecret('AUTH_SECRET') || readSecret('NEXTAUTH_SECRET');

  if (!adminSecret || !userSecret) {
    throw new Error('ADMIN_JWT_SECRET and USER_JWT_SECRET must be set.');
  }

  if (adminSecret === userSecret) {
    throw new Error('ADMIN_JWT_SECRET and USER_JWT_SECRET must be different.');
  }

  if (webSecret && (webSecret === adminSecret || webSecret === userSecret)) {
    throw new Error('AUTH_SECRET must not match ADMIN_JWT_SECRET or USER_JWT_SECRET.');
  }

  if (process.env.NODE_ENV === 'production') {
    if (adminSecret.length < 32 || userSecret.length < 32) {
      throw new Error('JWT secrets must be at least 32 characters in production.');
    }
  }
}
