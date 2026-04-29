import { securityEvents } from '@reward/database';
import { and, desc, eq, gte, or, sql } from '@reward/database/orm';

import { db } from '../../db';
import { getConfigView } from '../../shared/config';
import { context } from '../../shared/context';
import { logger } from '../../shared/logger';
import { getRuntimeMetadata } from '../../shared/runtime-metadata';

type SecurityEventCategory =
  | 'auth'
  | 'admin_action'
  | 'aml'
  | 'reconciliation_alert'
  | 'correlation_alert';

type SecurityEventSeverity = 'info' | 'warning' | 'high' | 'critical';

type SecurityEventSink = 'log' | 'webhook' | 'elasticsearch';

type SecurityEventPayload = {
  category: SecurityEventCategory;
  eventType: string;
  severity: SecurityEventSeverity;
  sourceTable?: string | null;
  sourceRecordId?: number | null;
  userId?: number | null;
  adminId?: number | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  fingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | null;
};

type EmitSecurityEventOptions = {
  skipCorrelation?: boolean;
};

type SecurityEventRecord = {
  id: number;
  category: string;
  eventType: string;
  severity: string;
  sourceTable: string | null;
  sourceRecordId: number | null;
  userId: number | null;
  adminId: number | null;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  fingerprint: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
  createdAt: Date;
};

const config = getConfigView();
const ADMIN_FAILURE_SUCCESS_WINDOW_MS = 60 * 60 * 1000;
const AML_RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const supportedSecurityEventSinks: readonly SecurityEventSink[] = [
  'log',
  'webhook',
  'elasticsearch',
];

const warnedMissingSinkConfig: Partial<Record<Exclude<SecurityEventSink, 'log'>, boolean>> =
  {};

const toMetadataRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const normalizeString = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const readString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? normalizeString(value) : null;
};

