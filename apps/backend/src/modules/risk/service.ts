import { createHash } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  ne,
  or,
  sql,
} from '@reward/database/orm';
import type {
  DeviceFingerprintEntrypoint,
  UserFreezeCategory,
  UserFreezeReason,
  UserFreezeScope,
} from '@reward/shared-types/risk';

import type { DbClient, DbTransaction } from '../../db';
import { db } from '../../db';
import {
  authEvents,
  authSessions,
  cryptoWithdrawAddresses,
  deviceFingerprints,
  fiatPayoutMethods,
  freezeRecords,
  payoutMethods,
  riskTableInteractionEvents,
  riskTableInteractionPairs,
  suspiciousAccounts,
  users,
} from '@reward/database';
import { getAntiAbuseConfig, getWithdrawalRiskConfig } from '../system/service';
import { revokeAuthSessions } from '../session/service';
import { logger } from '../../shared/logger';

type FreezeScopeFilter =
  | UserFreezeScope
  | readonly UserFreezeScope[]
  | null
  | undefined;

const buildFreezeScopeFilter = (scope: FreezeScopeFilter) => {
  if (!scope) {
    return null;
  }

  const scopes = Array.isArray(scope) ? [...new Set(scope)] : [scope];
  if (scopes.length === 0) {
    return null;
  }

  return scopes.length === 1
    ? eq(freezeRecords.scope, scopes[0])
    : inArray(freezeRecords.scope, scopes);
};

const inferFreezeCategory = (reason: UserFreezeReason): UserFreezeCategory => {
  switch (reason) {
    case 'pending_kyc':
    case 'aml_review':
    case 'jurisdiction_restriction':
    case 'underage_restriction':
      return 'compliance';
    case 'account_lock':
    case 'auth_failure':
      return 'security';
    case 'manual_admin':
      return 'support';
    case 'forum_moderation':
      return 'community';
    case 'withdrawal_lock':
    case 'gameplay_lock':
    default:
      return 'risk';
  }
};

export async function isUserFrozen(
  userId: number,
  options: { scope?: FreezeScopeFilter } = {}
) {
  const scopeFilter = buildFreezeScopeFilter(options.scope);
  const [record] = await db
    .select({ id: freezeRecords.id })
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.userId, userId),
        eq(freezeRecords.status, 'active'),
        ...(scopeFilter ? [scopeFilter] : [])
      )
    )
    .limit(1);

  return Boolean(record?.id);
}

export async function ensureUserFreeze(
  payload: {
    userId: number;
    category?: UserFreezeCategory | null;
    reason?: UserFreezeReason | null;
    scope?: UserFreezeScope | null;
    metadata?: Record<string, unknown> | null;
  },
  options: {
    executor?: DbExecutor;
  } = {}
) {
  const executor = options.executor ?? db;
  const reason = payload.reason ?? 'manual_admin';
  const category = payload.category ?? inferFreezeCategory(reason);
  const scope = payload.scope ?? 'account_lock';
  const existing = await executor
    .select()
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.userId, payload.userId),
        eq(freezeRecords.scope, scope),
        eq(freezeRecords.status, 'active')
      )
    )
    .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
    .limit(1);

  const record =
    existing[0]
      ? await executor
          .update(freezeRecords)
          .set({
            category,
            reason,
            metadata: payload.metadata ?? null,
          })
          .where(eq(freezeRecords.id, existing[0].id))
          .returning()
          .then((rows) => rows[0] ?? existing[0])
      : await executor
          .insert(freezeRecords)
          .values({
            userId: payload.userId,
            category,
            reason,
            scope,
            status: 'active',
            metadata: payload.metadata ?? null,
          })
          .returning()
          .then((rows) => rows[0] ?? null);

  if (scope === 'account_lock') {
    await revokeAuthSessions({
      userId: payload.userId,
      kind: 'user',
      reason: 'account_locked',
      eventType: 'user_sessions_revoked_all',
      metadata: {
        freezeCategory: category,
        freezeReason: reason,
        freezeScope: scope,
        ...(payload.metadata ?? {}),
      },
    });
    await revokeAuthSessions({
      userId: payload.userId,
      kind: 'admin',
      reason: 'account_locked',
      eventType: 'admin_sessions_revoked_all',
      metadata: {
        freezeCategory: category,
        freezeReason: reason,
        freezeScope: scope,
        ...(payload.metadata ?? {}),
      },
    });
  }

  return record;
}

type DbExecutor = DbClient | DbTransaction;

const TABLE_INTERACTION_SHARED_IP_SCORE = 1;
const TABLE_INTERACTION_SHARED_DEVICE_SCORE = 2;
const TABLE_INTERACTION_REPEAT_THRESHOLD = 5;
const TABLE_INTERACTION_REPEAT_SCORE = 1;
const DEFAULT_COLLUSION_WINDOW_DAYS = 14;
const DEFAULT_COLLUSION_SERIES_LIMIT = 8;
const DEFAULT_COLLUSION_TOP_LIMIT = 10;
const MANUAL_COLLUSION_REASON = 'manual_collusion_review';
const MANUAL_COLLUSION_SOURCE = 'admin_collusion_dashboard';

type TableInteractionSessionSnapshot = {
  userId: number;
  ipFingerprint: string | null;
  deviceFingerprint: string | null;
};

type TableInteractionPairSignal = {
  userAId: number;
  userBId: number;
  sharedIp: boolean;
  sharedDevice: boolean;
  repeatedTable: boolean;
  interactionCount: number;
  suspicionScore: number;
  scoreDelta: number;
};

type SuspiciousAccountMetadata = Record<string, unknown>;

type RiskUserStatus = {
  userId: number;
  email: string | null;
  isFrozen: boolean;
  freezeReason: UserFreezeReason | null;
  hasOpenRiskFlag: boolean;
  manualFlagged: boolean;
  riskReason: string | null;
  riskScore: number;
};

type DeviceFingerprintActivity = {
  fingerprint: string;
  source: 'client_header' | 'server_derived';
  sharedDeviceUserCount: number;
  sharedIpUserCount: number;
};

type UserAssociationSignalKind = 'device' | 'ip' | 'payout';

type UserAssociationSummary = {
  deviceCount: number;
  ipCount: number;
  payoutCount: number;
  relatedUserCount: number;
  flaggedRelatedUserCount: number;
};

type UserAssociationSignal = {
  id: string;
  kind: UserAssociationSignalKind;
  label: string;
  fingerprint: string | null;
  value: string;
  eventCount: number;
  userCount: number;
  lastSeenAt: Date | null;
  activityTypes: string[];
  relatedUsers: RiskUserStatus[];
};

type UserAssociationRelatedUser = RiskUserStatus & {
  relationTypes: UserAssociationSignalKind[];
  sharedDevices: string[];
  sharedIps: string[];
  sharedPayouts: string[];
};

type UserAssociationGraphNode = {
  id: string;
  type: 'focus_user' | 'user' | 'device' | 'ip' | 'payout';
  label: string;
  subtitle: string | null;
};

type UserAssociationGraphEdge = {
  source: string;
  target: string;
  type:
    | 'focus_device'
    | 'focus_ip'
    | 'focus_payout'
    | 'shared_device'
    | 'shared_ip'
    | 'shared_payout';
  label: string;
};

type SuspiciousAssociationSnapshot = {
  updatedAt: string;
  summary: UserAssociationSummary;
  relatedUserIds: number[];
  deviceSignals: Array<{ fingerprint: string; userCount: number }>;
  ipSignals: Array<{ value: string; userCount: number }>;
  payoutSignals: Array<{ value: string; userCount: number }>;
};

type CollusionTimelineBucket = {
  deltaScore: number;
  eventCount: number;
};

type CollusionTimelineAccumulator = {
  entityKey: string;
  entityType: 'user' | 'device';
  label: string;
  fingerprint: string | null;
  userId: number | null;
  totalScore: number;
  eventCount: number;
  lastSeenAt: number;
  buckets: Map<string, CollusionTimelineBucket>;
};

type CollusionClusterAccumulator = {
  fingerprint: string;
  label: string;
  userIds: Set<number>;
  pairEventCount: number;
  totalScore: number;
  lastSeenAt: number;
};

type ParsedTableInteractionEvent = {
  tableId: string;
  recordedAt: Date;
  participants: TableInteractionSessionSnapshot[];
  pairSignals: TableInteractionPairSignal[];
};

const normalizeSignalValue = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized === '' ? null : normalized;
};

const buildFingerprint = (value: string | null) =>
  value ? createHash('sha256').update(value).digest('hex') : null;

const buildDeviceFingerprint = (
  ip: string | null,
  userAgent: string | null
) => (ip && userAgent ? buildFingerprint(`${ip}::${userAgent}`) : null);

