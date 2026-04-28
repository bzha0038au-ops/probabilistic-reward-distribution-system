import { adminActions, admins, deposits, users, withdrawals } from '@reward/database';
import { db } from '../../db';
import {
  aliasedTable as alias,
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

export type AdminActionPayload = {
  adminId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  ip?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AdminActionListItem = typeof adminActions.$inferSelect & {
  adminEmail: string | null;
  subjectUserId: number | null;
  subjectUserEmail: string | null;
};

type AdminAuditListOptions = {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  direction?: 'next' | 'prev';
  cursor?: { createdAt: Date; id: number } | null;
  adminId?: number | null;
  action?: string | null;
  userId?: number | null;
  from?: Date | null;
  to?: Date | null;
};

type AdminActionSummaryOptions = Omit<
  AdminAuditListOptions,
  'limit' | 'offset' | 'direction' | 'cursor'
> & {
  groupLimit?: number;
  dayLimit?: number;
};

type AdminActionSummary = {
  totalCount: number;
  byAdmin: Array<{
    adminId: number | null;
    adminEmail: string | null;
    count: number;
  }>;
  byAction: Array<{
    action: string;
    count: number;
  }>;
  byUser: Array<{
    userId: number | null;
    userEmail: string | null;
    count: number;
  }>;
  byDay: Array<{
    day: string;
    count: number;
  }>;
};

const buildAdminAuditJoins = () => {
  const adminRecord = alias(admins, 'audit_admin_record');
  const adminUser = alias(users, 'audit_admin_user');
  const directTargetUser = alias(users, 'audit_direct_target_user');
  const depositRecord = alias(deposits, 'audit_deposit_record');
  const depositUser = alias(users, 'audit_deposit_user');
  const withdrawalRecord = alias(withdrawals, 'audit_withdrawal_record');
  const withdrawalUser = alias(users, 'audit_withdrawal_user');

  return {
    adminRecord,
    adminUser,
    directTargetUser,
    depositRecord,
    depositUser,
    withdrawalRecord,
    withdrawalUser,
    subjectUserId: sql<number | null>`coalesce(
      ${directTargetUser.id},
      ${depositRecord.userId},
      ${withdrawalRecord.userId},
      nullif(${adminActions.metadata} ->> 'subjectUserId', '')::integer,
      nullif(${adminActions.metadata} ->> 'userId', '')::integer
    )`,
    subjectUserEmail: sql<string | null>`coalesce(
      ${directTargetUser.email},
      ${depositUser.email},
      ${withdrawalUser.email}
    )`,
  };
};

const buildWhereClause = (
  options: AdminAuditListOptions,
  subjectUserId: SQL<number | null>,
  order?: 'asc' | 'desc',
) => {
  const conditions: SQL[] = [];

  if (options.cursor && order) {
    const cursorCondition =
      (order === 'asc'
        ? or(
            gt(adminActions.createdAt, options.cursor.createdAt),
            and(
              eq(adminActions.createdAt, options.cursor.createdAt),
              gt(adminActions.id, options.cursor.id),
            ),
          )
        : or(
            lt(adminActions.createdAt, options.cursor.createdAt),
            and(
              eq(adminActions.createdAt, options.cursor.createdAt),
              lt(adminActions.id, options.cursor.id),
            ),
          )) ?? eq(adminActions.id, options.cursor.id);
    conditions.push(cursorCondition);
  }

  if (options.adminId) {
    conditions.push(eq(adminActions.adminId, options.adminId));
  }
  if (options.action) {
    conditions.push(eq(adminActions.action, options.action));
  }
  if (options.userId) {
    conditions.push(sql`${subjectUserId} = ${options.userId}`);
  }
  if (options.from) {
    conditions.push(gte(adminActions.createdAt, options.from));
  }
  if (options.to) {
    conditions.push(lte(adminActions.createdAt, options.to));
  }

  return conditions.length === 1
    ? conditions[0]
    : conditions.length > 1
      ? and(...conditions)
      : undefined;
};

export async function recordAdminAction(payload: AdminActionPayload) {
  await db.insert(adminActions).values({
    adminId: payload.adminId ?? null,
    action: payload.action,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    ip: payload.ip ?? null,
    sessionId: payload.sessionId ?? null,
    userAgent: payload.userAgent ?? null,
    metadata: payload.metadata ?? null,
  });
}

export async function listAdminActions(
  options: AdminAuditListOptions = {},
): Promise<AdminActionListItem[]> {
  const limit = options.limit ?? 50;
  const offset = options.cursor ? 0 : (options.offset ?? 0);
  const requestedOrder = options.order === 'asc' ? 'asc' : 'desc';
  const order =
    options.direction === 'prev'
      ? requestedOrder === 'asc'
        ? 'desc'
        : 'asc'
      : requestedOrder;
  const joins = buildAdminAuditJoins();
  const whereClause = buildWhereClause(options, joins.subjectUserId, order);

  const query = db
    .select({
      id: adminActions.id,
      adminId: adminActions.adminId,
      adminEmail: joins.adminUser.email,
      action: adminActions.action,
      targetType: adminActions.targetType,
      targetId: adminActions.targetId,
      subjectUserId: joins.subjectUserId,
      subjectUserEmail: joins.subjectUserEmail,
      ip: adminActions.ip,
      sessionId: adminActions.sessionId,
      userAgent: adminActions.userAgent,
      metadata: adminActions.metadata,
      createdAt: adminActions.createdAt,
    })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    );

  if (whereClause) {
    query.where(whereClause);
  }

  const rows = await query
    .orderBy(
      order === 'asc' ? asc(adminActions.createdAt) : desc(adminActions.createdAt),
      order === 'asc' ? asc(adminActions.id) : desc(adminActions.id),
    )
    .limit(limit)
    .offset(offset);

  return options.direction === 'prev' ? rows.reverse() : rows;
}

export async function summarizeAdminActions(
  options: AdminActionSummaryOptions = {},
): Promise<AdminActionSummary> {
  const joins = buildAdminAuditJoins();
  const whereClause = buildWhereClause(options, joins.subjectUserId);
  const groupLimit = Math.min(Math.max(options.groupLimit ?? 8, 1), 25);
  const dayLimit = Math.min(Math.max(options.dayLimit ?? 14, 1), 31);
  const totalCountExpr = sql<number>`count(*)`;
  const byAdminCountExpr = sql<number>`count(*)`;
  const byActionCountExpr = sql<number>`count(*)`;
  const byUserCountExpr = sql<number>`count(*)`;
  const byDayCountExpr = sql<number>`count(*)`;
  const dayBucketExpr = sql<string>`to_char(date_trunc('day', ${adminActions.createdAt}), 'YYYY-MM-DD')`;

  const totalQuery = db
    .select({ totalCount: totalCountExpr })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    );

  if (whereClause) {
    totalQuery.where(whereClause);
  }

  const byAdminQuery = db
    .select({
      adminId: adminActions.adminId,
      adminEmail: joins.adminUser.email,
      count: byAdminCountExpr,
    })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    );

  if (whereClause) {
    byAdminQuery.where(whereClause);
  }

  const byActionQuery = db
    .select({
      action: adminActions.action,
      count: byActionCountExpr,
    })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    );

  if (whereClause) {
    byActionQuery.where(whereClause);
  }

  const byUserConditions = whereClause
    ? and(whereClause, sql`${joins.subjectUserId} is not null`)
    : sql`${joins.subjectUserId} is not null`;

  const byUserQuery = db
    .select({
      userId: joins.subjectUserId,
      userEmail: joins.subjectUserEmail,
      count: byUserCountExpr,
    })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    )
    .where(byUserConditions);

  const byDayQuery = db
    .select({
      day: dayBucketExpr,
      count: byDayCountExpr,
    })
    .from(adminActions)
    .leftJoin(joins.adminRecord, eq(adminActions.adminId, joins.adminRecord.id))
    .leftJoin(joins.adminUser, eq(joins.adminRecord.userId, joins.adminUser.id))
    .leftJoin(
      joins.directTargetUser,
      and(
        eq(adminActions.targetType, 'user'),
        eq(adminActions.targetId, joins.directTargetUser.id),
      ),
    )
    .leftJoin(
      joins.depositRecord,
      and(
        eq(adminActions.targetType, 'deposit'),
        eq(adminActions.targetId, joins.depositRecord.id),
      ),
    )
    .leftJoin(joins.depositUser, eq(joins.depositRecord.userId, joins.depositUser.id))
    .leftJoin(
      joins.withdrawalRecord,
      and(
        eq(adminActions.targetType, 'withdrawal'),
        eq(adminActions.targetId, joins.withdrawalRecord.id),
      ),
    )
    .leftJoin(
      joins.withdrawalUser,
      eq(joins.withdrawalRecord.userId, joins.withdrawalUser.id),
    );

  if (whereClause) {
    byDayQuery.where(whereClause);
  }

  const [totalRows, adminRows, actionRows, userRows, dayRows] = await Promise.all([
    totalQuery,
    byAdminQuery
      .groupBy(adminActions.adminId, joins.adminUser.email)
      .orderBy(desc(byAdminCountExpr), asc(adminActions.adminId))
      .limit(groupLimit),
    byActionQuery
      .groupBy(adminActions.action)
      .orderBy(desc(byActionCountExpr), asc(adminActions.action))
      .limit(groupLimit),
    byUserQuery
      .groupBy(joins.subjectUserId, joins.subjectUserEmail)
      .orderBy(desc(byUserCountExpr), asc(joins.subjectUserId))
      .limit(groupLimit),
    byDayQuery
      .groupBy(dayBucketExpr)
      .orderBy(desc(dayBucketExpr))
      .limit(dayLimit),
  ]);

  return {
    totalCount: Number(totalRows[0]?.totalCount ?? 0),
    byAdmin: adminRows.map((row) => ({
      adminId: row.adminId,
      adminEmail: row.adminEmail,
      count: Number(row.count ?? 0),
    })),
    byAction: actionRows.map((row) => ({
      action: row.action,
      count: Number(row.count ?? 0),
    })),
    byUser: userRows.map((row) => ({
      userId: row.userId,
      userEmail: row.userEmail,
      count: Number(row.count ?? 0),
    })),
    byDay: dayRows
      .map((row) => ({
        day: row.day,
        count: Number(row.count ?? 0),
      }))
      .reverse(),
  };
}
