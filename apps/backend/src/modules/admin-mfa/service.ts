import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import { and, eq, sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { admins } from "@reward/database";
import { db, type DbClient, type DbTransaction } from "../../db";
import { getConfig } from "../../shared/config";
import {
  conflictError,
  internalInvariantError,
  unprocessableEntityError,
} from "../../shared/errors";
import {
  createAdminSessionToken,
  type AdminMfaRecoveryMode,
} from "../../shared/admin-session";
import { getSessionSecret } from "../../shared/session-secret";
import { readSqlRows } from "../../shared/sql-result";
import { revokeAuthSessions } from "../session/service";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_SEGMENT_LENGTH = 4;
const RECOVERY_CODE_SEGMENT_COUNT = 3;
const RECOVERY_CODE_LENGTH =
  RECOVERY_CODE_SEGMENT_LENGTH * RECOVERY_CODE_SEGMENT_COUNT;
const RECOVERY_CODE_COUNT = 8;
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const TOTP_ALLOWED_WINDOW = 1;
const ENROLLMENT_TTL_SECONDS = 60 * 10;
const ENROLLMENT_PURPOSE = "admin-mfa-enrollment";

type DbExecutor = DbClient | DbTransaction;

type AdminMfaRow = {
  adminId: number;
  userId: number;
  mfaEnabled: boolean;
  mfaSecretCiphertext: string | null;
  mfaRecoveryCodeHashes: unknown;
  mfaRecoveryCodesGeneratedAt: Date | null;
};

type RecoveryCodeSet = {
  recoveryCodes: string[];
  recoveryCodeHashes: string[];
  generatedAt: Date;
};

export type AdminMfaMethod = "totp" | "recovery_code" | "break_glass";

const readSecret = (name: string) => (process.env[name] ?? "").trim();

const getMfaEncryptionKey = () => {
  const dedicatedSecret = readSecret("ADMIN_MFA_ENCRYPTION_SECRET");
  const fallbackSecret = readSecret("ADMIN_JWT_SECRET");
  const rawSecret = dedicatedSecret || fallbackSecret;

  if (!rawSecret) {
    throw internalInvariantError(
      "ADMIN_MFA_ENCRYPTION_SECRET or ADMIN_JWT_SECRET must be set.",
    );
  }

  if (process.env.NODE_ENV === "production" && !dedicatedSecret) {
    throw internalInvariantError(
      "ADMIN_MFA_ENCRYPTION_SECRET must be set in production.",
    );
  }

  return createHash("sha256").update(rawSecret, "utf8").digest();
};

const encodeBase32 = (value: Uint8Array) => {
  let bits = 0;
  let accumulator = 0;
  let encoded = "";

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
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw internalInvariantError("Invalid base32 secret.");
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

  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
};

const encryptSecret = (secret: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

const decryptSecret = (ciphertext: string) => {
  const [version, ivEncoded, tagEncoded, payloadEncoded] =
    ciphertext.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !payloadEncoded) {
    throw internalInvariantError("Invalid admin MFA secret payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMfaEncryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
};

const buildOtpAuthUrl = (payload: { email: string; secret: string }) => {
  const config = getConfig();

  let issuer = "Reward Admin";
  try {
    const url = new URL(config.adminBaseUrl);
    if (url.hostname) {
      issuer = url.hostname;
    }
  } catch {
    issuer = "Reward Admin";
  }

  const label = `${issuer}:${payload.email}`;
  const params = new URLSearchParams({
    secret: payload.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};

const formatRecoveryCode = (value: string) => {
  const segments: string[] = [];
  for (
    let index = 0;
    index < value.length;
    index += RECOVERY_CODE_SEGMENT_LENGTH
  ) {
    segments.push(value.slice(index, index + RECOVERY_CODE_SEGMENT_LENGTH));
  }

  return segments.join("-");
};

const generateRecoveryCode = () =>
  formatRecoveryCode(
    [...randomBytes(RECOVERY_CODE_LENGTH)]
      .map((byte) => RECOVERY_CODE_ALPHABET[byte & 31])
      .join(""),
  );

const normalizeRecoveryCode = (value: string | null | undefined) => {
  const normalized =
    value
      ?.replace(/[\s-]+/g, "")
      .toUpperCase()
      .trim() ?? "";
  if (normalized.length !== RECOVERY_CODE_LENGTH) {
    return null;
  }

  for (const char of normalized) {
    if (!RECOVERY_CODE_ALPHABET.includes(char)) {
      return null;
    }
  }

  return normalized;
};

const hashRecoveryCode = (normalizedCode: string) =>
  createHmac("sha256", getMfaEncryptionKey())
    .update(`admin-mfa-recovery:${normalizedCode}`)
    .digest("base64url");

const createRecoveryCodeSet = (): RecoveryCodeSet => {
  const normalizedCodes = new Set<string>();
  while (normalizedCodes.size < RECOVERY_CODE_COUNT) {
    const nextCode = normalizeRecoveryCode(generateRecoveryCode());
    if (nextCode) {
      normalizedCodes.add(nextCode);
    }
  }

  const codes = [...normalizedCodes].map(formatRecoveryCode);
  return {
    recoveryCodes: codes,
    recoveryCodeHashes: [...normalizedCodes].map(hashRecoveryCode),
    generatedAt: new Date(),
  };
};

const toRecoveryCodeHashes = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];

const loadAdminMfaRow = async (
  executor: DbExecutor,
  adminId: number,
  lock = false,
) => {
  if (!lock) {
    const [admin] = await executor
      .select({
        adminId: admins.id,
        userId: admins.userId,
        mfaEnabled: admins.mfaEnabled,
        mfaSecretCiphertext: admins.mfaSecretCiphertext,
        mfaRecoveryCodeHashes: admins.mfaRecoveryCodeHashes,
        mfaRecoveryCodesGeneratedAt: admins.mfaRecoveryCodesGeneratedAt,
      })
      .from(admins)
      .where(and(eq(admins.id, adminId), eq(admins.isActive, true)))
      .limit(1);

    return (admin ?? null) as AdminMfaRow | null;
  }

  const result = await executor.execute(sql`
    SELECT
      ${admins.id} AS "adminId",
      ${admins.userId} AS "userId",
      ${admins.mfaEnabled} AS "mfaEnabled",
      ${admins.mfaSecretCiphertext} AS "mfaSecretCiphertext",
      ${admins.mfaRecoveryCodeHashes} AS "mfaRecoveryCodeHashes",
      ${admins.mfaRecoveryCodesGeneratedAt} AS "mfaRecoveryCodesGeneratedAt"
    FROM ${admins}
    WHERE ${admins.id} = ${adminId}
      AND ${admins.isActive} = true
    FOR UPDATE
  `);

  return readSqlRows<AdminMfaRow>(result)[0] ?? null;
};

const clearAdminMfaState = () => ({
  mfaEnabled: false,
  mfaSecretCiphertext: null,
  mfaRecoveryCodeHashes: null,
  mfaRecoveryCodesGeneratedAt: null,
  mfaEnabledAt: null,
  updatedAt: new Date(),
});

export const isAdminMfaBreakGlassConfigured = () =>
  readSecret("ADMIN_MFA_BREAK_GLASS_SECRET").length > 0;

export const verifyAdminMfaBreakGlassCode = (
  value: string | null | undefined,
) => {
  const expected = readSecret("ADMIN_MFA_BREAK_GLASS_SECRET");
  const provided = value?.trim() ?? "";

  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export const normalizeTotpCode = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, "").trim() ?? "";
  return /^\d{6}$/.test(normalized) ? normalized : null;
};

export const generateTotpCode = (secret: string, now = Date.now()) => {
  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  return generateHotpCode(secret, counter);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  now = Date.now(),
) => {
  const normalizedCode = normalizeTotpCode(code);
  if (!normalizedCode) {
    return false;
  }

  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  for (
    let offset = -TOTP_ALLOWED_WINDOW;
    offset <= TOTP_ALLOWED_WINDOW;
    offset += 1
  ) {
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
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.adminId))
    .setIssuedAt(now)
    .setExpirationTime(now + ENROLLMENT_TTL_SECONDS)
    .sign(getSessionSecret("admin"));
};

const verifyEnrollmentToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getSessionSecret("admin"));
  if (payload.purpose !== ENROLLMENT_PURPOSE) {
    throw unprocessableEntityError("Invalid MFA enrollment token.");
  }

  const adminId = Number(payload.adminId ?? payload.sub ?? 0);
  const email = String(payload.email ?? "");
  const secret = String(payload.secret ?? "");

  if (!adminId || !email || !secret) {
    throw unprocessableEntityError("Invalid MFA enrollment token.");
  }

  return {
    adminId,
    email,
    secret,
  };
};