const buildClientDeviceFingerprint = (value: string) =>
  createHash('sha256').update(`client::${value}`).digest('hex');

const buildServerDerivedDeviceFingerprint = (
  ip: string | null,
  userAgent: string | null
) =>
  ip && userAgent
    ? createHash('sha256').update(`derived::${ip}::${userAgent}`).digest('hex')
    : null;

const normalizeTableUserIds = (userIds: number[]) =>
  [...new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0))].sort(
    (left, right) => left - right
  );

const clampPositiveInt = (value: number | undefined, fallback: number, max: number) => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || Number(value) <= 0) {
    return fallback;
  }

  return Math.min(Number(value), max);
};

const toMetadataRecord = (value: unknown): SuspiciousAccountMetadata =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SuspiciousAccountMetadata)
    : {};

const readStringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readNumberValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const readBooleanValue = (value: unknown) => value === true;

const normalizeLookup = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? '';

const formatFingerprintLabel = (kind: 'ip' | 'device', fingerprint: string) =>
  `${kind === 'ip' ? 'IP' : 'Device'} ${fingerprint.slice(0, 12)}`;

const formatPayoutLabel = (kind: 'bank_account' | 'crypto_address', value: string) =>
  kind === 'bank_account' ? `Card ${value}` : `Wallet ${value}`;

const normalizeDeviceFingerprintHeader = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? '';
  if (normalized === '') {
    return null;
  }

  return normalized.slice(0, 512);
};

const buildFallbackRiskUserStatus = (userId: number): RiskUserStatus => ({
  userId,
  email: null,
  isFrozen: false,
  freezeReason: null,
  hasOpenRiskFlag: false,
  manualFlagged: false,
  riskReason: null,
  riskScore: 0,
});

const getRiskUserStatus = (userStateMap: Map<number, RiskUserStatus>, userId: number) =>
  userStateMap.get(userId) ?? buildFallbackRiskUserStatus(userId);

const buildSuspiciousMetadata = (value: unknown) => {
  const metadata = toMetadataRecord(value);
  return {
    raw: metadata,
    score: readNumberValue(Reflect.get(metadata, 'score')),
    manualFlagged: readBooleanValue(Reflect.get(metadata, 'manualFlagged')),
    manualFlagSource: readStringValue(Reflect.get(metadata, 'manualFlagSource')),
  };
};

const parseParticipants = (value: unknown): TableInteractionSessionSnapshot[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const participants: TableInteractionSessionSnapshot[] = [];
  for (const item of value) {
    const record = toMetadataRecord(item);
    const userId = Number(Reflect.get(record, 'userId'));
    if (!Number.isInteger(userId) || userId <= 0) {
      continue;
    }

    participants.push({
      userId,
      ipFingerprint: readStringValue(Reflect.get(record, 'ipFingerprint')),
      deviceFingerprint: readStringValue(Reflect.get(record, 'deviceFingerprint')),
    });
  }

  return participants;
};

const parsePairSignals = (value: unknown): TableInteractionPairSignal[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const signals: TableInteractionPairSignal[] = [];
  for (const item of value) {
    const record = toMetadataRecord(item);
    const userAId = Number(Reflect.get(record, 'userAId'));
    const userBId = Number(Reflect.get(record, 'userBId'));
    if (!Number.isInteger(userAId) || userAId <= 0 || !Number.isInteger(userBId) || userBId <= 0) {
      continue;
    }

    signals.push({
      userAId,
      userBId,
      sharedIp: readBooleanValue(Reflect.get(record, 'sharedIp')),
      sharedDevice: readBooleanValue(Reflect.get(record, 'sharedDevice')),
      repeatedTable: readBooleanValue(Reflect.get(record, 'repeatedTable')),
      interactionCount: readNumberValue(Reflect.get(record, 'interactionCount')),
      suspicionScore: readNumberValue(Reflect.get(record, 'suspicionScore')),
      scoreDelta: readNumberValue(Reflect.get(record, 'scoreDelta')),
    });
  }

  return signals;
};

const parseTableInteractionEvent = (row: {
  tableId: string;
  metadata: unknown;
  recordedAt: Date;
}): ParsedTableInteractionEvent => {
  const metadata = toMetadataRecord(row.metadata);
  return {
    tableId: row.tableId,
    recordedAt: row.recordedAt,
    participants: parseParticipants(Reflect.get(metadata, 'participants')),
    pairSignals: parsePairSignals(Reflect.get(metadata, 'pairSignals')),
  };
};

async function buildRiskUserStateMap(userIds: number[]) {
  const normalizedUserIds = normalizeTableUserIds(userIds);
  if (normalizedUserIds.length === 0) {
    return new Map<number, RiskUserStatus>();
  }

  const [userRows, freezeRows, suspiciousRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, normalizedUserIds)),
    db
      .select({
        userId: freezeRecords.userId,
        reason: freezeRecords.reason,
        createdAt: freezeRecords.createdAt,
      })
      .from(freezeRecords)
      .where(
        and(
          inArray(freezeRecords.userId, normalizedUserIds),
          eq(freezeRecords.status, 'active')
        )
      )
      .orderBy(desc(freezeRecords.createdAt)),
    db
      .select({
        userId: suspiciousAccounts.userId,
        reason: suspiciousAccounts.reason,
        metadata: suspiciousAccounts.metadata,
        createdAt: suspiciousAccounts.createdAt,
      })
      .from(suspiciousAccounts)
      .where(
        and(
          inArray(suspiciousAccounts.userId, normalizedUserIds),
          eq(suspiciousAccounts.status, 'open')
        )
      )
      .orderBy(desc(suspiciousAccounts.createdAt)),
  ]);

  const userStateMap = new Map<number, RiskUserStatus>();
  for (const row of userRows) {
    userStateMap.set(row.userId, {
      userId: row.userId,
      email: row.email,
      isFrozen: false,
      freezeReason: null,
      hasOpenRiskFlag: false,
      manualFlagged: false,
      riskReason: null,
      riskScore: 0,
    });
  }

  for (const row of freezeRows) {
    const existing = getRiskUserStatus(userStateMap, row.userId);
    if (existing.isFrozen) {
      continue;
    }

    userStateMap.set(row.userId, {
      ...existing,
      isFrozen: true,
      freezeReason: row.reason,
    });
  }

  for (const row of suspiciousRows) {
    const existing = getRiskUserStatus(userStateMap, row.userId);
    if (existing.hasOpenRiskFlag) {
      continue;
    }

    const metadata = buildSuspiciousMetadata(row.metadata);
    userStateMap.set(row.userId, {
      ...existing,
      hasOpenRiskFlag: true,
      manualFlagged: metadata.manualFlagged,
      riskReason: row.reason,
      riskScore: metadata.score,
    });
  }

  return userStateMap;
}

const upsertTimelineScore = (
  timelines: Map<string, CollusionTimelineAccumulator>,
  params: {
    entityKey: string;
    entityType: 'user' | 'device';
    label: string;
    fingerprint?: string | null;
    userId?: number | null;
    scoreDelta: number;
    recordedAt: Date;
  }
) => {
  if (params.scoreDelta <= 0) {
    return;
  }

  const bucketKey = params.recordedAt.toISOString().slice(0, 10);
  const recordedAtMs = params.recordedAt.getTime();
  const accumulator =
    timelines.get(params.entityKey) ??
    {
      entityKey: params.entityKey,
      entityType: params.entityType,
      label: params.label,
      fingerprint: params.fingerprint ?? null,
      userId: params.userId ?? null,
      totalScore: 0,
      eventCount: 0,
      lastSeenAt: recordedAtMs,
      buckets: new Map<string, CollusionTimelineBucket>(),
    };

  const bucket = accumulator.buckets.get(bucketKey) ?? {
    deltaScore: 0,
    eventCount: 0,
  };

  bucket.deltaScore += params.scoreDelta;
  bucket.eventCount += 1;
  accumulator.totalScore += params.scoreDelta;
  accumulator.eventCount += 1;
  accumulator.lastSeenAt = Math.max(accumulator.lastSeenAt, recordedAtMs);
  accumulator.buckets.set(bucketKey, bucket);
  timelines.set(params.entityKey, accumulator);
};

const upsertCluster = (
  clusters: Map<string, CollusionClusterAccumulator>,
  params: {
    kind: 'ip' | 'device';
    fingerprint: string;
    scoreDelta: number;
    recordedAt: Date;
    userIds: number[];
  }
) => {
  const recordedAtMs = params.recordedAt.getTime();
  const accumulator =
    clusters.get(params.fingerprint) ??
    {
      fingerprint: params.fingerprint,
      label: formatFingerprintLabel(params.kind, params.fingerprint),
      userIds: new Set<number>(),
      pairEventCount: 0,
      totalScore: 0,
      lastSeenAt: recordedAtMs,
    };

  for (const userId of params.userIds) {
    accumulator.userIds.add(userId);
  }

  accumulator.pairEventCount += 1;
  accumulator.totalScore += Math.max(0, params.scoreDelta);
  accumulator.lastSeenAt = Math.max(accumulator.lastSeenAt, recordedAtMs);
  clusters.set(params.fingerprint, accumulator);
};

