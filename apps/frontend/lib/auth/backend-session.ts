type BackendSessionPayload = {
  userId: number;
  sessionId: string;
  expiresAt: number;
  email?: string;
  role?: string;
};

type JwtHeader = {
  alg?: unknown;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const cachedVerificationKeys = new Map<string, Promise<CryptoKey>>();

const resolveUserJwtSecret = () => {
  const secret = process.env.USER_JWT_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('USER_JWT_SECRET is required to verify backend user sessions.');
  }

  return secret;
};

const resolveUserJwtSecretsForVerification = () => {
  const currentSecret = resolveUserJwtSecret();
  const previousSecret = process.env.USER_JWT_SECRET_PREVIOUS?.trim() ?? '';
  const secrets = [currentSecret];

  if (previousSecret && previousSecret !== currentSecret) {
    secrets.push(previousSecret);
  }

  return secrets;
};

const getVerificationKey = (secret: string) => {
  let cachedKeyPromise = cachedVerificationKeys.get(secret);
  if (!cachedKeyPromise) {
    cachedKeyPromise = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    cachedVerificationKeys.set(secret, cachedKeyPromise);
  }

  return cachedKeyPromise;
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const decodeJwtJson = <T>(segment: string): T | null => {
  try {
    return JSON.parse(decoder.decode(decodeBase64Url(segment))) as T;
  } catch {
    return null;
  }
};

const readPositiveInteger = (value: unknown) => {
  const normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

const normalizeBackendSessionPayload = (
  payload: Record<string, unknown>
): BackendSessionPayload | null => {
  const userId = readPositiveInteger(payload.userId ?? payload.sub);
  const expiresAt = readPositiveInteger(payload.exp);
  const sessionId = typeof payload.jti === 'string' ? payload.jti.trim() : '';

  if (!userId || !expiresAt || !sessionId) {
    return null;
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    userId,
    sessionId,
    expiresAt,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : undefined,
  };
};

export async function verifyBackendAccessToken(
  token?: string | null
): Promise<BackendSessionPayload | null> {
  if (!token) {
    return null;
  }

  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJwtJson<JwtHeader>(encodedHeader);
  if (!header || header.alg !== 'HS256') {
    return null;
  }

  try {
    const signature = decodeBase64Url(encodedSignature);
    const signedPayload = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    let verified = false;

    for (const secret of resolveUserJwtSecretsForVerification()) {
      const currentVerified = await crypto.subtle.verify(
        'HMAC',
        await getVerificationKey(secret),
        signature,
        signedPayload
      );

      if (currentVerified) {
        verified = true;
        break;
      }
    }

    if (!verified) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = decodeJwtJson<Record<string, unknown>>(encodedPayload);
  if (!payload) {
    return null;
  }

  return normalizeBackendSessionPayload(payload);
}

export async function hasValidBackendAccessToken(token?: string | null) {
  return (await verifyBackendAccessToken(token)) !== null;
}
