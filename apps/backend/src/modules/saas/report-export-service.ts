import { SignJWT, jwtVerify } from "jose";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  agentRiskState,
  saasApiKeys,
  saasLedgerEntries,
  saasPlayers,
  saasProjects,
  saasReportExports,
  saasTenants,
  saasUsageEvents,
} from "@reward/database";
import { and, asc, desc, eq, gte, lte, sql } from "@reward/database/orm";
import type {
  SaasReportExportCreate,
  SaasReportExportFormat,
  SaasReportExportJob,
  SaasReportExportResource,
} from "@reward/shared-types/saas";

import { db } from "../../db";
import {
  badRequestError,
  internalInvariantError,
  notFoundError,
} from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import { captureException } from "../../shared/telemetry";
import {
  assertProjectCapability,
  assertTenantCapability,
  type SaasAdminActor,
} from "./access";
import { normalizeMetadata, toSaasReportExportJob } from "./records";

const REPORT_EXPORT_DOWNLOAD_PURPOSE = "saas_report_export_download";
const REPORT_EXPORT_DOWNLOAD_TTL_SECONDS = 15 * 60;
const REPORT_EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;
const REPORT_EXPORT_MAX_ROWS = 50_000;
const REPORT_EXPORT_DEFAULT_LIST_LIMIT = 10;
const REPORT_EXPORT_MAX_LIST_LIMIT = 20;

const readSecret = (name: string) => (process.env[name] ?? "").trim();

const getReportExportSigningSecret = () => {
  const dedicatedSecret = readSecret("SAAS_REPORT_EXPORT_SIGNING_SECRET");
  const fallbackSecret = readSecret("USER_JWT_SECRET");
  const rawSecret = dedicatedSecret || fallbackSecret;

  if (!rawSecret) {
    throw internalInvariantError(
      "SAAS_REPORT_EXPORT_SIGNING_SECRET or USER_JWT_SECRET must be set.",
    );
  }

  if (process.env.NODE_ENV === "production" && !dedicatedSecret) {
    throw internalInvariantError(
      "SAAS_REPORT_EXPORT_SIGNING_SECRET must be set in production.",
    );
  }

  return new TextEncoder().encode(rawSecret);
};

const formatIsoTimestampForFileName = (value: Date) =>
  value
    .toISOString()
    .replace(/[:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const sanitizeFileNamePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export";

const toSerializableUnknown = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toSerializableUnknown(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      toSerializableUnknown(entry),
    ]),
  );
};

const formatCsvValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(toSerializableUnknown(value))
        : String(value);

  if (normalized.includes('"')) {
    const escaped = normalized.replace(/"/g, '""');
    return /[\n,]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  return /[\n,]/.test(normalized) ? `"${normalized}"` : normalized;
};

const serializeCsv = (
  columns: readonly string[],
  rows: Array<Record<string, unknown>>,
) =>
  [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => formatCsvValue(row[column])).join(","),
    ),
  ].join("\n");

const buildDownloadUrlBase = (baseUrl: string, exportId: number) =>
  `${baseUrl}/portal/saas/reports/exports/${exportId}/download`;

const toDate = (value: Date | string) =>
  value instanceof Date ? value : new Date(value);

const toNullableDate = (value: Date | string | null) =>
  value ? toDate(value) : null;

const signDownloadToken = async (exportId: number) => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    exportId,
    purpose: REPORT_EXPORT_DOWNLOAD_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(exportId))
    .setIssuedAt(now)
    .setExpirationTime(now + REPORT_EXPORT_DOWNLOAD_TTL_SECONDS)
    .sign(getReportExportSigningSecret());
};

const verifyDownloadToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getReportExportSigningSecret());
  if (payload.purpose !== REPORT_EXPORT_DOWNLOAD_PURPOSE) {
    throw notFoundError("Report export download not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  const exportId = Number(payload.exportId ?? payload.sub ?? 0);
  if (!Number.isInteger(exportId) || exportId <= 0) {
    throw notFoundError("Report export download not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  return exportId;
};

const resolveListLimit = (value?: number) =>
  Math.min(
    Math.max(1, value ?? REPORT_EXPORT_DEFAULT_LIST_LIMIT),
    REPORT_EXPORT_MAX_LIST_LIMIT,
  );

const buildExportFileName = (params: {
  tenantSlug: string;
  projectSlug?: string | null;
  resource: SaasReportExportResource;
  format: SaasReportExportFormat;
  fromAt: Date;
  toAt: Date;
}) => {
  const parts = [
    sanitizeFileNamePart(params.tenantSlug),
    params.projectSlug ? sanitizeFileNamePart(params.projectSlug) : null,
    sanitizeFileNamePart(params.resource),
    formatIsoTimestampForFileName(params.fromAt),
    formatIsoTimestampForFileName(params.toAt),
  ].filter((value): value is string => Boolean(value));

  return `${parts.join("-")}.${params.format}`;
};

const assertRowLimit = (rowCount: number) => {
  if (rowCount > REPORT_EXPORT_MAX_ROWS) {
    throw badRequestError(
      `Report export exceeds the ${REPORT_EXPORT_MAX_ROWS.toLocaleString()} row limit. Narrow the time range or project scope.`,
      {
        code: API_ERROR_CODES.INVALID_REQUEST,
      },
    );
  }
};

type ExportArtifact = {
  content: string;
  contentType: string;
  fileName: string;
  rowCount: number;
};

const buildUsageEventRows = async (
  job: typeof saasReportExports.$inferSelect,
) => {
  const rows = await db
    .select({
      id: saasUsageEvents.id,
      tenantId: saasUsageEvents.tenantId,
      tenantSlug: saasTenants.slug,
      tenantName: saasTenants.name,
      projectId: saasUsageEvents.projectId,
      projectSlug: saasProjects.slug,
      projectName: saasProjects.name,
      apiKeyId: saasUsageEvents.apiKeyId,
      apiKeyPrefix: saasApiKeys.keyPrefix,
      playerId: saasUsageEvents.playerId,
      playerExternalId: saasPlayers.externalPlayerId,
      environment: saasUsageEvents.environment,
      eventType: saasUsageEvents.eventType,
      decisionType: saasUsageEvents.decisionType,
      referenceType: saasUsageEvents.referenceType,
      referenceId: saasUsageEvents.referenceId,
      units: saasUsageEvents.units,
      amount: saasUsageEvents.amount,
      currency: saasUsageEvents.currency,
      metadata: saasUsageEvents.metadata,
      createdAt: saasUsageEvents.createdAt,
    })
    .from(saasUsageEvents)
    .innerJoin(saasProjects, eq(saasUsageEvents.projectId, saasProjects.id))
    .innerJoin(saasTenants, eq(saasUsageEvents.tenantId, saasTenants.id))
    .leftJoin(saasApiKeys, eq(saasUsageEvents.apiKeyId, saasApiKeys.id))
    .leftJoin(saasPlayers, eq(saasUsageEvents.playerId, saasPlayers.id))
    .where(
      and(
        eq(saasUsageEvents.tenantId, job.tenantId),
        gte(saasUsageEvents.createdAt, job.fromAt),
        lte(saasUsageEvents.createdAt, job.toAt),
        job.projectId
          ? eq(saasUsageEvents.projectId, job.projectId)
          : undefined,
      ),
    )
    .orderBy(asc(saasUsageEvents.createdAt), asc(saasUsageEvents.id))
    .limit(REPORT_EXPORT_MAX_ROWS + 1);

  assertRowLimit(rows.length);
  const fileName = buildExportFileName({
    tenantSlug: rows[0]?.tenantSlug ?? String(job.tenantId),
    projectSlug: job.projectId ? (rows[0]?.projectSlug ?? null) : null,
    resource: job.resource,
    format: job.format,
    fromAt: job.fromAt,
    toAt: job.toAt,
  });

  const normalizedRows = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantName: row.tenantName,
    projectId: row.projectId,
    projectSlug: row.projectSlug,
    projectName: row.projectName,
    apiKeyId: row.apiKeyId,
    apiKeyPrefix: row.apiKeyPrefix,
    playerId: row.playerId,
    playerExternalId: row.playerExternalId,
    environment: row.environment,
    eventType: row.eventType,
    decisionType: row.decisionType,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    units: row.units,
    amount: toMoneyString(row.amount),
    currency: row.currency,
    metadata: normalizeMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    fileName,
    rows: normalizedRows,
  };
};

const buildLedgerRows = async (job: typeof saasReportExports.$inferSelect) => {
  const rows = await db
    .select({
      id: saasLedgerEntries.id,
      projectId: saasLedgerEntries.projectId,
      projectSlug: saasProjects.slug,
      projectName: saasProjects.name,
      tenantId: saasProjects.tenantId,
      tenantSlug: saasTenants.slug,
      tenantName: saasTenants.name,
      playerId: saasLedgerEntries.playerId,
      playerExternalId: saasPlayers.externalPlayerId,
      environment: saasLedgerEntries.environment,
      entryType: saasLedgerEntries.entryType,
      amount: saasLedgerEntries.amount,
      balanceBefore: saasLedgerEntries.balanceBefore,
      balanceAfter: saasLedgerEntries.balanceAfter,
      referenceType: saasLedgerEntries.referenceType,
      referenceId: saasLedgerEntries.referenceId,
      metadata: saasLedgerEntries.metadata,
      createdAt: saasLedgerEntries.createdAt,
    })
    .from(saasLedgerEntries)
    .innerJoin(saasProjects, eq(saasLedgerEntries.projectId, saasProjects.id))
    .innerJoin(saasTenants, eq(saasProjects.tenantId, saasTenants.id))
    .leftJoin(saasPlayers, eq(saasLedgerEntries.playerId, saasPlayers.id))
    .where(
      and(
        eq(saasProjects.tenantId, job.tenantId),
        gte(saasLedgerEntries.createdAt, job.fromAt),
        lte(saasLedgerEntries.createdAt, job.toAt),
        job.projectId
          ? eq(saasLedgerEntries.projectId, job.projectId)
          : undefined,
      ),
    )
    .orderBy(asc(saasLedgerEntries.createdAt), asc(saasLedgerEntries.id))
    .limit(REPORT_EXPORT_MAX_ROWS + 1);

  assertRowLimit(rows.length);
  const fileName = buildExportFileName({
    tenantSlug: rows[0]?.tenantSlug ?? String(job.tenantId),
    projectSlug: job.projectId ? (rows[0]?.projectSlug ?? null) : null,
    resource: job.resource,
    format: job.format,
    fromAt: job.fromAt,
    toAt: job.toAt,
  });

  const normalizedRows = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantName: row.tenantName,
    projectId: row.projectId,
    projectSlug: row.projectSlug,
    projectName: row.projectName,
    playerId: row.playerId,
    playerExternalId: row.playerExternalId,
    environment: row.environment,
    entryType: row.entryType,
    amount: toMoneyString(row.amount),
    balanceBefore: toMoneyString(row.balanceBefore),
    balanceAfter: toMoneyString(row.balanceAfter),
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    metadata: normalizeMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    fileName,
    rows: normalizedRows,
  };
};

const buildRiskStateRows = async (
  job: typeof saasReportExports.$inferSelect,
) => {
  const rows = await db
    .select({
      id: agentRiskState.id,
      tenantId: agentRiskState.tenantId,
      tenantSlug: saasTenants.slug,
      tenantName: saasTenants.name,
      projectId: agentRiskState.projectId,
      projectSlug: saasProjects.slug,
      projectName: saasProjects.name,
      apiKeyId: agentRiskState.apiKeyId,
      apiKeyPrefix: saasApiKeys.keyPrefix,
      agentId: agentRiskState.agentId,
      playerExternalId: agentRiskState.playerExternalId,
      identityType: agentRiskState.identityType,
      identityValueHash: agentRiskState.identityValueHash,
      identityHint: agentRiskState.identityHint,
      riskScore: agentRiskState.riskScore,
      hitCount: agentRiskState.hitCount,
      severeHitCount: agentRiskState.severeHitCount,
      lastSeverity: agentRiskState.lastSeverity,
      lastPlugin: agentRiskState.lastPlugin,
      lastReason: agentRiskState.lastReason,
      metadata: agentRiskState.metadata,
      firstHitAt: agentRiskState.firstHitAt,
      lastHitAt: agentRiskState.lastHitAt,
      createdAt: agentRiskState.createdAt,
      updatedAt: agentRiskState.updatedAt,
    })
    .from(agentRiskState)
    .innerJoin(saasTenants, eq(agentRiskState.tenantId, saasTenants.id))
    .innerJoin(saasProjects, eq(agentRiskState.projectId, saasProjects.id))
    .leftJoin(saasApiKeys, eq(agentRiskState.apiKeyId, saasApiKeys.id))
    .where(
      and(
        eq(agentRiskState.tenantId, job.tenantId),
        gte(agentRiskState.updatedAt, job.fromAt),
        lte(agentRiskState.updatedAt, job.toAt),
        job.projectId ? eq(agentRiskState.projectId, job.projectId) : undefined,
      ),
    )
    .orderBy(asc(agentRiskState.updatedAt), asc(agentRiskState.id))
    .limit(REPORT_EXPORT_MAX_ROWS + 1);

  assertRowLimit(rows.length);
  const fileName = buildExportFileName({
    tenantSlug: rows[0]?.tenantSlug ?? String(job.tenantId),
    projectSlug: job.projectId ? (rows[0]?.projectSlug ?? null) : null,
    resource: job.resource,
    format: job.format,
    fromAt: job.fromAt,
    toAt: job.toAt,
  });

  const normalizedRows = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantName: row.tenantName,
    projectId: row.projectId,
    projectSlug: row.projectSlug,
    projectName: row.projectName,
    apiKeyId: row.apiKeyId,
    apiKeyPrefix: row.apiKeyPrefix,
    agentId: row.agentId,
    playerExternalId: row.playerExternalId,
    identityType: row.identityType,
    identityValueHash: row.identityValueHash,
    identityHint: row.identityHint,
    riskScore: row.riskScore,
    hitCount: row.hitCount,
    severeHitCount: row.severeHitCount,
    lastSeverity: row.lastSeverity,
    lastPlugin: row.lastPlugin,
    lastReason: row.lastReason,
    metadata: normalizeMetadata(row.metadata),
    firstHitAt: row.firstHitAt.toISOString(),
    lastHitAt: row.lastHitAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    fileName,
    rows: normalizedRows,
  };
};