const buildTimelineSeries = (
  timelines: Map<string, CollusionTimelineAccumulator>,
  userStateMap: Map<number, RiskUserStatus>,
  limit: number
) =>
  [...timelines.values()]
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        right.eventCount - left.eventCount ||
        right.lastSeenAt - left.lastSeenAt
    )
    .slice(0, limit)
    .map((timeline) => {
      let cumulativeScore = 0;
      const points = [...timeline.buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, value]) => {
          cumulativeScore += value.deltaScore;
          return {
            bucket,
            deltaScore: value.deltaScore,
            cumulativeScore,
            eventCount: value.eventCount,
          };
        });

      return {
        entityKey: timeline.entityKey,
        entityType: timeline.entityType,
        label: timeline.label,
        fingerprint: timeline.fingerprint,
        user:
          timeline.userId === null ? null : getRiskUserStatus(userStateMap, timeline.userId),
        totalScore: timeline.totalScore,
        eventCount: timeline.eventCount,
        lastSeenAt: new Date(timeline.lastSeenAt),
        points,
      };
    });

const buildClusterList = (
  clusters: Map<string, CollusionClusterAccumulator>,
  userStateMap: Map<number, RiskUserStatus>,
  limit: number
) =>
  [...clusters.values()]
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        right.pairEventCount - left.pairEventCount ||
        right.lastSeenAt - left.lastSeenAt
    )
    .slice(0, limit)
    .map((cluster) => ({
      fingerprint: cluster.fingerprint,
      label: cluster.label,
      pairEventCount: cluster.pairEventCount,
      userCount: cluster.userIds.size,
      totalScore: cluster.totalScore,
      lastSeenAt: new Date(cluster.lastSeenAt),
      users: [...cluster.userIds]
        .sort((left, right) => left - right)
        .map((userId) => getRiskUserStatus(userStateMap, userId)),
    }));

const getFreezeScopeForEntrypoint = (
  entrypoint: DeviceFingerprintEntrypoint
): UserFreezeScope =>
  entrypoint === 'withdrawal'
    ? 'withdrawal_lock'
    : entrypoint === 'bet'
      ? 'gameplay_lock'
      : 'account_lock';