const readInteger = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const buildStoredMetadata = (metadata?: Record<string, unknown> | null) => {
  const nextMetadata = toMetadataRecord(metadata);
  const requestContext = context().getStore();

  if (requestContext?.requestId) {
    nextMetadata.requestId = requestContext.requestId;
  }
  if (requestContext?.traceId) {
    nextMetadata.traceId = requestContext.traceId;
  }
  if (requestContext?.role) {
    nextMetadata.requestRole = requestContext.role;
  }
  if (requestContext?.locale) {
    nextMetadata.requestLocale = requestContext.locale;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
};

const mapStoredEvent = (
  row: typeof securityEvents.$inferSelect,
): SecurityEventRecord => ({
  id: row.id,
  category: row.category,
  eventType: row.eventType,
  severity: row.severity,
  sourceTable: row.sourceTable ?? null,
  sourceRecordId: row.sourceRecordId ?? null,
  userId: row.userId ?? null,
  adminId: row.adminId ?? null,
  email: row.email ?? null,
  ip: row.ip ?? null,
  userAgent: row.userAgent ?? null,
  sessionId: row.sessionId ?? null,
  fingerprint: row.fingerprint ?? null,
  metadata:
    row.metadata === null ? null : toMetadataRecord(row.metadata),
  occurredAt: normalizeDate(row.occurredAt) ?? new Date(),
  createdAt: normalizeDate(row.createdAt) ?? new Date(),
});

const resolveSecurityEventSinks = (): SecurityEventSink[] => {
  const requested = (config.securityEventSinks || 'log')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const sinks = [...new Set(requested)].filter((value): value is SecurityEventSink =>
    supportedSecurityEventSinks.includes(value as SecurityEventSink),
  );

  return sinks.length > 0 ? sinks : ['log'];
};

const toHourBucket = (value: Date) => {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
};

const toDayBucket = (value: Date) => value.toISOString().slice(0, 10);

const hasFingerprint = async (fingerprint: string) => {
  const [existing] = await db
    .select({ id: securityEvents.id })
    .from(securityEvents)
    .where(eq(securityEvents.fingerprint, fingerprint))
    .orderBy(desc(securityEvents.id))
    .limit(1);

  return Boolean(existing?.id);
};

const logSecurityEvent = (event: SecurityEventRecord) => {
  const envelope = {
    kind: 'security_event',
    ...getRuntimeMetadata(config),
    id: event.id,
    category: event.category,
    eventType: event.eventType,
    severity: event.severity,
    sourceTable: event.sourceTable,
    sourceRecordId: event.sourceRecordId,
    userId: event.userId,
    adminId: event.adminId,
    email: event.email,
    ip: event.ip,
    userAgent: event.userAgent,
    sessionId: event.sessionId,
    fingerprint: event.fingerprint,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
    metadata: event.metadata,
  };

  if (event.severity === 'critical') {
    logger.error('security event', { securityEvent: envelope });
    return;
  }
  if (event.severity === 'high' || event.severity === 'warning') {
    logger.warning('security event', { securityEvent: envelope });
    return;
  }

  logger.info('security event', { securityEvent: envelope });
};

const warnMissingSinkConfig = (
  sink: Exclude<SecurityEventSink, 'log'>,
  message: string,
) => {
  if (warnedMissingSinkConfig[sink]) {
    return;
  }

  warnedMissingSinkConfig[sink] = true;
  logger.warning(message, { sink });
};

const postJson = async (
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.securityEventRequestTimeoutMs,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Security event sink returned status ${response.status}.`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
};

const buildSinkPayload = (event: SecurityEventRecord) => ({
  kind: 'security_event',
  ...getRuntimeMetadata(config),
  id: event.id,
  category: event.category,
  eventType: event.eventType,
  severity: event.severity,
  sourceTable: event.sourceTable,
  sourceRecordId: event.sourceRecordId,
  userId: event.userId,
  adminId: event.adminId,
  email: event.email,
  ip: event.ip,
  userAgent: event.userAgent,
  sessionId: event.sessionId,
  fingerprint: event.fingerprint,
  occurredAt: event.occurredAt.toISOString(),
  createdAt: event.createdAt.toISOString(),
  metadata: event.metadata,
});

const publishToWebhookSink = async (event: SecurityEventRecord) => {
  const url = normalizeString(config.securityEventWebhookUrl);
  if (!url) {
    warnMissingSinkConfig(
      'webhook',
      'security event webhook sink enabled without SECURITY_EVENT_WEBHOOK_URL',
    );
    return;
  }

  await postJson(url, {}, buildSinkPayload(event));
};

const publishToElasticsearchSink = async (event: SecurityEventRecord) => {
  const baseUrl = normalizeString(config.securityEventElasticsearchUrl);
  if (!baseUrl) {
    warnMissingSinkConfig(
      'elasticsearch',
      'security event elasticsearch sink enabled without SECURITY_EVENT_ELASTICSEARCH_URL',
    );
    return;
  }

  const indexName =
    normalizeString(config.securityEventElasticsearchIndex) ??
    'reward-security-events';
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/${indexName}/_doc`;
  const apiKey = normalizeString(config.securityEventElasticsearchApiKey);

  await postJson(
    endpoint,
    apiKey ? { authorization: `ApiKey ${apiKey}` } : {},
    buildSinkPayload(event),
  );
};

const publishSecurityEventToSinks = async (event: SecurityEventRecord) => {
  const sinks = resolveSecurityEventSinks();

  if (sinks.includes('log')) {
    logSecurityEvent(event);
  }

  const remoteSinks = sinks.filter((sink) => sink !== 'log');
  if (remoteSinks.length === 0) {
    return;
  }

  const deliveries = await Promise.allSettled(
    remoteSinks.map((sink) => {
      switch (sink) {
        case 'webhook':
          return publishToWebhookSink(event);
        case 'elasticsearch':
          return publishToElasticsearchSink(event);
        default:
          return Promise.resolve();
      }
    }),
  );

  for (const [index, delivery] of deliveries.entries()) {
    if (delivery.status === 'rejected') {
      logger.warning('failed to deliver security event to sink', {
        sink: remoteSinks[index],
        eventId: event.id,
        eventType: event.eventType,
        err: delivery.reason,
      });
    }
  }
};

const maybeEmitAdminFailedThenSuccessSameIp = async (
  event: SecurityEventRecord,
) => {
  if (event.eventType !== 'admin_login_success' || !event.ip) {
    return;
  }

  const since = new Date(event.occurredAt.getTime() - ADMIN_FAILURE_SUCCESS_WINDOW_MS);
  const [summary] = await db
    .select({
      failedCount: sql<number>`count(*)::int`,
      firstFailedAt: sql<Date | null>`min(${securityEvents.occurredAt})`,
      lastFailedAt: sql<Date | null>`max(${securityEvents.occurredAt})`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.eventType, 'admin_login_failed'),
        eq(securityEvents.ip, event.ip),
        gte(securityEvents.occurredAt, since),
      ),
    );

  const failedCount = Number(summary?.failedCount ?? 0);
  if (failedCount < 3) {
    return;
  }

  const fingerprint = `correlation:admin_failed_then_success_same_ip:${event.ip}:${toHourBucket(event.occurredAt)}`;
  if (await hasFingerprint(fingerprint)) {
    return;
  }

  await emitSecurityEvent(
    {
      category: 'correlation_alert',
      eventType: 'admin_failed_then_success_same_ip',
      severity: 'critical',
      sourceTable: event.sourceTable,
      sourceRecordId: event.sourceRecordId,
      userId: event.userId,
      adminId: event.adminId,
      email: event.email,
      ip: event.ip,
      userAgent: event.userAgent,
      sessionId: event.sessionId,
      fingerprint,
      occurredAt: event.occurredAt,
      metadata: {
        ruleId: 'admin_failed_then_success_same_ip',
        windowMinutes: 60,
        failedCount,
        firstFailedAt: normalizeDate(summary?.firstFailedAt)?.toISOString() ?? null,
        lastFailedAt: normalizeDate(summary?.lastFailedAt)?.toISOString() ?? null,
        triggeredByEventId: event.id,
        triggeredBySourceRecordId: event.sourceRecordId,
      },
    },
    { skipCorrelation: true },
  );
};