const buildArtifactFromRows = (params: {
  fileName: string;
  format: SaasReportExportFormat;
  fromAt: Date;
  toAt: Date;
  resource: SaasReportExportResource;
  tenantId: number;
  projectId: number | null;
  rows: Array<Record<string, unknown>>;
}): ExportArtifact => {
  if (params.format === "csv") {
    const columns = Object.keys(params.rows[0] ?? {});
    return {
      fileName: params.fileName,
      contentType: "text/csv; charset=utf-8",
      content: columns.length > 0 ? serializeCsv(columns, params.rows) : "",
      rowCount: params.rows.length,
    };
  }

  return {
    fileName: params.fileName,
    contentType: "application/json; charset=utf-8",
    content: JSON.stringify(
      {
        export: {
          tenantId: params.tenantId,
          projectId: params.projectId,
          resource: params.resource,
          format: params.format,
          fromAt: params.fromAt.toISOString(),
          toAt: params.toAt.toISOString(),
          rowCount: params.rows.length,
          exportedAt: new Date().toISOString(),
        },
        rows: params.rows.map((row) => toSerializableUnknown(row)),
      },
      null,
      2,
    ),
    rowCount: params.rows.length,
  };
};

const buildExportArtifact = async (
  job: typeof saasReportExports.$inferSelect,
): Promise<ExportArtifact> => {
  const payload =
    job.resource === "saas_usage_events"
      ? await buildUsageEventRows(job)
      : job.resource === "saas_ledger_entries"
        ? await buildLedgerRows(job)
        : await buildRiskStateRows(job);

  return buildArtifactFromRows({
    fileName: payload.fileName,
    format: job.format,
    fromAt: job.fromAt,
    toAt: job.toAt,
    resource: job.resource,
    tenantId: job.tenantId,
    projectId: job.projectId,
    rows: payload.rows,
  });
};