const resolveDeviceFingerprintActivity = (payload: {
  deviceFingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) => {
  const providedFingerprint = normalizeDeviceFingerprintHeader(
    payload.deviceFingerprint
  )?.toLowerCase();
  if (providedFingerprint) {
    return {
      fingerprint: buildClientDeviceFingerprint(providedFingerprint),
      source: 'client_header' as const,
    };
  }

  const derivedFingerprint = buildServerDerivedDeviceFingerprint(
    normalizeSignalValue(payload.ip),
    payload.userAgent?.trim() ? payload.userAgent.trim() : null
  );
  if (!derivedFingerprint) {
    return null;
  }

  return {
    fingerprint: derivedFingerprint,
    source: 'server_derived' as const,
  };
};

export async function recordDeviceFingerprintActivity(
  payload: {
    userId: number;
    deviceFingerprint?: string | null;
    entrypoint: DeviceFingerprintEntrypoint;
    activityType: string;
    ip?: string | null;
    userAgent?: string | null;
    sessionId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  executor: DbExecutor = db
): Promise<DeviceFingerprintActivity | null> {
  const resolved = resolveDeviceFingerprintActivity(payload);
  if (!resolved) {
    return null;
  }

  const now = new Date();
  const normalizedIp = normalizeSignalValue(payload.ip);
  const userAgent = payload.userAgent?.trim() ? payload.userAgent.trim() : null;
  const sessionId = payload.sessionId?.trim() ? payload.sessionId.trim() : null;
  const activityType = payload.activityType.trim().slice(0, 64);
  if (activityType === '') {
    return null;
  }

  const [existing] = await executor
    .select({
      id: deviceFingerprints.id,
      eventCount: deviceFingerprints.eventCount,
      metadata: deviceFingerprints.metadata,
    })
    .from(deviceFingerprints)
    .where(
      and(
        eq(deviceFingerprints.userId, payload.userId),
        eq(deviceFingerprints.fingerprint, resolved.fingerprint),
        eq(deviceFingerprints.activityType, activityType)
      )
    )
    .limit(1);

  const nextMetadata = {
    ...toMetadataRecord(existing?.metadata),
    source: resolved.source,
    ...(payload.metadata ?? {}),
  };

  if (existing) {
    await executor
      .update(deviceFingerprints)
      .set({
        entrypoint: payload.entrypoint,
        sessionId,
        ip: normalizedIp,
        userAgent,
        eventCount: existing.eventCount + 1,
        metadata: nextMetadata,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(deviceFingerprints.id, existing.id));
  } else {
    await executor.insert(deviceFingerprints).values({
      userId: payload.userId,
      fingerprint: resolved.fingerprint,
      entrypoint: payload.entrypoint,
      activityType,
      sessionId,
      ip: normalizedIp,
      userAgent,
      eventCount: 1,
      metadata: nextMetadata,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [sharedDeviceRow] = await executor
    .select({
      total: sql<number>`count(distinct ${deviceFingerprints.userId})`,
    })
    .from(deviceFingerprints)
    .where(eq(deviceFingerprints.fingerprint, resolved.fingerprint));

  const sharedIpUserCount = normalizedIp
    ? await executor
        .select({
          total: sql<number>`count(distinct ${deviceFingerprints.userId})`,
        })
        .from(deviceFingerprints)
        .where(eq(deviceFingerprints.ip, normalizedIp))
        .then((rows) => Number(rows[0]?.total ?? 0))
    : 0;

  return {
    fingerprint: resolved.fingerprint,
    source: resolved.source,
    sharedDeviceUserCount: Number(sharedDeviceRow?.total ?? 0),
    sharedIpUserCount,
  };
}

export async function trackUserDeviceFingerprint(
  payload: {
    userId: number;
    deviceFingerprint?: string | null;
    entrypoint: DeviceFingerprintEntrypoint;
    activityType: string;
    ip?: string | null;
    userAgent?: string | null;
    sessionId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  executor: DbExecutor = db
) {
  try {
    const activity = await recordDeviceFingerprintActivity(payload, executor);
    if (!activity) {
      return null;
    }

    const riskConfig = await getWithdrawalRiskConfig(executor);
    const sharedDeviceThreshold = Math.max(
      2,
      Number(riskConfig.sharedDeviceUserThreshold)
    );
    const sharedIpThreshold = Math.max(
      2,
      Number(riskConfig.sharedIpUserThreshold)
    );
    const freezeScope = getFreezeScopeForEntrypoint(payload.entrypoint);

    if (activity.sharedDeviceUserCount >= sharedDeviceThreshold) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: `shared_device_fingerprint_${payload.entrypoint}_cluster`,
          score: 2,
          freezeScope,
          metadata: {
            deviceFingerprint: activity.fingerprint,
            fingerprintSource: activity.source,
            sharedDeviceUserCount: activity.sharedDeviceUserCount,
            activityType: payload.activityType,
            entrypoint: payload.entrypoint,
          },
        },
        executor
      );
    }

    if (activity.sharedIpUserCount >= sharedIpThreshold) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: `shared_ip_${payload.entrypoint}_cluster`,
          score: 1,
          freezeScope,
          metadata: {
            ip: normalizeSignalValue(payload.ip),
            sharedIpUserCount: activity.sharedIpUserCount,
            activityType: payload.activityType,
            entrypoint: payload.entrypoint,
          },
        },
        executor
      );
    }

    return activity;
  } catch (error) {
    logger.warning('failed to track device fingerprint activity', {
      err: error,
      userId: payload.userId,
      entrypoint: payload.entrypoint,
      activityType: payload.activityType,
    });
    return null;
  }
}

const LOGIN_EVENT_TYPES = [
  'user_login_success',
  'user_login_anomaly',
  'user_login_blocked',
] as const;

const buildPayoutIdentity = (row: {
  methodType: string | null;
  accountName: string | null;
  bankName: string | null;
  brand: string | null;
  accountLast4: string | null;
  address: string | null;
  network: string | null;
  token: string | null;
}) => {
  if (row.methodType === 'bank_account' && row.accountLast4) {
    const accountName = normalizeLookup(row.accountName);
    const bankName = normalizeLookup(row.bankName);
    const brand = normalizeLookup(row.brand);
    const last4 = row.accountLast4.trim();
    const fingerprint = buildFingerprint(
      `bank:${accountName}:${bankName}:${brand}:${last4}`
    );

    return fingerprint
      ? {
          kind: 'bank_account' as const,
          fingerprint,
          value: last4,
          label: formatPayoutLabel('bank_account', `****${last4}`),
        }
      : null;
  }

  if (row.methodType === 'crypto_address' && row.address) {
    const address = normalizeLookup(row.address);
    const fingerprint = buildFingerprint(`crypto:${address}`);
    const suffix = row.address.slice(-8);
    const prefix = row.address.slice(0, 6);
    return fingerprint
      ? {
          kind: 'crypto_address' as const,
          fingerprint,
          value: address,
          label: formatPayoutLabel('crypto_address', `${prefix}...${suffix}`),
        }
      : null;
  }

  return null;
};

const createSignalAccumulator = (params: {
  kind: UserAssociationSignalKind;
  id: string;
  label: string;
  fingerprint?: string | null;
  value: string;
}) => ({
  kind: params.kind,
  id: params.id,
  label: params.label,
  fingerprint: params.fingerprint ?? null,
  value: params.value,
  eventCount: 0,
  lastSeenAt: null as Date | null,
  activityTypes: new Set<string>(),
  relatedUserIds: new Set<number>(),
});

const toSortedAssociationSignals = (
  map: Map<
    string,
    ReturnType<typeof createSignalAccumulator>
  >,
  userStateMap: Map<number, RiskUserStatus>
): UserAssociationSignal[] =>
  [...map.values()]
    .sort(
      (left, right) =>
        right.relatedUserIds.size - left.relatedUserIds.size ||
        right.eventCount - left.eventCount ||
        (right.lastSeenAt?.getTime() ?? 0) - (left.lastSeenAt?.getTime() ?? 0)
    )
    .map((value) => ({
      id: value.id,
      kind: value.kind,
      label: value.label,
      fingerprint: value.fingerprint,
      value: value.value,
      eventCount: value.eventCount,
      userCount: value.relatedUserIds.size + 1,
      lastSeenAt: value.lastSeenAt,
      activityTypes: [...value.activityTypes].sort((left, right) =>
        left.localeCompare(right)
      ),
      relatedUsers: [...value.relatedUserIds]
        .sort((left, right) => left - right)
        .map((userId) => getRiskUserStatus(userStateMap, userId)),
    }));

export async function getUserAssociationGraph(
  userId: number,
  options: {
    days?: number;
    signalLimit?: number;
  } = {},
  executor: DbExecutor = db
) {
  const windowDays = clampPositiveInt(options.days, 90, 365);
  const signalLimit = clampPositiveInt(options.signalLimit, 12, 24);
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [focusUser] = await executor
    .select({
      userId: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!focusUser) {
    return null;
  }

  const [deviceRows, authIpRows, payoutRows] = await Promise.all([
    executor
      .select({
        fingerprint: deviceFingerprints.fingerprint,
        ip: deviceFingerprints.ip,
        eventCount: deviceFingerprints.eventCount,
        lastSeenAt: deviceFingerprints.lastSeenAt,
        activityType: deviceFingerprints.activityType,
      })
      .from(deviceFingerprints)
      .where(
        and(
          eq(deviceFingerprints.userId, userId),
          gte(deviceFingerprints.lastSeenAt, cutoff)
        )
      )
      .orderBy(desc(deviceFingerprints.lastSeenAt), desc(deviceFingerprints.id))
      .limit(128),
    executor
      .select({
        ip: authEvents.ip,
        createdAt: authEvents.createdAt,
      })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.userId, userId),
          inArray(authEvents.eventType, [...LOGIN_EVENT_TYPES]),
          gte(authEvents.createdAt, cutoff)
        )
      )
      .orderBy(desc(authEvents.createdAt), desc(authEvents.id))
      .limit(128),
    executor
      .select({
        methodType: payoutMethods.methodType,
        accountName: fiatPayoutMethods.accountName,
        bankName: fiatPayoutMethods.bankName,
        brand: fiatPayoutMethods.brand,
        accountLast4: fiatPayoutMethods.accountLast4,
        address: cryptoWithdrawAddresses.address,
        network: cryptoWithdrawAddresses.network,
        token: cryptoWithdrawAddresses.token,
      })
      .from(payoutMethods)
      .leftJoin(
        fiatPayoutMethods,
        eq(fiatPayoutMethods.payoutMethodId, payoutMethods.id)
      )
      .leftJoin(
        cryptoWithdrawAddresses,
        eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethods.id)
      )
      .where(eq(payoutMethods.userId, userId)),
  ]);

  const deviceSignalMap = new Map<
    string,
    ReturnType<typeof createSignalAccumulator>
  >();
  for (const row of deviceRows) {
    const accumulator =
      deviceSignalMap.get(row.fingerprint) ??
      createSignalAccumulator({
        kind: 'device',
        id: `device:${row.fingerprint}`,
        label: formatFingerprintLabel('device', row.fingerprint),
        fingerprint: row.fingerprint,
        value: row.fingerprint,
      });

    accumulator.eventCount += row.eventCount;
    accumulator.lastSeenAt =
      accumulator.lastSeenAt && accumulator.lastSeenAt > row.lastSeenAt
        ? accumulator.lastSeenAt
        : row.lastSeenAt;
    accumulator.activityTypes.add(row.activityType);
    deviceSignalMap.set(row.fingerprint, accumulator);
  }

  const ipSignalMap = new Map<
    string,
    ReturnType<typeof createSignalAccumulator>
  >();
  for (const row of deviceRows) {
    const ip = normalizeSignalValue(row.ip);
    if (!ip) {
      continue;
    }

    const accumulator =
      ipSignalMap.get(ip) ??
      createSignalAccumulator({
        kind: 'ip',
        id: `ip:${ip}`,
        label: ip,
        value: ip,
      });
    accumulator.eventCount += row.eventCount;
    accumulator.lastSeenAt =
      accumulator.lastSeenAt && accumulator.lastSeenAt > row.lastSeenAt
        ? accumulator.lastSeenAt
        : row.lastSeenAt;
    accumulator.activityTypes.add(row.activityType);
    ipSignalMap.set(ip, accumulator);
  }

  for (const row of authIpRows) {
    const ip = normalizeSignalValue(row.ip);
    if (!ip) {
      continue;
    }

    const accumulator =
      ipSignalMap.get(ip) ??
      createSignalAccumulator({
        kind: 'ip',
        id: `ip:${ip}`,
        label: ip,
        value: ip,
      });
    accumulator.eventCount += 1;
    accumulator.lastSeenAt =
      accumulator.lastSeenAt && accumulator.lastSeenAt > row.createdAt
        ? accumulator.lastSeenAt
        : row.createdAt;
    accumulator.activityTypes.add('login_event');
    ipSignalMap.set(ip, accumulator);
  }

  const payoutSignalMap = new Map<
    string,
    ReturnType<typeof createSignalAccumulator>
  >();
  for (const row of payoutRows) {
    const payoutIdentity = buildPayoutIdentity(row);
    if (!payoutIdentity) {
      continue;
    }

    const accumulator =
      payoutSignalMap.get(payoutIdentity.fingerprint) ??
      createSignalAccumulator({
        kind: 'payout',
        id: `payout:${payoutIdentity.fingerprint}`,
        label: payoutIdentity.label,
        fingerprint: payoutIdentity.fingerprint,
        value: payoutIdentity.value,
      });
    accumulator.eventCount += 1;
    accumulator.activityTypes.add(payoutIdentity.kind);
    payoutSignalMap.set(payoutIdentity.fingerprint, accumulator);
  }

  const focusDeviceFingerprints = [...deviceSignalMap.keys()].slice(0, signalLimit);
  const focusIps = [...ipSignalMap.keys()].slice(0, signalLimit);
  const focusPayoutFingerprints = [...payoutSignalMap.keys()].slice(0, signalLimit);

  const deviceRelatedRows =
    focusDeviceFingerprints.length > 0
      ? await executor
          .select({
            userId: deviceFingerprints.userId,
            fingerprint: deviceFingerprints.fingerprint,
            eventCount: deviceFingerprints.eventCount,
            lastSeenAt: deviceFingerprints.lastSeenAt,
            activityType: deviceFingerprints.activityType,
          })
          .from(deviceFingerprints)
          .where(
            and(
              ne(deviceFingerprints.userId, userId),
              inArray(deviceFingerprints.fingerprint, focusDeviceFingerprints),
              gte(deviceFingerprints.lastSeenAt, cutoff)
            )
          )
      : [];

  const deviceIpRelatedRows =
    focusIps.length > 0
      ? await executor
          .select({
            userId: deviceFingerprints.userId,
            ip: deviceFingerprints.ip,
            eventCount: deviceFingerprints.eventCount,
            lastSeenAt: deviceFingerprints.lastSeenAt,
            activityType: deviceFingerprints.activityType,
          })
          .from(deviceFingerprints)
          .where(
            and(
              ne(deviceFingerprints.userId, userId),
              inArray(deviceFingerprints.ip, focusIps),
              gte(deviceFingerprints.lastSeenAt, cutoff)
            )
          )
      : [];

  const authIpRelatedRows =
    focusIps.length > 0
      ? await executor
          .select({
            userId: authEvents.userId,
            ip: authEvents.ip,
            createdAt: authEvents.createdAt,
          })
          .from(authEvents)
          .where(
            and(
              ne(authEvents.userId, userId),
              inArray(authEvents.ip, focusIps),
              inArray(authEvents.eventType, [...LOGIN_EVENT_TYPES]),
              gte(authEvents.createdAt, cutoff)
            )
          )
      : [];

  const payoutConditions = [];
  if (focusPayoutFingerprints.length > 0) {
    const bankLast4Values = [...new Set(
      payoutRows
        .filter((row) => row.methodType === 'bank_account' && row.accountLast4)
        .map((row) => row.accountLast4!)
    )];
    const cryptoAddressValues = [...new Set(
      payoutRows
        .filter((row) => row.methodType === 'crypto_address' && row.address)
        .map((row) => row.address!)
    )];

    if (bankLast4Values.length > 0) {
      payoutConditions.push(inArray(fiatPayoutMethods.accountLast4, bankLast4Values));
    }
    if (cryptoAddressValues.length > 0) {
      payoutConditions.push(inArray(cryptoWithdrawAddresses.address, cryptoAddressValues));
    }
  }

  const payoutRelatedRows =
    payoutConditions.length > 0
      ? await executor
          .select({
            userId: payoutMethods.userId,
            methodType: payoutMethods.methodType,
            accountName: fiatPayoutMethods.accountName,
            bankName: fiatPayoutMethods.bankName,
            brand: fiatPayoutMethods.brand,
            accountLast4: fiatPayoutMethods.accountLast4,
            address: cryptoWithdrawAddresses.address,
            network: cryptoWithdrawAddresses.network,
            token: cryptoWithdrawAddresses.token,
          })
          .from(payoutMethods)
          .leftJoin(
            fiatPayoutMethods,
            eq(fiatPayoutMethods.payoutMethodId, payoutMethods.id)
          )
          .leftJoin(
            cryptoWithdrawAddresses,
            eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethods.id)
          )
          .where(and(ne(payoutMethods.userId, userId), or(...payoutConditions)))
      : [];

  const relatedUserIds = new Set<number>();
  const relatedUserAccumulator = new Map<
    number,
    {
      relationTypes: Set<UserAssociationSignalKind>;
      sharedDevices: Set<string>;
      sharedIps: Set<string>;
      sharedPayouts: Set<string>;
    }
  >();

  const getRelatedAccumulator = (relatedUserId: number) => {
    const existing = relatedUserAccumulator.get(relatedUserId);
    if (existing) {
      return existing;
    }

    const created = {
      relationTypes: new Set<UserAssociationSignalKind>(),
      sharedDevices: new Set<string>(),
      sharedIps: new Set<string>(),
      sharedPayouts: new Set<string>(),
    };
    relatedUserAccumulator.set(relatedUserId, created);
    relatedUserIds.add(relatedUserId);
    return created;
  };

  for (const row of deviceRelatedRows) {
    const signal = deviceSignalMap.get(row.fingerprint);
    if (!signal) {
      continue;
    }

    signal.relatedUserIds.add(row.userId);
    signal.eventCount += row.eventCount;
    signal.activityTypes.add(row.activityType);
    signal.lastSeenAt =
      signal.lastSeenAt && signal.lastSeenAt > row.lastSeenAt
        ? signal.lastSeenAt
        : row.lastSeenAt;

    const related = getRelatedAccumulator(row.userId);
    related.relationTypes.add('device');
    related.sharedDevices.add(signal.label);
  }

  for (const row of deviceIpRelatedRows) {
    const ip = normalizeSignalValue(row.ip);
    if (!ip) {
      continue;
    }

    const signal = ipSignalMap.get(ip);
    if (!signal) {
      continue;
    }

    signal.relatedUserIds.add(row.userId);
    signal.eventCount += row.eventCount;
    signal.activityTypes.add(row.activityType);
    signal.lastSeenAt =
      signal.lastSeenAt && signal.lastSeenAt > row.lastSeenAt
        ? signal.lastSeenAt
        : row.lastSeenAt;

    const related = getRelatedAccumulator(row.userId);
    related.relationTypes.add('ip');
    related.sharedIps.add(signal.label);
  }

  for (const row of authIpRelatedRows) {
    const ip = normalizeSignalValue(row.ip);
    const relatedUserId = Number(row.userId ?? 0);
    if (!ip || !Number.isInteger(relatedUserId) || relatedUserId <= 0) {
      continue;
    }

    const signal = ipSignalMap.get(ip);
    if (!signal) {
      continue;
    }

    signal.relatedUserIds.add(relatedUserId);
    signal.eventCount += 1;
    signal.activityTypes.add('login_event');
    signal.lastSeenAt =
      signal.lastSeenAt && signal.lastSeenAt > row.createdAt
        ? signal.lastSeenAt
        : row.createdAt;

    const related = getRelatedAccumulator(relatedUserId);
    related.relationTypes.add('ip');
    related.sharedIps.add(signal.label);
  }

  for (const row of payoutRelatedRows) {
    const payoutIdentity = buildPayoutIdentity(row);
    if (!payoutIdentity) {
      continue;
    }

    const signal = payoutSignalMap.get(payoutIdentity.fingerprint);
    if (!signal) {
      continue;
    }

    signal.relatedUserIds.add(row.userId);
    signal.eventCount += 1;
    signal.activityTypes.add(payoutIdentity.kind);

    const related = getRelatedAccumulator(row.userId);
    related.relationTypes.add('payout');
    related.sharedPayouts.add(signal.label);
  }

  const userStateMap = await buildRiskUserStateMap([userId, ...relatedUserIds]);
  const focusRiskUser = getRiskUserStatus(userStateMap, userId);

  const deviceSignals = toSortedAssociationSignals(deviceSignalMap, userStateMap);
  const ipSignals = toSortedAssociationSignals(ipSignalMap, userStateMap);
  const payoutSignals = toSortedAssociationSignals(payoutSignalMap, userStateMap);

  const relatedUsers: UserAssociationRelatedUser[] = [...relatedUserAccumulator.entries()]
    .map(([relatedUserId, relation]) => {
      const base = getRiskUserStatus(userStateMap, relatedUserId);
      return {
        ...base,
        relationTypes: [...relation.relationTypes].sort((left, right) =>
          left.localeCompare(right)
        ),
        sharedDevices: [...relation.sharedDevices].sort((left, right) =>
          left.localeCompare(right)
        ),
        sharedIps: [...relation.sharedIps].sort((left, right) =>
          left.localeCompare(right)
        ),
        sharedPayouts: [...relation.sharedPayouts].sort((left, right) =>
          left.localeCompare(right)
        ),
      };
    })
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        Number(right.hasOpenRiskFlag) - Number(left.hasOpenRiskFlag) ||
        left.userId - right.userId
    );

  const graphNodes: UserAssociationGraphNode[] = [
    {
      id: `user:${userId}`,
      type: 'focus_user',
      label:
        focusRiskUser.email ? `${focusRiskUser.email} (#${userId})` : `User #${userId}`,
      subtitle: focusRiskUser.isFrozen
        ? `Frozen: ${focusRiskUser.freezeReason ?? 'active'}`
        : focusRiskUser.hasOpenRiskFlag
          ? `Risk: ${focusRiskUser.riskReason ?? 'open'}`
          : null,
    },
  ];
  const graphEdges: UserAssociationGraphEdge[] = [];

  for (const signal of [...deviceSignals, ...ipSignals, ...payoutSignals]) {
    graphNodes.push({
      id: signal.id,
      type: signal.kind === 'device' ? 'device' : signal.kind === 'ip' ? 'ip' : 'payout',
      label: signal.label,
      subtitle:
        signal.lastSeenAt instanceof Date
          ? signal.lastSeenAt.toISOString()
          : null,
    });
    graphEdges.push({
      source: `user:${userId}`,
      target: signal.id,
      type:
        signal.kind === 'device'
          ? 'focus_device'
          : signal.kind === 'ip'
            ? 'focus_ip'
            : 'focus_payout',
      label: `${signal.userCount} users`,
    });
  }

  for (const user of relatedUsers) {
    const nodeId = `user:${user.userId}`;
    graphNodes.push({
      id: nodeId,
      type: 'user',
      label: user.email ? `${user.email} (#${user.userId})` : `User #${user.userId}`,
      subtitle: user.hasOpenRiskFlag ? user.riskReason ?? 'risk flag' : null,
    });

    for (const label of user.sharedDevices) {
      const signal = deviceSignals.find((item) => item.label === label);
      if (!signal) {
        continue;
      }

      graphEdges.push({
        source: signal.id,
        target: nodeId,
        type: 'shared_device',
        label: 'shared device',
      });
    }

    for (const label of user.sharedIps) {
      const signal = ipSignals.find((item) => item.label === label);
      if (!signal) {
        continue;
      }

      graphEdges.push({
        source: signal.id,
        target: nodeId,
        type: 'shared_ip',
        label: 'shared ip',
      });
    }

    for (const label of user.sharedPayouts) {
      const signal = payoutSignals.find((item) => item.label === label);
      if (!signal) {
        continue;
      }

      graphEdges.push({
        source: signal.id,
        target: nodeId,
        type: 'shared_payout',
        label: 'shared payout',
      });
    }
  }

  const summary: UserAssociationSummary = {
    deviceCount: deviceSignals.length,
    ipCount: ipSignals.length,
    payoutCount: payoutSignals.length,
    relatedUserCount: relatedUsers.length,
    flaggedRelatedUserCount: relatedUsers.filter((user) => user.hasOpenRiskFlag).length,
  };

  return {
    user: focusRiskUser,
    windowDays,
    signalLimit,
    generatedAt: new Date(),
    summary,
    deviceSignals,
    ipSignals,
    payoutSignals,
    relatedUsers,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
  };
}