const maybeEmitBreakGlassAfterFailuresSameIp = async (
  event: SecurityEventRecord,
) => {
  if (event.eventType !== 'admin_mfa_break_glass_login' || !event.ip) {
    return;
  }

  const since = new Date(event.occurredAt.getTime() - ADMIN_FAILURE_SUCCESS_WINDOW_MS);
  const [summary] = await db
    .select({
      failedCount: sql<number>`count(*)::int`,
      lastFailedAt: sql<Date | null>`max(${securityEvents.occurredAt})`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.eventType, 'admin_login_failed'),
        eq(securityEvents.ip, event.ip),
        gte(securityEvents.occurredAt, since),
      ),
    );

  const failedCount = Number(summary?.failedCount ?? 0);
  if (failedCount < 1) {
    return;
  }

  const fingerprint = `correlation:admin_break_glass_after_failures_same_ip:${event.ip}:${toHourBucket(event.occurredAt)}`;
  if (await hasFingerprint(fingerprint)) {
    return;
  }

  await emitSecurityEvent(
    {
      category: 'correlation_alert',
      eventType: 'admin_break_glass_after_failures_same_ip',
      severity: 'critical',
      sourceTable: event.sourceTable,
      sourceRecordId: event.sourceRecordId,
      userId: event.userId,
      adminId: event.adminId,
      email: event.email,
      ip: event.ip,
      userAgent: event.userAgent,
      sessionId: event.sessionId,
      fingerprint,
      occurredAt: event.occurredAt,
      metadata: {
        ruleId: 'admin_break_glass_after_failures_same_ip',
        windowMinutes: 60,
        failedCount,
        lastFailedAt: normalizeDate(summary?.lastFailedAt)?.toISOString() ?? null,
        triggeredByEventId: event.id,
        triggeredBySourceRecordId: event.sourceRecordId,
      },
    },
    { skipCorrelation: true },
  );
};

const maybeEmitAmlAndWalletDriftSameUser = async (
  event: SecurityEventRecord,
) => {
  if (
    event.userId === null ||
    ![
      'aml_hit_detected',
      'wallet_reconciliation_alert_opened',
      'wallet_reconciliation_alert_updated',
    ].includes(event.eventType)
  ) {
    return;
  }

  const since = new Date(event.occurredAt.getTime() - AML_RECONCILIATION_WINDOW_MS);
  const [amlSummary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${securityEvents.occurredAt})`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.userId, event.userId),
        eq(securityEvents.eventType, 'aml_hit_detected'),
        gte(securityEvents.occurredAt, since),
      ),
    );
  const [reconciliationSummary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${securityEvents.occurredAt})`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.userId, event.userId),
        or(
          eq(securityEvents.eventType, 'wallet_reconciliation_alert_opened'),
          eq(securityEvents.eventType, 'wallet_reconciliation_alert_updated'),
        ),
        gte(securityEvents.occurredAt, since),
      ),
    );

  const amlHitCount = Number(amlSummary?.total ?? 0);
  const reconciliationCount = Number(reconciliationSummary?.total ?? 0);
  if (amlHitCount === 0 || reconciliationCount === 0) {
    return;
  }

  const fingerprint = `correlation:aml_hit_and_wallet_drift_same_user:${String(event.userId)}:${toDayBucket(event.occurredAt)}`;
  if (await hasFingerprint(fingerprint)) {
    return;
  }

  await emitSecurityEvent(
    {
      category: 'correlation_alert',
      eventType: 'aml_hit_and_wallet_drift_same_user',
      severity: 'high',
      sourceTable: event.sourceTable,
      sourceRecordId: event.sourceRecordId,
      userId: event.userId,
      adminId: event.adminId,
      email: event.email,
      ip: event.ip,
      userAgent: event.userAgent,
      sessionId: event.sessionId,
      fingerprint,
      occurredAt: event.occurredAt,
      metadata: {
        ruleId: 'aml_hit_and_wallet_drift_same_user',
        windowHours: 24,
        amlHitCount,
        reconciliationCount,
        latestAmlHitAt: normalizeDate(amlSummary?.latestAt)?.toISOString() ?? null,
        latestReconciliationAt:
          normalizeDate(reconciliationSummary?.latestAt)?.toISOString() ?? null,
        triggeredByEventId: event.id,
        triggeredBySourceRecordId: event.sourceRecordId,
      },
    },
    { skipCorrelation: true },
  );
};

