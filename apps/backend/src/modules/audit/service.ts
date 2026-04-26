import { db } from '../../db';
import { authEvents } from '@reward/database';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from '@reward/database/orm';

export async function recordAuthEvent(payload: {
  eventType: string;
  email?: string | null;
  userId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(authEvents).values({
    eventType: payload.eventType,
    email: payload.email ?? null,
    userId: payload.userId ?? null,
    ip: payload.ip ?? null,
    userAgent: payload.userAgent ?? null,
    metadata: payload.metadata ?? null,
  });
}

export async function listAuthEvents(options: {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  direction?: 'next' | 'prev';
  cursor?: { createdAt: Date; id: number } | null;
  email?: string | null;
  eventType?: string | null;
  from?: Date | null;
  to?: Date | null;
} = {}) {
  const limit = options.limit ?? 50;
  const offset = options.cursor ? 0 : (options.offset ?? 0);
  const requestedOrder = options.order === 'asc' ? 'asc' : 'desc';
  const order =
    options.direction === 'prev'
      ? requestedOrder === 'asc'
        ? 'desc'
        : 'asc'
      : requestedOrder;
  const conditions: SQL[] = [];

  if (options.cursor) {
    const cursorCondition =
      (order === 'asc'
        ? or(
            gt(authEvents.createdAt, options.cursor.createdAt),
            and(
              eq(authEvents.createdAt, options.cursor.createdAt),
              gt(authEvents.id, options.cursor.id)
            )
          )
        : or(
            lt(authEvents.createdAt, options.cursor.createdAt),
            and(
              eq(authEvents.createdAt, options.cursor.createdAt),
              lt(authEvents.id, options.cursor.id)
            )
          )) ?? eq(authEvents.id, options.cursor.id);
    conditions.push(cursorCondition);
  }

  if (options.email) {
    conditions.push(eq(authEvents.email, options.email));
  }
  if (options.eventType) {
    conditions.push(eq(authEvents.eventType, options.eventType));
  }
  if (options.from) {
    conditions.push(gte(authEvents.createdAt, options.from));
  }
  if (options.to) {
    conditions.push(lte(authEvents.createdAt, options.to));
  }

  const whereClause =
    conditions.length === 1
      ? conditions[0]
      : conditions.length > 1
        ? and(...conditions)
        : undefined;

  const query = db.select().from(authEvents);
  if (whereClause) {
    query.where(whereClause);
  }

  const rows = await query
    .orderBy(
      order === 'asc' ? asc(authEvents.createdAt) : desc(authEvents.createdAt),
      order === 'asc' ? asc(authEvents.id) : desc(authEvents.id)
    )
    .limit(limit)
    .offset(offset);

  return options.direction === 'prev' ? rows.reverse() : rows;
}

export async function countAuthFailures(payload: {
  email: string;
  eventType: string;
  windowMinutes: number;
}) {
  const since = new Date(Date.now() - payload.windowMinutes * 60 * 1000);
  const [{ total = 0 }] = await db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(authEvents)
    .where(
      and(
        eq(authEvents.email, payload.email),
        eq(authEvents.eventType, payload.eventType),
        gte(authEvents.createdAt, since)
      )
    );

  return Number(total ?? 0);
}

export async function countAuthEventsByIp(payload: {
  ip: string;
  eventType: string;
}) {
  const [{ total = 0 }] = await db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(authEvents)
    .where(and(eq(authEvents.ip, payload.ip), eq(authEvents.eventType, payload.eventType)));

  return Number(total ?? 0);
}

export async function findLatestAuthEvent(payload: {
  userId?: number | null;
  email?: string | null;
  eventType: string;
}) {
  const conditions = [eq(authEvents.eventType, payload.eventType)];

  if (payload.userId) {
    conditions.push(eq(authEvents.userId, payload.userId));
  }
  if (payload.email) {
    conditions.push(eq(authEvents.email, payload.email));
  }

  const [event] = await db
    .select()
    .from(authEvents)
    .where(and(...conditions))
    .orderBy(desc(authEvents.createdAt), desc(authEvents.id))
    .limit(1);

  return event ?? null;
}