const buildSuspiciousAssociationSnapshot = async (
  userId: number,
  executor: DbExecutor = db
): Promise<SuspiciousAssociationSnapshot | null> => {
  const graph = await getUserAssociationGraph(
    userId,
    {
      days: 120,
      signalLimit: 8,
    },
    executor
  );
  if (!graph) {
    return null;
  }

  return {
    updatedAt: new Date().toISOString(),
    summary: graph.summary,
    relatedUserIds: graph.relatedUsers.map((user) => user.userId),
    deviceSignals: graph.deviceSignals.map((signal) => ({
      fingerprint: signal.fingerprint ?? signal.value,
      userCount: signal.userCount,
    })),
    ipSignals: graph.ipSignals.map((signal) => ({
      value: signal.value,
      userCount: signal.userCount,
    })),
    payoutSignals: graph.payoutSignals.map((signal) => ({
      value: signal.label,
      userCount: signal.userCount,
    })),
  };
};

export async function recordSuspiciousActivity(
  payload: {
    userId: number;
    reason: string;
    metadata?: Record<string, unknown> | null;
    score?: number;
    freezeReason?: UserFreezeReason | null;
    freezeScope?: UserFreezeScope | null;
    freezeCategory?: UserFreezeCategory | null;
  },
  executor: DbExecutor = db
) {
  const score = Number(payload.score ?? 1);
  const run = async (tx: DbExecutor) => {
    const associationSnapshot = await buildSuspiciousAssociationSnapshot(
      payload.userId,
      tx
    );
    const [existing] = await tx
      .select()
      .from(suspiciousAccounts)
      .where(
        and(
          eq(suspiciousAccounts.userId, payload.userId),
          eq(suspiciousAccounts.status, 'open')
        )
      )
      .orderBy(desc(suspiciousAccounts.createdAt))
      .limit(1);

    let nextScore = score;
    if (existing) {
      const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
      const currentScore =
        typeof metadata.score === 'number' ? metadata.score : 0;
      nextScore = currentScore + score;
      await tx
        .update(suspiciousAccounts)
        .set({
          reason: payload.reason,
          metadata: {
            ...metadata,
            ...(payload.metadata ?? {}),
            associations: associationSnapshot ?? Reflect.get(metadata, 'associations') ?? null,
            score: nextScore,
            lastReason: payload.reason,
            lastSeenAt: new Date().toISOString(),
          },
        })
        .where(eq(suspiciousAccounts.id, existing.id));
    } else {
      await tx.insert(suspiciousAccounts).values({
        userId: payload.userId,
        reason: payload.reason,
        status: 'open',
        metadata: {
          ...(payload.metadata ?? {}),
          associations: associationSnapshot,
          score: nextScore,
          lastReason: payload.reason,
          lastSeenAt: new Date().toISOString(),
        },
      });
    }

    return nextScore;
  };

  try {
    const nextScore = await run(executor);
    const config = await getAntiAbuseConfig(executor);
    if (config.autoFreeze && config.suspiciousThreshold.gt(0)) {
      if (nextScore >= Number(config.suspiciousThreshold)) {
        await ensureUserFreeze({
          userId: payload.userId,
          reason: payload.freezeReason ?? 'aml_review',
          scope: payload.freezeScope ?? 'account_lock',
          category: payload.freezeCategory ?? 'risk',
          metadata: { score: nextScore, trigger: payload.reason },
        });
      }
    }
    return nextScore;
  } catch (error) {
    logger.warning('failed to record suspicious activity', {
      err: error,
      userId: payload.userId,
      reason: payload.reason,
    });
    return null;
  }
}

