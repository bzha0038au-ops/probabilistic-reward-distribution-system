import { db } from '../../db';
import { adminActions } from '@reward/database';
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
  type SQL,
} from '@reward/database/orm';

export async function recordAdminAction(payload: {
  adminId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(adminActions).values({
    adminId: payload.adminId ?? null,
    action: payload.action,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    ip: payload.ip ?? null,
    metadata: payload.metadata ?? null,
  });
}

export async function listAdminActions(options: {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  direction?: 'next' | 'prev';
  cursor?: { createdAt: Date; id: number } | null;
  adminId?: number | null;
  action?: string | null;
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
            gt(adminActions.createdAt, options.cursor.createdAt),
            and(
              eq(adminActions.createdAt, options.cursor.createdAt),
              gt(adminActions.id, options.cursor.id)
            )
          )
        : or(
            lt(adminActions.createdAt, options.cursor.createdAt),
            and(
              eq(adminActions.createdAt, options.cursor.createdAt),
              lt(adminActions.id, options.cursor.id)
            )
          )) ?? eq(adminActions.id, options.cursor.id);
    conditions.push(cursorCondition);
  }

  if (options.adminId) {
    conditions.push(eq(adminActions.adminId, options.adminId));
  }
  if (options.action) {
    conditions.push(eq(adminActions.action, options.action));
  }
  if (options.from) {
    conditions.push(gte(adminActions.createdAt, options.from));
  }
  if (options.to) {
    conditions.push(lte(adminActions.createdAt, options.to));
  }

  const whereClause =
    conditions.length === 1
      ? conditions[0]
      : conditions.length > 1
        ? and(...conditions)
        : undefined;

  const query = db.select().from(adminActions);
  if (whereClause) {
    query.where(whereClause);
  }

  const rows = await query
    .orderBy(
      order === 'asc' ? asc(adminActions.createdAt) : desc(adminActions.createdAt),
      order === 'asc' ? asc(adminActions.id) : desc(adminActions.id)
    )
    .limit(limit)
    .offset(offset);

  return options.direction === 'prev' ? rows.reverse() : rows;
}
