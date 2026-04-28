import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import { userMfaSecrets } from "@reward/database";
import { eq, sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { db, type DbClient, type DbTransaction } from "../../db";
import { getConfig } from "../../shared/config";
import {
  conflictError,
  internalInvariantError,
  unprocessableEntityError,
} from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import { getSessionSecret } from "../../shared/session-secret";
import { readSqlRows } from "../../shared/sql-result";
import {
  buildTotpOtpAuthUrl,
  createTotpSecret,
  normalizeTotpCode,
  verifyTotpCode,
} from "../mfa/totp";
import { getWithdrawalRiskConfig } from "../system/service";

const ENROLLMENT_TTL_SECONDS = 60 * 10;
const ENROLLMENT_PURPOSE = "user-mfa-enrollment";

type DbExecutor = DbClient | DbTransaction;

type UserMfaRow = {
  id: number;
  userId: number;
  secretCiphertext: string;
  enabledAt: Date;
};

export type UserMfaMethod = "totp";

const readSecret = (name: string) => (process.env[name] ?? "").trim();

const getMfaEncryptionKey = () => {
  const dedicatedSecret = readSecret("USER_MFA_ENCRYPTION_SECRET");
  const fallbackSecret = readSecret("USER_JWT_SECRET");
  const rawSecret = dedicatedSecret || fallbackSecret;

  if (!rawSecret) {
    throw internalInvariantError(
      "USER_MFA_ENCRYPTION_SECRET or USER_JWT_SECRET must be set.",
    );
  }

  if (process.env.NODE_ENV === "production" && !dedicatedSecret) {
    throw internalInvariantError(
      "USER_MFA_ENCRYPTION_SECRET must be set in production.",
    );
  }

  return createHash("sha256").update(rawSecret, "utf8").digest();
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
    throw internalInvariantError("Invalid user MFA secret payload.");
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
  let issuer = "Reward";
  try {
    const url = new URL(getConfig().webBaseUrl);
    if (url.hostname) {
      issuer = url.hostname;
    }
  } catch {
    issuer = "Reward";
  }

  return buildTotpOtpAuthUrl({
    issuer,
    accountName: payload.email,
    secret: payload.secret,
  });
};

const loadUserMfaRow = async (
  executor: DbExecutor,
  userId: number,
  lock = false,
) => {
  if (!lock) {
    const [row] = await executor
      .select({
        id: userMfaSecrets.id,
        userId: userMfaSecrets.userId,
        secretCiphertext: userMfaSecrets.secretCiphertext,
        enabledAt: userMfaSecrets.enabledAt,
      })
      .from(userMfaSecrets)
      .where(eq(userMfaSecrets.userId, userId))
      .limit(1);

    return (row ?? null) as UserMfaRow | null;
  }

  const result = await executor.execute(sql`
    SELECT
      ${userMfaSecrets.id} AS "id",
      ${userMfaSecrets.userId} AS "userId",
      ${userMfaSecrets.secretCiphertext} AS "secretCiphertext",
      ${userMfaSecrets.enabledAt} AS "enabledAt"
    FROM ${userMfaSecrets}
    WHERE ${userMfaSecrets.userId} = ${userId}
    FOR UPDATE
  `);

  return readSqlRows<UserMfaRow>(result)[0] ?? null;
};

const createEnrollmentToken = async (payload: {
  userId: number;
  email: string;
  secret: string;
}) => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    secret: payload.secret,
    purpose: ENROLLMENT_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setIssuedAt(now)
    .setExpirationTime(now + ENROLLMENT_TTL_SECONDS)
    .sign(getSessionSecret("user"));
};

const verifyEnrollmentToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getSessionSecret("user"));
  if (payload.purpose !== ENROLLMENT_PURPOSE) {
    throw unprocessableEntityError("Invalid user MFA enrollment token.");
  }

  const userId = Number(payload.userId ?? payload.sub ?? 0);
  const email = String(payload.email ?? "");
  const secret = String(payload.secret ?? "");

  if (!userId || !email || !secret) {
    throw unprocessableEntityError("Invalid user MFA enrollment token.");
  }

  return {
    userId,
    email,
    secret,
  };
};