export async function recordTableInteraction(
  userIds: number[],
  tableId: string,
  executor: DbExecutor = db
) {
  const normalizedTableId = tableId.trim();
  if (normalizedTableId === '') {
    return null;
  }

  const normalizedUserIds = normalizeTableUserIds(userIds);
  if (normalizedUserIds.length < 2) {
    return null;
  }

  const run = async (tx: DbExecutor) => {
    const userRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, normalizedUserIds));
    const validUserIds = userRows
      .map((row) => row.id)
      .sort((left, right) => left - right);

    if (validUserIds.length < 2) {
      return null;
    }

    const [sessionRows, deviceFingerprintRows] = await Promise.all([
      tx
        .select({
          userId: authSessions.userId,
          ip: authSessions.ip,
          userAgent: authSessions.userAgent,
          lastSeenAt: authSessions.lastSeenAt,
          createdAt: authSessions.createdAt,
        })
        .from(authSessions)
        .where(
          and(
            inArray(authSessions.userId, validUserIds),
            eq(authSessions.subjectRole, 'user'),
            eq(authSessions.status, 'active')
          )
        )
        .orderBy(desc(authSessions.lastSeenAt), desc(authSessions.createdAt)),
      tx
        .select({
          userId: deviceFingerprints.userId,
          fingerprint: deviceFingerprints.fingerprint,
          lastSeenAt: deviceFingerprints.lastSeenAt,
          createdAt: deviceFingerprints.createdAt,
        })
        .from(deviceFingerprints)
        .where(inArray(deviceFingerprints.userId, validUserIds))
        .orderBy(desc(deviceFingerprints.lastSeenAt), desc(deviceFingerprints.createdAt)),
    ]);

    const latestSessions = new Map<
      number,
      {
        ip: string | null;
        userAgent: string | null;
      }
    >();
    const latestDeviceFingerprints = new Map<number, string>();

    for (const row of sessionRows) {
      if (!latestSessions.has(row.userId)) {
        latestSessions.set(row.userId, {
          ip: normalizeSignalValue(row.ip),
          userAgent: normalizeSignalValue(row.userAgent),
        });
      }
    }

    for (const row of deviceFingerprintRows) {
      if (!latestDeviceFingerprints.has(row.userId)) {
        latestDeviceFingerprints.set(row.userId, row.fingerprint);
      }
    }

    const participantSnapshots: TableInteractionSessionSnapshot[] = validUserIds.map((userId) => {
      const session = latestSessions.get(userId);
      const ip = session?.ip ?? null;
      const userAgent = session?.userAgent ?? null;
      const trackedFingerprint = latestDeviceFingerprints.get(userId) ?? null;

      return {
        userId,
        ipFingerprint: buildFingerprint(ip),
        deviceFingerprint: trackedFingerprint ?? buildDeviceFingerprint(ip, userAgent),
      };
    });

    const recordedAt = new Date();
    const pairSignals: TableInteractionPairSignal[] = [];

    for (let index = 0; index < validUserIds.length - 1; index += 1) {
      const userAId = validUserIds[index]!;
      const leftSession = latestSessions.get(userAId);

      for (let peerIndex = index + 1; peerIndex < validUserIds.length; peerIndex += 1) {
        const userBId = validUserIds[peerIndex]!;
        const rightSession = latestSessions.get(userBId);
        const sharedIp =
          leftSession?.ip !== null &&
          leftSession?.ip !== undefined &&
          leftSession.ip === rightSession?.ip;
        const sharedDevice =
          leftSession?.ip !== null &&
          leftSession?.ip !== undefined &&
          leftSession.ip === rightSession?.ip &&
          leftSession.userAgent !== null &&
          leftSession.userAgent !== undefined &&
          leftSession.userAgent === rightSession?.userAgent;
        const sharedIpDelta = sharedIp ? TABLE_INTERACTION_SHARED_IP_SCORE : 0;
        const sharedDeviceDelta = sharedDevice
          ? TABLE_INTERACTION_SHARED_DEVICE_SCORE
          : 0;
        const sharedIpFingerprint =
          sharedIp && leftSession?.ip ? buildFingerprint(leftSession.ip) : null;
        const sharedDeviceFingerprint =
          sharedDevice && leftSession?.ip && leftSession.userAgent
            ? buildDeviceFingerprint(leftSession.ip, leftSession.userAgent)
            : null;
        const initialRepeatDelta =
          TABLE_INTERACTION_REPEAT_THRESHOLD <= 1
            ? TABLE_INTERACTION_REPEAT_SCORE
            : 0;
        const pairMetadata = {
          lastSignals: {
            sharedIp,
            sharedDevice,
            sharedIpFingerprint,
            sharedDeviceFingerprint,
            frequentTableThreshold: TABLE_INTERACTION_REPEAT_THRESHOLD,
            scoreWeights: {
              sharedIp: TABLE_INTERACTION_SHARED_IP_SCORE,
              sharedDevice: TABLE_INTERACTION_SHARED_DEVICE_SCORE,
              repeatedTable: TABLE_INTERACTION_REPEAT_SCORE,
            },
          },
        };

        const [pairRow] = await tx
          .insert(riskTableInteractionPairs)
          .values({
            tableId: normalizedTableId,
            userAId,
            userBId,
            interactionCount: 1,
            sharedIpCount: sharedIp ? 1 : 0,
            sharedDeviceCount: sharedDevice ? 1 : 0,
            suspicionScore: sharedIpDelta + sharedDeviceDelta + initialRepeatDelta,
            metadata: pairMetadata,
            firstSeenAt: recordedAt,
            lastSeenAt: recordedAt,
            createdAt: recordedAt,
            updatedAt: recordedAt,
          })
          .onConflictDoUpdate({
            target: [
              riskTableInteractionPairs.tableId,
              riskTableInteractionPairs.userAId,
              riskTableInteractionPairs.userBId,
            ],
            set: {
              interactionCount: sql`${riskTableInteractionPairs.interactionCount} + 1`,
              sharedIpCount: sql`${riskTableInteractionPairs.sharedIpCount} + ${sharedIp ? 1 : 0}`,
              sharedDeviceCount: sql`${riskTableInteractionPairs.sharedDeviceCount} + ${sharedDevice ? 1 : 0}`,
              suspicionScore: sql`${riskTableInteractionPairs.suspicionScore} + ${
                sharedIpDelta + sharedDeviceDelta
              } + CASE
                WHEN ${riskTableInteractionPairs.interactionCount} + 1 >= ${TABLE_INTERACTION_REPEAT_THRESHOLD}
                  THEN ${TABLE_INTERACTION_REPEAT_SCORE}
                ELSE 0
              END`,
              metadata: pairMetadata,
              lastSeenAt: recordedAt,
              updatedAt: recordedAt,
            },
          })
          .returning({
            interactionCount: riskTableInteractionPairs.interactionCount,
            suspicionScore: riskTableInteractionPairs.suspicionScore,
          });

        if (!pairRow) {
          continue;
        }

        const repeatedTable =
          pairRow.interactionCount >= TABLE_INTERACTION_REPEAT_THRESHOLD;
        const repeatedTableDelta = repeatedTable
          ? TABLE_INTERACTION_REPEAT_SCORE
          : 0;

        pairSignals.push({
          userAId,
          userBId,
          sharedIp,
          sharedDevice,
          repeatedTable,
          interactionCount: pairRow.interactionCount,
          suspicionScore: pairRow.suspicionScore,
          scoreDelta: sharedIpDelta + sharedDeviceDelta + repeatedTableDelta,
        });
      }
    }

    const [eventRow] = await tx
      .insert(riskTableInteractionEvents)
      .values({
        tableId: normalizedTableId,
        participantUserIds: validUserIds,
        pairCount: pairSignals.length,
        metadata: {
          participants: participantSnapshots,
          pairSignals,
          frequentTableThreshold: TABLE_INTERACTION_REPEAT_THRESHOLD,
          scoreWeights: {
            sharedIp: TABLE_INTERACTION_SHARED_IP_SCORE,
            sharedDevice: TABLE_INTERACTION_SHARED_DEVICE_SCORE,
            repeatedTable: TABLE_INTERACTION_REPEAT_SCORE,
          },
        },
        recordedAt,
      })
      .returning({ id: riskTableInteractionEvents.id });

    return {
      eventId: eventRow?.id ?? null,
      tableId: normalizedTableId,
      participantUserIds: validUserIds,
      pairCount: pairSignals.length,
      signaledPairCount: pairSignals.filter(
        (signal) => signal.sharedIp || signal.sharedDevice || signal.repeatedTable
      ).length,
      pairSignals,
    };
  };

  try {
    return await run(executor);
  } catch (error) {
    logger.warning('failed to record table interaction', {
      err: error,
      tableId: normalizedTableId,
      userIds: normalizedUserIds,
    });
    return null;
  }
}