const issueAdminSession = async (payload: {
  adminId: number;
  userId: number;
  email: string;
  mfaEnabled: boolean;
  mfaRecoveryMode: AdminMfaRecoveryMode;
}) =>
  createAdminSessionToken({
    adminId: payload.adminId,
    userId: payload.userId,
    email: payload.email,
    role: "admin",
    mfaEnabled: payload.mfaEnabled,
    mfaRecoveryMode: payload.mfaRecoveryMode,
  });

export async function createAdminMfaEnrollment(payload: {
  adminId: number;
  email: string;
  mfaEnabled: boolean;
}) {
  if (payload.mfaEnabled) {
    throw conflictError("Admin MFA is already enabled.", {
      code: API_ERROR_CODES.ADMIN_MFA_ALREADY_ENABLED,
    });
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

export async function getAdminMfaStatus(payload: { adminId: number }) {
  const admin = await loadAdminMfaRow(db, payload.adminId);
  const recoveryCodeHashes = toRecoveryCodeHashes(admin?.mfaRecoveryCodeHashes);

  return {
    mfaEnabled: Boolean(admin?.mfaEnabled),
    recoveryCodesRemaining: recoveryCodeHashes.length,
    recoveryCodesGeneratedAt: admin?.mfaRecoveryCodesGeneratedAt ?? null,
    breakGlassConfigured: isAdminMfaBreakGlassConfigured(),
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
    throw conflictError(
      "MFA enrollment token does not match the active admin.",
      {
        code: API_ERROR_CODES.ADMIN_MFA_ENROLLMENT_TOKEN_MISMATCH,
      },
    );
  }

  if (enrollment.email !== payload.currentAdmin.email) {
    throw conflictError(
      "MFA enrollment token does not match the active admin.",
      {
        code: API_ERROR_CODES.ADMIN_MFA_ENROLLMENT_TOKEN_MISMATCH,
      },
    );
  }

  if (!verifyTotpCode(enrollment.secret, payload.totpCode)) {
    throw unprocessableEntityError("Invalid admin MFA code.", {
      code: API_ERROR_CODES.INVALID_ADMIN_MFA_CODE,
    });
  }

  const recoveryCodes = createRecoveryCodeSet();
  await db
    .update(admins)
    .set({
      mfaEnabled: true,
      mfaSecretCiphertext: encryptSecret(enrollment.secret),
      mfaRecoveryCodeHashes: recoveryCodes.recoveryCodeHashes,
      mfaRecoveryCodesGeneratedAt: recoveryCodes.generatedAt,
      mfaEnabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(admins.id, payload.currentAdmin.adminId),
        eq(admins.isActive, true),
      ),
    );

  const session = await issueAdminSession({
    adminId: payload.currentAdmin.adminId,
    userId: payload.currentAdmin.userId,
    email: payload.currentAdmin.email,
    mfaEnabled: true,
    mfaRecoveryMode: "none",
  });

  await revokeAuthSessions({
    userId: payload.currentAdmin.userId,
    kind: "admin",
    excludeJti: session.sessionId,
    reason: "admin_mfa_enabled",
    eventType: "admin_sessions_revoked_all",
    email: payload.currentAdmin.email,
    metadata: {
      triggeredBy: "admin_mfa_enable",
      previousSessionId: payload.currentAdmin.sessionId,
    },
  });

  return {
    ...session,
    recoveryCodes: recoveryCodes.recoveryCodes,
    recoveryCodesRemaining: recoveryCodes.recoveryCodes.length,
  };
}

export async function verifyAdminMfaChallenge(payload: {
  adminId: number;
  code: string;
}) {
  const normalizedTotp = normalizeTotpCode(payload.code);
  const normalizedRecoveryCode = normalizeRecoveryCode(payload.code);

  if (!normalizedTotp && !normalizedRecoveryCode) {
    return {
      valid: false,
      method: null,
      recoveryCodesRemaining: 0,
    } as const;
  }

  if (normalizedTotp) {
    const admin = await loadAdminMfaRow(db, payload.adminId);
    if (!admin?.mfaEnabled || !admin.mfaSecretCiphertext) {
      return {
        valid: false,
        method: null,
        recoveryCodesRemaining: toRecoveryCodeHashes(
          admin?.mfaRecoveryCodeHashes,
        ).length,
      } as const;
    }

    try {
      const secret = decryptSecret(admin.mfaSecretCiphertext);
      if (verifyTotpCode(secret, normalizedTotp)) {
        return {
          valid: true,
          method: "totp" as const,
          recoveryCodesRemaining: toRecoveryCodeHashes(
            admin.mfaRecoveryCodeHashes,
          ).length,
        };
      }
    } catch {
      return {
        valid: false,
        method: null,
        recoveryCodesRemaining: toRecoveryCodeHashes(
          admin.mfaRecoveryCodeHashes,
        ).length,
      } as const;
    }
  }

  if (!normalizedRecoveryCode) {
    return {
      valid: false,
      method: null,
      recoveryCodesRemaining: 0,
    } as const;
  }

  return db.transaction(async (tx) => {
    const admin = await loadAdminMfaRow(tx, payload.adminId, true);
    if (!admin?.mfaEnabled) {
      return {
        valid: false,
        method: null,
        recoveryCodesRemaining: 0,
      } as const;
    }

    const recoveryCodeHashes = toRecoveryCodeHashes(
      admin.mfaRecoveryCodeHashes,
    );
    const recoveryCodeHash = hashRecoveryCode(normalizedRecoveryCode);
    const recoveryCodeIndex = recoveryCodeHashes.indexOf(recoveryCodeHash);

    if (recoveryCodeIndex < 0) {
      return {
        valid: false,
        method: null,
        recoveryCodesRemaining: recoveryCodeHashes.length,
      } as const;
    }

    const nextRecoveryCodeHashes = [...recoveryCodeHashes];
    nextRecoveryCodeHashes.splice(recoveryCodeIndex, 1);

    await tx
      .update(admins)
      .set({
        mfaRecoveryCodeHashes: nextRecoveryCodeHashes,
        updatedAt: new Date(),
      })
      .where(and(eq(admins.id, payload.adminId), eq(admins.isActive, true)));

    return {
      valid: true,
      method: "recovery_code" as const,
      recoveryCodesRemaining: nextRecoveryCodeHashes.length,
    };
  });
}

export async function regenerateAdminRecoveryCodes(payload: {
  currentAdmin: {
    adminId: number;
    userId: number;
    email: string;
  };
  totpCode: string;
}) {
  const verified = await verifyAdminMfaChallenge({
    adminId: payload.currentAdmin.adminId,
    code: payload.totpCode,
  });
  if (!verified.valid || !verified.method) {
    throw unprocessableEntityError("Invalid admin MFA code.", {
      code: API_ERROR_CODES.INVALID_ADMIN_MFA_CODE,
    });
  }

  const recoveryCodes = createRecoveryCodeSet();
  await db
    .update(admins)
    .set({
      mfaRecoveryCodeHashes: recoveryCodes.recoveryCodeHashes,
      mfaRecoveryCodesGeneratedAt: recoveryCodes.generatedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(admins.id, payload.currentAdmin.adminId),
        eq(admins.isActive, true),
      ),
    );

  return {
    method: verified.method,
    recoveryCodes: recoveryCodes.recoveryCodes,
    recoveryCodesRemaining: recoveryCodes.recoveryCodes.length,
    recoveryCodesGeneratedAt: recoveryCodes.generatedAt,
  };
}

export async function disableAdminMfa(payload: {
  currentAdmin: {
    adminId: number;
    userId: number;
    email: string;
    sessionId: string;
    mfaRecoveryMode: AdminMfaRecoveryMode;
  };
  totpCode?: string | null;
}) {
  const admin = await loadAdminMfaRow(db, payload.currentAdmin.adminId);
  if (!admin?.mfaEnabled) {
    throw conflictError("Admin MFA is not enabled.", {
      code: API_ERROR_CODES.ADMIN_MFA_NOT_ENABLED,
    });
  }

  let verifiedMethod: AdminMfaMethod;
  if (payload.currentAdmin.mfaRecoveryMode !== "none") {
    verifiedMethod = payload.currentAdmin.mfaRecoveryMode;
  } else {
    const code = payload.totpCode?.trim() ?? "";
    if (!code) {
      throw unprocessableEntityError("Admin MFA code required.", {
        code: API_ERROR_CODES.ADMIN_MFA_CODE_REQUIRED,
      });
    }

    const verified = await verifyAdminMfaChallenge({
      adminId: payload.currentAdmin.adminId,
      code,
    });
    if (!verified.valid || !verified.method) {
      throw unprocessableEntityError("Invalid admin MFA code.", {
        code: API_ERROR_CODES.INVALID_ADMIN_MFA_CODE,
      });
    }
    verifiedMethod = verified.method;
  }

  await db
    .update(admins)
    .set(clearAdminMfaState())
    .where(
      and(
        eq(admins.id, payload.currentAdmin.adminId),
        eq(admins.isActive, true),
      ),
    );

  const session = await issueAdminSession({
    adminId: payload.currentAdmin.adminId,
    userId: payload.currentAdmin.userId,
    email: payload.currentAdmin.email,
    mfaEnabled: false,
    mfaRecoveryMode: "none",
  });

  await revokeAuthSessions({
    userId: payload.currentAdmin.userId,
    kind: "admin",
    excludeJti: session.sessionId,
    reason: "admin_mfa_disabled",
    eventType: "admin_sessions_revoked_all",
    email: payload.currentAdmin.email,
    metadata: {
      triggeredBy: "admin_mfa_disable",
      verificationMethod: verifiedMethod,
      previousSessionId: payload.currentAdmin.sessionId,
    },
  });

  return {
    ...session,
    method: verifiedMethod,
  };
}