export async function createUserMfaEnrollment(payload: {
  userId: number;
  email: string;
}) {
  const existing = await loadUserMfaRow(db, payload.userId);
  if (existing) {
    throw conflictError("User MFA is already enabled.", {
      code: API_ERROR_CODES.USER_MFA_ALREADY_ENABLED,
    });
  }

  const secret = createTotpSecret();

  return {
    secret,
    otpauthUrl: buildOtpAuthUrl({ email: payload.email, secret }),
    enrollmentToken: await createEnrollmentToken({
      userId: payload.userId,
      email: payload.email,
      secret,
    }),
  };
}

export async function getUserMfaStatus(payload: { userId: number }) {
  const [row, withdrawalRisk] = await Promise.all([
    loadUserMfaRow(db, payload.userId),
    getWithdrawalRiskConfig(db),
  ]);

  return {
    mfaEnabled: Boolean(row),
    largeWithdrawalThreshold: toMoneyString(
      withdrawalRisk.largeAmountSecondApprovalThreshold,
    ),
  };
}

export async function confirmUserMfaEnrollment(payload: {
  currentUser: {
    userId: number;
    email: string;
  };
  enrollmentToken: string;
  totpCode: string;
}) {
  const enrollment = await verifyEnrollmentToken(payload.enrollmentToken);
  if (enrollment.userId !== payload.currentUser.userId) {
    throw conflictError("MFA enrollment token does not match the active user.", {
      code: API_ERROR_CODES.USER_MFA_ENROLLMENT_TOKEN_MISMATCH,
    });
  }

  if (enrollment.email !== payload.currentUser.email) {
    throw conflictError("MFA enrollment token does not match the active user.", {
      code: API_ERROR_CODES.USER_MFA_ENROLLMENT_TOKEN_MISMATCH,
    });
  }

  if (!verifyTotpCode(enrollment.secret, payload.totpCode)) {
    throw unprocessableEntityError("Invalid user MFA code.", {
      code: API_ERROR_CODES.INVALID_USER_MFA_CODE,
    });
  }

  await db.transaction(async (tx) => {
    const existing = await loadUserMfaRow(tx, payload.currentUser.userId, true);
    if (existing) {
      throw conflictError("User MFA is already enabled.", {
        code: API_ERROR_CODES.USER_MFA_ALREADY_ENABLED,
      });
    }

    await tx.insert(userMfaSecrets).values({
      userId: payload.currentUser.userId,
      secretCiphertext: encryptSecret(enrollment.secret),
      enabledAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return {
    mfaEnabled: true as const,
  };
}

export async function verifyUserMfaChallenge(payload: {
  userId: number;
  code: string;
}) {
  const normalizedTotp = normalizeTotpCode(payload.code);
  if (!normalizedTotp) {
    return {
      valid: false,
      method: null,
    } as const;
  }

  const row = await loadUserMfaRow(db, payload.userId);
  if (!row) {
    return {
      valid: false,
      method: null,
    } as const;
  }

  try {
    const secret = decryptSecret(row.secretCiphertext);
    if (verifyTotpCode(secret, normalizedTotp)) {
      return {
        valid: true,
        method: "totp" as const,
      };
    }
  } catch {
    return {
      valid: false,
      method: null,
    } as const;
  }

  return {
    valid: false,
    method: null,
  } as const;
}

export async function disableUserMfa(payload: {
  currentUser: {
    userId: number;
    email: string;
  };
  totpCode?: string | null;
}) {
  const row = await loadUserMfaRow(db, payload.currentUser.userId);
  if (!row) {
    throw conflictError("User MFA is not enabled.", {
      code: API_ERROR_CODES.USER_MFA_NOT_ENABLED,
    });
  }

  const code = payload.totpCode?.trim() ?? "";
  if (!code) {
    throw unprocessableEntityError("User MFA code required.", {
      code: API_ERROR_CODES.USER_MFA_CODE_REQUIRED,
    });
  }

  const verified = await verifyUserMfaChallenge({
    userId: payload.currentUser.userId,
    code,
  });
  if (!verified.valid || !verified.method) {
    throw unprocessableEntityError("Invalid user MFA code.", {
      code: API_ERROR_CODES.INVALID_USER_MFA_CODE,
    });
  }

  await db
    .delete(userMfaSecrets)
    .where(eq(userMfaSecrets.userId, payload.currentUser.userId));

  return {
    mfaEnabled: false as const,
    method: verified.method,
  };
}

export async function isUserMfaEnabled(userId: number) {
  return (await loadUserMfaRow(db, userId)) !== null;
}