const evaluateSecurityEventCorrelations = async (
  event: SecurityEventRecord,
) => {
  if (event.category === 'correlation_alert') {
    return;
  }

  await maybeEmitAdminFailedThenSuccessSameIp(event);
  await maybeEmitBreakGlassAfterFailuresSameIp(event);
  await maybeEmitAmlAndWalletDriftSameUser(event);
};

export async function emitSecurityEvent(
  payload: SecurityEventPayload,
  options: EmitSecurityEventOptions = {},
) {
  const [created] = await db
    .insert(securityEvents)
    .values({
      category: payload.category,
      eventType: payload.eventType,
      severity: payload.severity,
      sourceTable: normalizeString(payload.sourceTable ?? null),
      sourceRecordId: payload.sourceRecordId ?? null,
      userId: payload.userId ?? null,
      adminId: payload.adminId ?? null,
      email: normalizeString(payload.email ?? null),
      ip: normalizeString(payload.ip ?? null),
      userAgent: normalizeString(payload.userAgent ?? null),
      sessionId: normalizeString(payload.sessionId ?? null),
      fingerprint: normalizeString(payload.fingerprint ?? null),
      metadata: buildStoredMetadata(payload.metadata),
      occurredAt: payload.occurredAt ?? new Date(),
    })
    .returning();

  if (!created) {
    throw new Error('Failed to persist security event.');
  }

  const event = mapStoredEvent(created);

  if (!options.skipCorrelation) {
    await evaluateSecurityEventCorrelations(event);
  }

  void publishSecurityEventToSinks(event);
  return event;
}

export async function safeEmitSecurityEvent(
  payload: SecurityEventPayload,
  options?: EmitSecurityEventOptions,
) {
  try {
    return await emitSecurityEvent(payload, options);
  } catch (error) {
    logger.warning('failed to emit security event', {
      category: payload.category,
      eventType: payload.eventType,
      sourceTable: payload.sourceTable ?? null,
      sourceRecordId: payload.sourceRecordId ?? null,
      err: error,
    });
    return null;
  }
}

const resolveAuthSeverity = (eventType: string): SecurityEventSeverity => {
  if (
    eventType === 'admin_login_failed' ||
    eventType === 'admin_login_blocked' ||
    eventType === 'admin_login_anomaly'
  ) {
    return 'high';
  }
  if (
    eventType === 'user_login_failed' ||
    eventType === 'user_login_blocked' ||
    eventType === 'user_login_anomaly'
  ) {
    return 'warning';
  }
  if (eventType.endsWith('_failed')) {
    return 'warning';
  }
  if (eventType.endsWith('_blocked')) {
    return 'warning';
  }

  return 'info';
};

export async function emitAuthSecurityEvent(payload: {
  sourceRecordId: number;
  eventType: string;
  email?: string | null;
  userId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | null;
}) {
  const metadata = toMetadataRecord(payload.metadata);

  return safeEmitSecurityEvent({
    category: 'auth',
    eventType: payload.eventType,
    severity: resolveAuthSeverity(payload.eventType),
    sourceTable: 'auth_events',
    sourceRecordId: payload.sourceRecordId,
    userId: payload.userId ?? null,
    adminId: readInteger(metadata, 'adminId'),
    email: payload.email ?? null,
    ip: payload.ip ?? null,
    userAgent: payload.userAgent ?? null,
    sessionId: readString(metadata, 'sessionId'),
    metadata,
    occurredAt: payload.occurredAt ?? null,
  });
}

const resolveAdminActionSeverity = (
  action: string,
): SecurityEventSeverity => {
  if (action === 'admin_mfa_break_glass_login') {
    return 'high';
  }

  return 'info';
};