export async function getCollusionDashboard(options: {
  days?: number;
  seriesLimit?: number;
  topLimit?: number;
} = {}) {
  const windowDays = clampPositiveInt(options.days, DEFAULT_COLLUSION_WINDOW_DAYS, 90);
  const seriesLimit = clampPositiveInt(
    options.seriesLimit,
    DEFAULT_COLLUSION_SERIES_LIMIT,
    12
  );
  const topLimit = clampPositiveInt(options.topLimit, DEFAULT_COLLUSION_TOP_LIMIT, 20);
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [eventRows, frequentPairRows] = await Promise.all([
    db
      .select({
        tableId: riskTableInteractionEvents.tableId,
        metadata: riskTableInteractionEvents.metadata,
        recordedAt: riskTableInteractionEvents.recordedAt,
      })
      .from(riskTableInteractionEvents)
      .where(gte(riskTableInteractionEvents.recordedAt, cutoff))
      .orderBy(asc(riskTableInteractionEvents.recordedAt)),
    db
      .select({
        tableId: riskTableInteractionPairs.tableId,
        userAId: riskTableInteractionPairs.userAId,
        userBId: riskTableInteractionPairs.userBId,
        interactionCount: riskTableInteractionPairs.interactionCount,
        sharedIpCount: riskTableInteractionPairs.sharedIpCount,
        sharedDeviceCount: riskTableInteractionPairs.sharedDeviceCount,
        suspicionScore: riskTableInteractionPairs.suspicionScore,
        lastSeenAt: riskTableInteractionPairs.lastSeenAt,
      })
      .from(riskTableInteractionPairs)
      .orderBy(
        desc(riskTableInteractionPairs.interactionCount),
        desc(riskTableInteractionPairs.suspicionScore),
        desc(riskTableInteractionPairs.lastSeenAt)
      )
      .limit(topLimit),
  ]);

  const parsedEvents = eventRows.map(parseTableInteractionEvent);
  const relatedUserIds = new Set<number>();
  for (const event of parsedEvents) {
    for (const participant of event.participants) {
      relatedUserIds.add(participant.userId);
    }
    for (const signal of event.pairSignals) {
      relatedUserIds.add(signal.userAId);
      relatedUserIds.add(signal.userBId);
    }
  }

  for (const pair of frequentPairRows) {
    relatedUserIds.add(pair.userAId);
    relatedUserIds.add(pair.userBId);
  }

  const userStateMap = await buildRiskUserStateMap([...relatedUserIds]);
  const userTimelines = new Map<string, CollusionTimelineAccumulator>();
  const deviceTimelines = new Map<string, CollusionTimelineAccumulator>();
  const sharedIpClusters = new Map<string, CollusionClusterAccumulator>();
  const sharedDeviceClusters = new Map<string, CollusionClusterAccumulator>();

  for (const event of parsedEvents) {
    const participantMap = new Map<number, TableInteractionSessionSnapshot>();
    for (const participant of event.participants) {
      participantMap.set(participant.userId, participant);
    }

    for (const signal of event.pairSignals) {
      const scoreDelta = signal.scoreDelta;
      if (scoreDelta > 0) {
        for (const userId of [signal.userAId, signal.userBId]) {
          const userStatus = getRiskUserStatus(userStateMap, userId);
          upsertTimelineScore(userTimelines, {
            entityKey: `user:${userId}`,
            entityType: 'user',
            label: userStatus.email ? `${userStatus.email} (#${userId})` : `User #${userId}`,
            userId,
            scoreDelta,
            recordedAt: event.recordedAt,
          });
        }

        const deviceFingerprints = new Set<string>();
        for (const userId of [signal.userAId, signal.userBId]) {
          const participant = participantMap.get(userId);
          if (participant?.deviceFingerprint) {
            deviceFingerprints.add(participant.deviceFingerprint);
          }
        }

        for (const fingerprint of deviceFingerprints) {
          upsertTimelineScore(deviceTimelines, {
            entityKey: `device:${fingerprint}`,
            entityType: 'device',
            label: formatFingerprintLabel('device', fingerprint),
            fingerprint,
            scoreDelta,
            recordedAt: event.recordedAt,
          });
        }
      }

      if (signal.sharedIp) {
        const fingerprint =
          participantMap.get(signal.userAId)?.ipFingerprint ??
          participantMap.get(signal.userBId)?.ipFingerprint;
        if (fingerprint) {
          upsertCluster(sharedIpClusters, {
            kind: 'ip',
            fingerprint,
            scoreDelta,
            recordedAt: event.recordedAt,
            userIds: [signal.userAId, signal.userBId],
          });
        }
      }

      if (signal.sharedDevice) {
        const fingerprint =
          participantMap.get(signal.userAId)?.deviceFingerprint ??
          participantMap.get(signal.userBId)?.deviceFingerprint;
        if (fingerprint) {
          upsertCluster(sharedDeviceClusters, {
            kind: 'device',
            fingerprint,
            scoreDelta,
            recordedAt: event.recordedAt,
            userIds: [signal.userAId, signal.userBId],
          });
        }
      }
    }
  }

  return {
    windowDays,
    seriesLimit,
    topLimit,
    generatedAt: new Date(),
    userSeries: buildTimelineSeries(userTimelines, userStateMap, seriesLimit),
    deviceSeries: buildTimelineSeries(deviceTimelines, userStateMap, seriesLimit),
    sharedIpTop: buildClusterList(sharedIpClusters, userStateMap, topLimit),
    sharedDeviceTop: buildClusterList(sharedDeviceClusters, userStateMap, topLimit),
    frequentTablePairs: frequentPairRows.map((pair) => ({
      tableId: pair.tableId,
      interactionCount: pair.interactionCount,
      sharedIpCount: pair.sharedIpCount,
      sharedDeviceCount: pair.sharedDeviceCount,
      suspicionScore: pair.suspicionScore,
      lastSeenAt: pair.lastSeenAt,
      users: [
        getRiskUserStatus(userStateMap, pair.userAId),
        getRiskUserStatus(userStateMap, pair.userBId),
      ] as const,
    })),
  };
}

