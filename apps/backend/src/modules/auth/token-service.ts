import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes, randomInt } from 'node:crypto';

import { db } from '../../db';
import { authTokens } from '@reward/database';

export type AuthTokenType =
  | 'password_reset'
  | 'email_verification'
  | 'phone_verification';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const createLongToken = () => randomBytes(24).toString('base64url');

const createPhoneCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const buildActiveScope = (payload: {
  tokenType: AuthTokenType;
  userId?: number | null;
  email?: string | null;
  phone?: string | null;
}) => {
  const conditions = [
    eq(authTokens.tokenType, payload.tokenType),
    isNull(authTokens.consumedAt),
    gt(authTokens.expiresAt, new Date()),
  ];

  if (payload.userId) {
    conditions.push(eq(authTokens.userId, payload.userId));
  }
  if (payload.email) {
    conditions.push(eq(authTokens.email, payload.email));
  }
  if (payload.phone) {
    conditions.push(eq(authTokens.phone, payload.phone));
  }

  return and(...conditions);
};

export async function issueAuthToken(payload: {
  tokenType: AuthTokenType;
  userId?: number | null;
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
  ttlMinutes: number;
  format?: 'token' | 'code';
}) {
  const rawToken = payload.format === 'code' ? createPhoneCode() : createLongToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + payload.ttlMinutes * 60 * 1000);

  const [created] = await db.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ consumedAt: now })
      .where(
        buildActiveScope({
          tokenType: payload.tokenType,
          userId: payload.userId,
          email: payload.email,
          phone: payload.phone,
        })
      );

    return tx
      .insert(authTokens)
      .values({
        userId: payload.userId ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        tokenType: payload.tokenType,
        tokenHash: hashToken(rawToken),
        metadata: payload.metadata ?? null,
        expiresAt,
      })
      .returning();
  });

  return {
    rawToken,
    expiresAt,
    record: created ?? null,
  };
}

export async function consumeAuthToken(payload: {
  tokenType: AuthTokenType;
  token: string;
  userId?: number | null;
  email?: string | null;
  phone?: string | null;
}) {
  const now = new Date();
  const conditions = [
    eq(authTokens.tokenType, payload.tokenType),
    eq(authTokens.tokenHash, hashToken(payload.token)),
    isNull(authTokens.consumedAt),
    gt(authTokens.expiresAt, now),
  ];

  if (payload.userId) {
    conditions.push(eq(authTokens.userId, payload.userId));
  }
  if (payload.email) {
    conditions.push(eq(authTokens.email, payload.email));
  }
  if (payload.phone) {
    conditions.push(eq(authTokens.phone, payload.phone));
  }

  const [consumed] = await db
    .update(authTokens)
    .set({ consumedAt: now })
    .where(and(...conditions))
    .returning();

  return consumed ?? null;
}

export async function revokeOutstandingAuthTokens(payload: {
  tokenType: AuthTokenType;
  userId?: number | null;
  email?: string | null;
  phone?: string | null;
}) {
  const now = new Date();
  await db
    .update(authTokens)
    .set({ consumedAt: now })
    .where(
      buildActiveScope({
        tokenType: payload.tokenType,
        userId: payload.userId,
        email: payload.email,
        phone: payload.phone,
      })
    );
}