export async function emitAdminActionSecurityEvent(payload: {
  sourceRecordId: number;
  action: string;
  adminId?: number | null;
  ip?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | null;
}) {
  const metadata = toMetadataRecord(payload.metadata);
  const subjectUserId =
    readInteger(metadata, 'subjectUserId') ?? readInteger(metadata, 'userId');

  return safeEmitSecurityEvent({
    category: 'admin_action',
    eventType: payload.action,
    severity: resolveAdminActionSeverity(payload.action),
    sourceTable: 'admin_actions',
    sourceRecordId: payload.sourceRecordId,
    userId: subjectUserId,
    adminId: payload.adminId ?? null,
    ip: payload.ip ?? null,
    userAgent: payload.userAgent ?? null,
    sessionId: payload.sessionId ?? null,
    metadata,
    occurredAt: payload.occurredAt ?? null,
  });
}

export async function emitAmlHitSecurityEvent(payload: {
  amlCheckId: number;
  userId: number;
  checkpoint: string;
  providerKey: string;
  riskLevel: string;
  reviewStatus?: string | null;
  providerReference?: string | null;
  summary?: string | null;
  slaDueAt?: Date | null;
  occurredAt?: Date | null;
}) {
  return safeEmitSecurityEvent({
    category: 'aml',
    eventType: 'aml_hit_detected',
    severity: payload.riskLevel === 'high' ? 'critical' : 'high',
    sourceTable: 'aml_checks',
    sourceRecordId: payload.amlCheckId,
    userId: payload.userId,
    fingerprint: `aml_hit:${String(payload.amlCheckId)}`,
    metadata: {
      amlCheckId: payload.amlCheckId,
      checkpoint: payload.checkpoint,
      providerKey: payload.providerKey,
      riskLevel: payload.riskLevel,
      reviewStatus: payload.reviewStatus ?? null,
      providerReference: payload.providerReference ?? null,
      summary: payload.summary ?? null,
      slaDueAt: payload.slaDueAt?.toISOString() ?? null,
    },
    occurredAt: payload.occurredAt ?? null,
  });
}

export async function emitAmlReviewSecurityEvent(payload: {
  amlCheckId: number;
  userId: number;
  adminId: number | null;
  checkpoint: string;
  riskLevel: string;
  reviewStatus: string;
  freezeRecordIds: number[];
  activeFreezeReason: string | null;
  note?: string | null;
}) {
  const eventType = `aml_review_${payload.reviewStatus}`;

  return safeEmitSecurityEvent({
    category: 'aml',
    eventType,
    severity:
      payload.reviewStatus === 'cleared'
        ? 'info'
        : payload.reviewStatus === 'confirmed'
          ? 'critical'
          : 'high',
    sourceTable: 'aml_checks',
    sourceRecordId: payload.amlCheckId,
    userId: payload.userId,
    adminId: payload.adminId,
    metadata: {
      amlCheckId: payload.amlCheckId,
      checkpoint: payload.checkpoint,
      riskLevel: payload.riskLevel,
      reviewStatus: payload.reviewStatus,
      freezeRecordIds: payload.freezeRecordIds,
      activeFreezeReason: payload.activeFreezeReason,
      note: normalizeString(payload.note ?? null),
    },
  });
}

export async function emitReconciliationAlertSecurityEvent(payload: {
  eventType:
    | 'wallet_reconciliation_alert_opened'
    | 'wallet_reconciliation_alert_updated'
    | 'wallet_reconciliation_alert_status_changed';
  alertId: number;
  userId: number | null;
  adminId?: number | null;
  status: string;
  deltaAmount: string;
  runId?: number | null;
  fingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | null;
}) {
  return safeEmitSecurityEvent({
    category: 'reconciliation_alert',
    eventType: payload.eventType,
    severity:
      payload.status === 'resolved'
        ? 'info'
        : payload.status === 'require_engineering'
          ? 'high'
          : 'critical',
    sourceTable: 'reconciliation_alerts',
    sourceRecordId: payload.alertId,
    userId: payload.userId,
    adminId: payload.adminId ?? null,
    fingerprint:
      payload.fingerprint ??
      `${payload.eventType}:${String(payload.alertId)}:${payload.status}`,
    metadata: {
      alertId: payload.alertId,
      status: payload.status,
      deltaAmount: payload.deltaAmount,
      runId: payload.runId ?? null,
      ...(payload.metadata ?? {}),
    },
    occurredAt: payload.occurredAt ?? null,
  });
}
