const encoder = new TextEncoder();

export function getSessionSecret() {
  const secret =
    process.env.ADMIN_JWT_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    '';

  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET or AUTH_SECRET is not set');
  }

  return encoder.encode(secret);
}
