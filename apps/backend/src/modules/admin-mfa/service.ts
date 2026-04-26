import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';

import { admins } from '@reward/database';
import { db } from '../../db';
import { getConfig } from '../../shared/config';
import { createAdminSessionToken } from '../../shared/admin-session';
import { getSessionSecret } from '../../shared/session-secret';
import { revokeAuthSessions } from '../session/service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const TOTP_ALLOWED_WINDOW = 1;
const ENROLLMENT_TTL_SECONDS = 60 * 10;
const ENROLLMENT_PURPOSE = 'admin-mfa-enrollment';

const getMfaEncryptionKey = () => {
  const rawSecret = (
    process.env.ADMIN_MFA_ENCRYPTION_SECRET ?? process.env.ADMIN_JWT_SECRET ?? ''
  ).trim();

  if (!rawSecret) {
    throw new Error('ADMIN_MFA_ENCRYPTION_SECRET or ADMIN_JWT_SECRET must be set.');
  }

  return createHash('sha256').update(rawSecret, 'utf8').digest();
};

const encodeBase32 = (value: Uint8Array) => {
  let bits = 0;
  let accumulator = 0;
  let encoded = '';

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  }

  return encoded;
};

const decodeBase32 = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base32 secret.');
    }

    accumulator = (accumulator << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((accumulator >> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const generateHotpCode = (secret: string, counter: bigint) => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

const encryptSecret = (secret: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

const decryptSecret = (ciphertext: string) => {
  const [version, ivEncoded, tagEncoded, payloadEncoded] = ciphertext.split('.');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error('Invalid admin MFA secret payload.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMfaEncryptionKey(),
    Buffer.from(ivEncoded, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, 'base64url')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

const buildOtpAuthUrl = (payload: { email: string; secret: string }) => {
  const config = getConfig();

  let issuer = 'Reward Admin';
  try {
    const url = new URL(config.adminBaseUrl);
    if (url.hostname) {
      issuer = url.hostname;
    }
  } catch {
    issuer = 'Reward Admin';
  }

  const label = `${issuer}:${payload.email}`;
  const params = new URLSearchParams({
    secret: payload.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};

export const normalizeTotpCode = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, '').trim() ?? '';
  return /^\d{6}$/.test(normalized) ? normalized : null;
};

export const generateTotpCode = (secret: string, now = Date.now()) => {
  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  return generateHotpCode(secret, counter);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  now = Date.now()
) => {
  const normalizedCode = normalizeTotpCode(code);
  if (!normalizedCode) {
    return false;
  }

  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  for (let offset = -TOTP_ALLOWED_WINDOW; offset <= TOTP_ALLOWED_WINDOW; offset += 1) {
    const currentCounter = counter + BigInt(offset);
    if (currentCounter < 0) continue;

    if (generateHotpCode(secret, currentCounter) === normalizedCode) {
      return true;
    }
  }

  return false;
};

const createEnrollmentToken = async (payload: {
  adminId: number;
  email: string;
  secret: string;
}) => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    adminId: payload.adminId,
    email: payload.email,
    secret: payload.secret,
    purpose: ENROLLMENT_PURPOSE,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.adminId))
    .setIssuedAt(now)
    .setExpirationTime(now + ENROLLMENT_TTL_SECONDS)
    .sign(getSessionSecret('admin'));
};

const verifyEnrollmentToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getSessionSecret('admin'));
  if (payload.purpose !== ENROLLMENT_PURPOSE) {
    throw new Error('Invalid MFA enrollment token.');
  }

  const adminId = Number(payload.adminId ?? payload.sub ?? 0);
  const email = String(payload.email ?? '');
  const secret = String(payload.secret ?? '');

  if (!adminId || !email || !secret) {
    throw new Error('Invalid MFA enrollment token.');
  }

  return {
    adminId,
    email,
    secret,
  };
};

export async function createAdminMfaEnrollment(payload: {
  adminId: number;
  email: string;
  mfaEnabled: boolean;
}) {
  if (payload.mfaEnabled) {
    throw new Error('Admin MFA is already enabled.');
  }

  const secret = encodeBase32(randomBytes(20));
  const enrollmentToken = await createEnrollmentToken({
    adminId: payload.adminId,
    email: payload.email,
    secret,
  });

  return {
    secret,
    otpauthUrl: buildOtpAuthUrl({ email: payload.email, secret }),
    enrollmentToken,
  };
}

export async function confirmAdminMfaEnrollment(payload: {
  currentAdmin: {
    adminId: number;
    userId: number;
    email: string;
    sessionId: string;
  };
  enrollmentToken: string;
  totpCode: string;
}) {
  const enrollment = await verifyEnrollmentToken(payload.enrollmentToken);
  if (enrollment.adminId !== payload.currentAdmin.adminId) {
    throw new Error('MFA enrollment token does not match the active admin.');
  }

  if (enrollment.email !== payload.currentAdmin.email) {
    throw new Error('MFA enrollment token does not match the active admin.');
  }

  if (!verifyTotpCode(enrollment.secret, payload.totpCode)) {
    throw new Error('Invalid admin MFA code.');
  }

  await db
    .update(admins)
    .set({
      mfaEnabled: true,
      mfaSecretCiphertext: encryptSecret(enrollment.secret),
      mfaEnabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(admins.id, payload.currentAdmin.adminId), eq(admins.isActive, true)));

  const session = await createAdminSessionToken({
    adminId: payload.currentAdmin.adminId,
    userId: payload.currentAdmin.userId,
    email: payload.currentAdmin.email,
    role: 'admin',
    mfaEnabled: true,
  });

  await revokeAuthSessions({
    userId: payload.currentAdmin.userId,
    kind: 'admin',
    excludeJti: session.sessionId,
    reason: 'admin_mfa_enabled',
    eventType: 'admin_sessions_revoked_all',
    email: payload.currentAdmin.email,
    metadata: {
      triggeredBy: 'admin_mfa_enable',
      previousSessionId: payload.currentAdmin.sessionId,
    },
  });

  return session;
}

export async function verifyAdminTotpCode(payload: {
  adminId: number;
  totpCode: string;
}) {
  const normalizedCode = normalizeTotpCode(payload.totpCode);
  if (!normalizedCode) {
    return false;
  }

  const [admin] = await db
    .select({
      mfaEnabled: admins.mfaEnabled,
      mfaSecretCiphertext: admins.mfaSecretCiphertext,
    })
    .from(admins)
    .where(and(eq(admins.id, payload.adminId), eq(admins.isActive, true)))
    .limit(1);

  if (!admin?.mfaEnabled || !admin.mfaSecretCiphertext) {
    return false;
  }

  try {
    const secret = decryptSecret(admin.mfaSecretCiphertext);
    return verifyTotpCode(secret, normalizedCode);
  } catch {
    return false;
  }
}