export async function upsertManualCollusionFlag(payload: {
  userId: number;
  adminId?: number | null;
  reason?: string | null;
}) {
  const normalizedReason = payload.reason?.trim() || MANUAL_COLLUSION_REASON;
  const now = new Date();
  const nowIso = now.toISOString();
  const [existing] = await db
    .select()
    .from(suspiciousAccounts)
    .where(
      and(
        eq(suspiciousAccounts.userId, payload.userId),
        eq(suspiciousAccounts.status, 'open')
      )
    )
    .orderBy(desc(suspiciousAccounts.createdAt))
    .limit(1);

  if (existing) {
    const currentMetadata = buildSuspiciousMetadata(existing.metadata);
    const [updated] = await db
      .update(suspiciousAccounts)
      .set({
        reason: existing.reason ?? normalizedReason,
        metadata: {
          ...currentMetadata.raw,
          score: currentMetadata.score,
          lastReason: normalizedReason,
          lastSeenAt: nowIso,
          manualFlagged: true,
          manualFlagReason: normalizedReason,
          manualFlaggedAt: nowIso,
          manualFlaggedBy: payload.adminId ?? null,
          manualFlagSource: MANUAL_COLLUSION_SOURCE,
        },
      })
      .where(eq(suspiciousAccounts.id, existing.id))
      .returning();

    return updated ?? null;
  }

  const [created] = await db
    .insert(suspiciousAccounts)
    .values({
      userId: payload.userId,
      reason: normalizedReason,
      status: 'open',
      metadata: {
        score: 0,
        lastReason: normalizedReason,
        lastSeenAt: nowIso,
        manualFlagged: true,
        manualFlagReason: normalizedReason,
        manualFlaggedAt: nowIso,
        manualFlaggedBy: payload.adminId ?? null,
        manualFlagSource: MANUAL_COLLUSION_SOURCE,
      },
    })
    .returning();

  return created ?? null;
}

export async function clearManualCollusionFlag(payload: {
  userId: number;
  adminId?: number | null;
  reason?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(suspiciousAccounts)
    .where(
      and(
        eq(suspiciousAccounts.userId, payload.userId),
        eq(suspiciousAccounts.status, 'open')
      )
    )
    .orderBy(desc(suspiciousAccounts.createdAt))
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const normalizedReason = payload.reason?.trim() || null;
  const currentMetadata = buildSuspiciousMetadata(existing.metadata);
  const shouldResolveRecord =
    currentMetadata.score === 0 &&
    (currentMetadata.manualFlagSource === MANUAL_COLLUSION_SOURCE ||
      existing.reason === MANUAL_COLLUSION_REASON);

  const [updated] = await db
    .update(suspiciousAccounts)
    .set({
      status: shouldResolveRecord ? 'resolved' : existing.status,
      resolvedAt: shouldResolveRecord ? now : existing.resolvedAt,
      metadata: {
        ...currentMetadata.raw,
        score: currentMetadata.score,
        manualFlagged: false,
        manualResolvedAt: nowIso,
        manualResolvedBy: payload.adminId ?? null,
        manualResolveReason: normalizedReason,
      },
    })
    .where(eq(suspiciousAccounts.id, existing.id))
    .returning();

  return updated ?? null;
}

export async function listFrozenUsers(
  limit = 50,
  offset = 0,
  order: 'asc' | 'desc' = 'desc',
  userId?: number | null
) {
  const orderBy = order === 'asc' ? asc(freezeRecords.createdAt) : desc(freezeRecords.createdAt);
  return db
    .select()
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.status, 'active'),
        ...(userId ? [eq(freezeRecords.userId, userId)] : [])
      )
    )
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);
}

export async function releaseUserFreezeByFilter(
  payload: {
    userId: number;
    reason?: UserFreezeReason | null;
    scope?: UserFreezeScope | null;
  },
  executor: DbExecutor = db
) {
  const predicates = [
    eq(freezeRecords.userId, payload.userId),
    eq(freezeRecords.status, 'active'),
  ];

  if (payload.reason) {
    predicates.push(eq(freezeRecords.reason, payload.reason));
  }

  if (payload.scope) {
    predicates.push(eq(freezeRecords.scope, payload.scope));
  }

  const [updated] = await executor
    .update(freezeRecords)
    .set({
      status: 'released',
      releasedAt: new Date(),
    })
    .where(and(...predicates))
    .returning();

  return updated ?? null;
}

export async function releaseUserFreeze(
  payload: {
    freezeRecordId?: number | null;
    userId?: number | null;
    reason?: UserFreezeReason | null;
    scope?: UserFreezeScope | null;
  },
  executor: DbExecutor = db
) {
  if (payload.freezeRecordId) {
    const [updated] = await executor
      .update(freezeRecords)
      .set({
        status: 'released',
        releasedAt: new Date(),
      })
      .where(
        and(
          eq(freezeRecords.id, payload.freezeRecordId),
          eq(freezeRecords.status, 'active')
        )
      )
      .returning();

    return updated ?? null;
  }

  if (!payload.userId) {
    return null;
  }

  return releaseUserFreezeByFilter(
    {
      userId: payload.userId,
      reason: payload.reason ?? null,
      scope: payload.scope ?? null,
    },
    executor
  );
}

export async function listUserFreezeRecords(userId: number, limit = 50) {
  return db
    .select()
    .from(freezeRecords)
    .where(eq(freezeRecords.userId, userId))
    .orderBy(desc(freezeRecords.createdAt), desc(freezeRecords.id))
    .limit(limit);
}

export async function getActiveUserFreezeScopes(userId: number) {
  const rows = await db
    .select({ scope: freezeRecords.scope })
    .from(freezeRecords)
    .where(
      and(eq(freezeRecords.userId, userId), eq(freezeRecords.status, 'active'))
    );

  return [...new Set(rows.map((row) => row.scope))];
}
