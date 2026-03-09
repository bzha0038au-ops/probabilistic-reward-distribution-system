const encoder = new TextEncoder();

type SessionKind = 'admin' | 'user';

export function getSessionSecret(kind: SessionKind) {
  const secret =
    kind === 'admin' ? process.env.ADMIN_JWT_SECRET : process.env.USER_JWT_SECRET;

  if (!secret) {
    throw new Error(
      `${kind.toUpperCase()}_JWT_SECRET is not set (required for ${kind} sessions).`
    );
  }

  return encoder.encode(secret);
}