export async function createSaasReportExportJob(
  tenantId: number,
  payload: SaasReportExportCreate,
  actor: SaasAdminActor,
) {
  await assertTenantCapability(actor, tenantId, "tenant:read");

  if (payload.projectId) {
    const project = await assertProjectCapability(
      actor,
      payload.projectId,
      "tenant:read",
    );
    if (project.tenantId !== tenantId) {
      throw badRequestError("Project does not belong to the selected tenant.", {
        code: API_ERROR_CODES.INVALID_PROJECT_ID,
      });
    }
  }

  const fromAt = new Date(payload.fromAt);
  const toAt = new Date(payload.toAt);

  const [job] = await db
    .insert(saasReportExports)
    .values({
      tenantId,
      projectId: payload.projectId ?? null,
      createdByAdminId: actor?.adminId ?? null,
      resource: payload.resource,
      format: payload.format,
      status: "pending",
      fromAt,
      toAt,
    })
    .returning();

  return toSaasReportExportJob(job);
}

export async function listSaasReportExportJobs(
  tenantId: number,
  actor: SaasAdminActor,
  options: {
    downloadUrlBase: string;
    limit?: number;
  },
): Promise<SaasReportExportJob[]> {
  await assertTenantCapability(actor, tenantId, "tenant:read");

  const rows = await db
    .select()
    .from(saasReportExports)
    .where(eq(saasReportExports.tenantId, tenantId))
    .orderBy(desc(saasReportExports.createdAt), desc(saasReportExports.id))
    .limit(resolveListLimit(options.limit));

  const now = Date.now();
  return Promise.all(
    rows.map(async (row) => {
      const hasDownload =
        row.status === "completed" &&
        Boolean(row.content) &&
        Boolean(row.fileName) &&
        Boolean(row.contentType) &&
        (!row.expiresAt || row.expiresAt.getTime() > now);

      if (!hasDownload) {
        return toSaasReportExportJob(row);
      }

      const token = await signDownloadToken(row.id);
      return toSaasReportExportJob(row, {
        url: `${buildDownloadUrlBase(options.downloadUrlBase, row.id)}?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(
          Date.now() + REPORT_EXPORT_DOWNLOAD_TTL_SECONDS * 1000,
        ),
      });
    }),
  );
}

export async function loadSaasReportExportDownload(token: string) {
  let exportId: number;
  try {
    exportId = await verifyDownloadToken(token);
  } catch {
    throw notFoundError("Report export download not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  const [job] = await db
    .select()
    .from(saasReportExports)
    .where(eq(saasReportExports.id, exportId))
    .limit(1);

  if (
    !job ||
    job.status !== "completed" ||
    !job.content ||
    !job.fileName ||
    !job.contentType ||
    (job.expiresAt && job.expiresAt.getTime() <= Date.now())
  ) {
    throw notFoundError("Report export download not found.", {
      code: API_ERROR_CODES.NOT_FOUND,
    });
  }

  return {
    content: job.content,
    contentType: job.contentType,
    fileName: job.fileName,
  };
}

const claimQueuedSaasReportExports = async (params: {
  limit: number;
  lockTimeoutMs: number;
}) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleLockCutoff = new Date(now.getTime() - params.lockTimeoutMs);
  const staleLockCutoffIso = staleLockCutoff.toISOString();

  const result = await db.execute(sql`
    WITH picked AS (
      SELECT id
      FROM ${saasReportExports}
      WHERE (
        ${saasReportExports.status} = 'pending'
        OR (
          ${saasReportExports.status} = 'processing'
          AND (${saasReportExports.lockedAt} IS NULL OR ${saasReportExports.lockedAt} <= ${staleLockCutoffIso})
        )
      )
      ORDER BY ${saasReportExports.createdAt} ASC, ${saasReportExports.id} ASC
      LIMIT ${params.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${saasReportExports}
    SET
      status = 'processing',
      locked_at = ${nowIso},
      attempts = ${saasReportExports.attempts} + 1,
      updated_at = ${nowIso}
    FROM picked
    WHERE ${saasReportExports.id} = picked.id
    RETURNING
      ${saasReportExports.id} AS "id",
      ${saasReportExports.tenantId} AS "tenantId",
      ${saasReportExports.projectId} AS "projectId",
      ${saasReportExports.createdByAdminId} AS "createdByAdminId",
      ${saasReportExports.resource} AS "resource",
      ${saasReportExports.format} AS "format",
      ${saasReportExports.status} AS "status",
      ${saasReportExports.rowCount} AS "rowCount",
      ${saasReportExports.contentType} AS "contentType",
      ${saasReportExports.fileName} AS "fileName",
      ${saasReportExports.content} AS "content",
      ${saasReportExports.fromAt} AS "fromAt",
      ${saasReportExports.toAt} AS "toAt",
      ${saasReportExports.lastError} AS "lastError",
      ${saasReportExports.attempts} AS "attempts",
      ${saasReportExports.lockedAt} AS "lockedAt",
      ${saasReportExports.completedAt} AS "completedAt",
      ${saasReportExports.expiresAt} AS "expiresAt",
      ${saasReportExports.createdAt} AS "createdAt",
      ${saasReportExports.updatedAt} AS "updatedAt"
  `);

  return readSqlRows<typeof saasReportExports.$inferSelect>(result).map(
    (row) => ({
      ...row,
      fromAt: toDate(row.fromAt),
      toAt: toDate(row.toAt),
      lockedAt: toNullableDate(row.lockedAt),
      completedAt: toNullableDate(row.completedAt),
      expiresAt: toNullableDate(row.expiresAt),
      createdAt: toDate(row.createdAt),
      updatedAt: toDate(row.updatedAt),
    }),
  );
};

export async function runSaasReportExportCycle(params?: {
  limit?: number;
  lockTimeoutMs?: number;
}) {
  const config = getConfig();
  const limit = Math.max(1, params?.limit ?? config.saasReportExportBatchSize);
  const lockTimeoutMs = Math.max(
    1_000,
    params?.lockTimeoutMs ?? config.saasReportExportLockTimeoutMs,
  );
  const claimed = await claimQueuedSaasReportExports({
    limit,
    lockTimeoutMs,
  });

  let processed = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      const artifact = await buildExportArtifact(job);
      const now = new Date();

      await db
        .update(saasReportExports)
        .set({
          status: "completed",
          rowCount: artifact.rowCount,
          contentType: artifact.contentType,
          fileName: artifact.fileName,
          content: artifact.content,
          lastError: null,
          lockedAt: null,
          completedAt: now,
          expiresAt: new Date(now.getTime() + REPORT_EXPORT_RETENTION_MS),
          updatedAt: now,
        })
        .where(eq(saasReportExports.id, job.id));

      processed += 1;
    } catch (error) {
      failed += 1;
      const now = new Date();

      await db
        .update(saasReportExports)
        .set({
          status: "failed",
          rowCount: null,
          contentType: null,
          fileName: null,
          content: null,
          lockedAt: null,
          completedAt: null,
          expiresAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown report export processing error.",
          updatedAt: now,
        })
        .where(eq(saasReportExports.id, job.id));

      captureException(error, {
        tags: {
          alert_priority: "medium",
          service_role: "saas_billing_worker",
          saas_subsystem: "report_exports",
        },
        extra: {
          saasReportExportId: job.id,
          tenantId: job.tenantId,
          projectId: job.projectId,
          resource: job.resource,
          format: job.format,
        },
      });
      logger.error("saas report export processing failed", {
        saasReportExportId: job.id,
        tenantId: job.tenantId,
        projectId: job.projectId,
        err: error,
      });
    }
  }

  return {
    claimed: claimed.length,
    processed,
    failed,
  };
}
