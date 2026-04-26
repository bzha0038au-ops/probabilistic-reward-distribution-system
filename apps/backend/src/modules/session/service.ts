import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '../../db';
import { authSessions } from '@reward/database';
import { recordAuthEvent } from '../audit/service';

export type AuthSessionKind = 'user' | 'admin';
export type AuthSessionRole = 'user' | 'admin';

const ACTIVE_SESSION_STATUS = 'active';
const SESSION_TOUCH_WINDOW_MS = 5 * 60 * 1000;

export async function createAuthSession(payload: {
  userId: number;
  kind: AuthSessionKind;
  role: AuthSessionRole;
  ttlSeconds: number;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + payload.ttlSeconds * 1000);
  const jti = randomUUID();

  const [session] = await db
    .insert(authSessions)
    .values({
      userId: payload.userId,
      sessionKind: payload.kind,
      subjectRole: payload.role,
      jti,
      status: ACTIVE_SESSION_STATUS,
      ip: payload.ip ?? null,
      userAgent: payload.userAgent ?? null,
      expiresAt,
      lastSeenAt: now,
      updatedAt: now,
    })
    .returning();

  if (!session) {
    throw new Error('Failed to create auth session.');
  }

  return session;
}

export async function validateAuthSession(payload: {
  jti: string;
  userId: number;
  kind: AuthSessionKind;
}) {
  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.jti, payload.jti),
        eq(authSessions.userId, payload.userId),
        eq(authSessions.sessionKind, payload.kind)
      )
    )
    .limit(1);

  if (!session) return null;
  if (session.status !== ACTIVE_SESSION_STATUS) return null;

  const now = new Date();
  if (session.expiresAt <= now) {
    await db
      .update(authSessions)
      .set({
        status: 'expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(authSessions.jti, payload.jti),
          eq(authSessions.status, ACTIVE_SESSION_STATUS)
        )
      );
    return null;
  }

  if (
    !session.lastSeenAt ||
    now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_WINDOW_MS
  ) {
    await db
      .update(authSessions)
      .set({
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(authSessions.jti, payload.jti));
  }

  return session;
}

export async function listActiveAuthSessions(payload: {
  userId: number;
  kind: AuthSessionKind;
  currentJti?: string | null;
}) {
  const now = new Date();
  const rows = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.userId, payload.userId),
        eq(authSessions.sessionKind, payload.kind),
        eq(authSessions.status, ACTIVE_SESSION_STATUS),
        gt(authSessions.expiresAt, now)
      )
    )
    .orderBy(desc(authSessions.createdAt));

  return rows.map((row) => ({
    sessionId: row.jti,
    kind: row.sessionKind as AuthSessionKind,
    role: row.subjectRole as AuthSessionRole,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    current: row.jti === payload.currentJti,
  }));
}

export async function revokeAuthSession(payload: {
  jti: string;
  userId: number;
  kind: AuthSessionKind;
  reason: string;
  eventType?: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const now = new Date();
  const [session] = await db
    .update(authSessions)
    .set({
      status: 'revoked',
      revokedAt: now,
      revokedReason: payload.reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(authSessions.jti, payload.jti),
        eq(authSessions.userId, payload.userId),
        eq(authSessions.sessionKind, payload.kind),
        eq(authSessions.status, ACTIVE_SESSION_STATUS),
        gt(authSessions.expiresAt, now)
      )
    )
    .returning();

  if (!session || !payload.eventType) {
    return session ?? null;
  }

  await recordAuthEvent({
    eventType: payload.eventType,
    email: payload.email ?? null,
    userId: payload.userId,
    ip: payload.ip ?? null,
    userAgent: payload.userAgent ?? null,
    metadata: {
      reason: payload.reason,
      sessionId: payload.jti,
      sessionKind: payload.kind,
      ...(payload.metadata ?? {}),
    },
  });

  return session;
}

export async function revokeAuthSessions(payload: {
  userId: number;
  kind?: AuthSessionKind;
  excludeJti?: string | null;
  reason: string;
  eventType?: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const now = new Date();
  const conditions = [
    eq(authSessions.userId, payload.userId),
    eq(authSessions.status, ACTIVE_SESSION_STATUS),
    gt(authSessions.expiresAt, now),
  ];

  if (payload.kind) {
    conditions.push(eq(authSessions.sessionKind, payload.kind));
  }
  if (payload.excludeJti) {
    conditions.push(ne(authSessions.jti, payload.excludeJti));
  }

  const sessions = await db
    .update(authSessions)
    .set({
      status: 'revoked',
      revokedAt: now,
      revokedReason: payload.reason,
      updatedAt: now,
    })
    .where(and(...conditions))
    .returning({
      jti: authSessions.jti,
      sessionKind: authSessions.sessionKind,
    });

  if (sessions.length === 0 || !payload.eventType) {
    return sessions;
  }

  await recordAuthEvent({
    eventType: payload.eventType,
    email: payload.email ?? null,
    userId: payload.userId,
    ip: payload.ip ?? null,
    userAgent: payload.userAgent ?? null,
    metadata: {
      reason: payload.reason,
      revokedCount: sessions.length,
      sessionKinds: [...new Set(sessions.map((session) => session.sessionKind))],
      ...(payload.metadata ?? {}),
    },
  });

  return sessions;
}
