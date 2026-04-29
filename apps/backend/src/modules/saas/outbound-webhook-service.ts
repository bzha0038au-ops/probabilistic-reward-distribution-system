import { createHmac } from "node:crypto";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasOutboundWebhookDeliveries,
  saasOutboundWebhooks,
} from "@reward/database";
import { and, eq, sql } from "@reward/database/orm";
import type {
  PrizeEngineDrawResponse,
  SaasOutboundWebhookCreate,
  SaasOutboundWebhookPatch,
} from "@reward/shared-types/saas";

import { db, type DbTransaction } from "../../db";
import { getConfigView } from "../../shared/config";
import { badRequestError, notFoundError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { readSqlRows } from "../../shared/sql-result";
import { captureException } from "../../shared/telemetry";
import { type SaasAdminActor, assertProjectCapability } from "./access";
import {
  normalizeOutboundWebhookEvents,
  toSaasOutboundWebhook,
} from "./records";

const config = getConfigView();
const REWARD_COMPLETED_EVENT = "reward.completed" as const;

type ClaimedOutboundWebhookDelivery = Omit<
  typeof saasOutboundWebhookDeliveries.$inferSelect,
  "payload"
> & {
  payload: unknown;
};

type RewardCompletedWebhookInput = {
  project: {
    id: number;
    tenantId: number;
    slug: string;
    name: string;
    environment: string;
    currency: string;
  };
  response: PrizeEngineDrawResponse;
};

type OutboundWebhookDeliveryPayload = {
  eventId: string;
  type: typeof REWARD_COMPLETED_EVENT;
  occurredAt: string;
  project: RewardCompletedWebhookInput["project"];
  data: PrizeEngineDrawResponse;
};

class OutboundWebhookDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly responseCode?: number | null,
    readonly responseBody?: string | null,
  ) {
    super(message);
    this.name = "OutboundWebhookDeliveryError";
  }
}

const normalizeWebhookUrl = (value: string) => value.trim();

const resolveWebhookEvents = (value: unknown) => {
  const events = normalizeOutboundWebhookEvents(value);
  if (events.length > 0) {
    return events;
  }

  throw badRequestError("Outbound webhook must subscribe to at least one event.", {
    code: API_ERROR_CODES.INVALID_REQUEST,
  });
};

const computeRetryDelayMs = (attempts: number) => {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(5_000 * 2 ** exponent, 15 * 60 * 1000);
};

const truncate = (value: string, max = 2_000) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const withTimeout = async <T>(runner: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.saasOutboundWebhookRequestTimeoutMs,
  );

  try {
    return await runner(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OutboundWebhookDeliveryError(
        "Outbound webhook request timed out.",
        true,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const buildRewardCompletedEventId = (projectId: number, drawRecordId: number) =>
  `${REWARD_COMPLETED_EVENT}:${projectId}:${drawRecordId}`;

const toIsoString = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
};

const buildRewardCompletedPayload = (
  input: RewardCompletedWebhookInput,
): OutboundWebhookDeliveryPayload => {
  const eventId = buildRewardCompletedEventId(
    input.project.id,
    input.response.result.id,
  );

  return {
    eventId,
    type: REWARD_COMPLETED_EVENT,
    occurredAt: toIsoString(input.response.result.createdAt),
    project: input.project,
    data: input.response,
  };
};

const parseOutboundWebhookDeliveryPayload = (
  value: unknown,
): OutboundWebhookDeliveryPayload => {
  const parsed =
    typeof value === "string"
      ? parseOutboundWebhookDeliveryPayload(JSON.parse(value) as unknown)
      : value;

  if (!parsed || typeof parsed !== "object") {
    throw new OutboundWebhookDeliveryError(
      "Outbound webhook payload is invalid.",
      false,
    );
  }

  return parsed as OutboundWebhookDeliveryPayload;
};

export async function createSaasOutboundWebhook(
  projectId: number,
  payload: SaasOutboundWebhookCreate,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "project:write");

  const [created] = await db
    .insert(saasOutboundWebhooks)
    .values({
      projectId,
      url: normalizeWebhookUrl(payload.url),
      secret: payload.secret.trim(),
      events: resolveWebhookEvents(payload.events),
      isActive: payload.isActive ?? true,
    })
    .returning();

  return toSaasOutboundWebhook(created);
}

export async function updateSaasOutboundWebhook(
  projectId: number,
  webhookId: number,
  payload: SaasOutboundWebhookPatch,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "project:write");

  const [updated] = await db
    .update(saasOutboundWebhooks)
    .set({
      ...(payload.url !== undefined
        ? { url: normalizeWebhookUrl(payload.url) }
        : {}),
      ...(payload.secret !== undefined ? { secret: payload.secret.trim() } : {}),
      ...(payload.events !== undefined
        ? { events: resolveWebhookEvents(payload.events) }
        : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saasOutboundWebhooks.id, webhookId),
        eq(saasOutboundWebhooks.projectId, projectId),
      ),
    )
    .returning();

  if (!updated) {
    throw notFoundError("Outbound webhook not found.", {
      code: API_ERROR_CODES.SAAS_OUTBOUND_WEBHOOK_NOT_FOUND,
    });
  }

  return toSaasOutboundWebhook(updated);
}

export async function deleteSaasOutboundWebhook(
  projectId: number,
  webhookId: number,
  actor?: SaasAdminActor,
) {
  await assertProjectCapability(actor ?? null, projectId, "project:write");

  const [deleted] = await db
    .delete(saasOutboundWebhooks)
    .where(
      and(
        eq(saasOutboundWebhooks.id, webhookId),
        eq(saasOutboundWebhooks.projectId, projectId),
      ),
    )
    .returning();

  if (!deleted) {
    throw notFoundError("Outbound webhook not found.", {
      code: API_ERROR_CODES.SAAS_OUTBOUND_WEBHOOK_NOT_FOUND,
    });
  }

  return toSaasOutboundWebhook(deleted);
}

export async function enqueueRewardCompletedWebhookDeliveries(
  input: RewardCompletedWebhookInput,
  dbExecutor: Pick<typeof db, "select" | "insert"> | DbTransaction = db,
) {
  const webhooks = await dbExecutor
    .select()
    .from(saasOutboundWebhooks)
    .where(
      and(
        eq(saasOutboundWebhooks.projectId, input.project.id),
        eq(saasOutboundWebhooks.isActive, true),
      ),
    );

  const subscribed = webhooks.filter((webhook) =>
    normalizeOutboundWebhookEvents(webhook.events).includes(REWARD_COMPLETED_EVENT),
  );
  if (subscribed.length === 0) {
    return 0;
  }

  const payload = buildRewardCompletedPayload(input);
  const now = new Date();

  await dbExecutor
    .insert(saasOutboundWebhookDeliveries)
    .values(
      subscribed.map((webhook) => ({
        webhookId: webhook.id,
        projectId: input.project.id,
        drawRecordId: input.response.result.id,
        eventType: REWARD_COMPLETED_EVENT,
        eventId: payload.eventId,
        payload,
        status: "pending" as const,
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

  return subscribed.length;
}

const claimDueOutboundWebhookDeliveries = async (limit: number) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleLockCutoff = new Date(
    now.getTime() - config.saasOutboundWebhookLockTimeoutMs,
  );
  const staleLockCutoffIso = staleLockCutoff.toISOString();

  const result = await db.execute(sql`
    WITH picked AS (
      SELECT id
      FROM ${saasOutboundWebhookDeliveries}
      WHERE (
        (
          (${saasOutboundWebhookDeliveries.status} = 'pending' OR ${saasOutboundWebhookDeliveries.status} = 'failed')
          AND ${saasOutboundWebhookDeliveries.attempts} < ${config.saasOutboundWebhookMaxAttempts}
          AND ${saasOutboundWebhookDeliveries.nextAttemptAt} <= ${nowIso}
        )
        OR (
          ${saasOutboundWebhookDeliveries.status} = 'sending'
          AND (${saasOutboundWebhookDeliveries.lockedAt} IS NULL OR ${saasOutboundWebhookDeliveries.lockedAt} <= ${staleLockCutoffIso})
        )
      )
      ORDER BY ${saasOutboundWebhookDeliveries.nextAttemptAt} ASC, ${saasOutboundWebhookDeliveries.id} ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${saasOutboundWebhookDeliveries}
    SET
      status = 'sending',
      locked_at = ${nowIso},
      attempts = ${saasOutboundWebhookDeliveries.attempts} + 1,
      updated_at = ${nowIso}
    FROM picked
    WHERE ${saasOutboundWebhookDeliveries.id} = picked.id
    RETURNING
      ${saasOutboundWebhookDeliveries.id} AS "id",
      ${saasOutboundWebhookDeliveries.webhookId} AS "webhookId",
      ${saasOutboundWebhookDeliveries.projectId} AS "projectId",
      ${saasOutboundWebhookDeliveries.drawRecordId} AS "drawRecordId",
      ${saasOutboundWebhookDeliveries.eventType} AS "eventType",
      ${saasOutboundWebhookDeliveries.eventId} AS "eventId",
      ${saasOutboundWebhookDeliveries.payload} AS "payload",
      ${saasOutboundWebhookDeliveries.status} AS "status",
      ${saasOutboundWebhookDeliveries.attempts} AS "attempts",
      ${saasOutboundWebhookDeliveries.lastHttpStatus} AS "lastHttpStatus",
      ${saasOutboundWebhookDeliveries.lastError} AS "lastError",
      ${saasOutboundWebhookDeliveries.lastResponseBody} AS "lastResponseBody",
      ${saasOutboundWebhookDeliveries.nextAttemptAt} AS "nextAttemptAt",
      ${saasOutboundWebhookDeliveries.lockedAt} AS "lockedAt",
      ${saasOutboundWebhookDeliveries.deliveredAt} AS "deliveredAt",
      ${saasOutboundWebhookDeliveries.createdAt} AS "createdAt",
      ${saasOutboundWebhookDeliveries.updatedAt} AS "updatedAt"
  `);

  return readSqlRows<ClaimedOutboundWebhookDelivery>(result);
};

const markOutboundWebhookDeliveryDelivered = async (
  row: ClaimedOutboundWebhookDelivery,
  response: Response,
  responseBody: string | null,
) => {
  const now = new Date();

  await db
    .update(saasOutboundWebhookDeliveries)
    .set({
      status: "delivered",
      lockedAt: null,
      deliveredAt: now,
      lastHttpStatus: response.status,
      lastError: null,
      lastResponseBody: responseBody,
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(saasOutboundWebhookDeliveries.id, row.id));

  await db
    .update(saasOutboundWebhooks)
    .set({
      lastDeliveredAt: now,
      updatedAt: now,
    })
    .where(eq(saasOutboundWebhooks.id, row.webhookId));
};

const markOutboundWebhookDeliveryFailed = async (
  row: ClaimedOutboundWebhookDelivery,
  error: OutboundWebhookDeliveryError,
) => {
  const attempts = Math.max(1, Number(row.attempts ?? 1));
  const terminal =
    !error.retryable || attempts >= config.saasOutboundWebhookMaxAttempts;

  await db
    .update(saasOutboundWebhookDeliveries)
    .set({
      status: "failed",
      attempts: terminal ? config.saasOutboundWebhookMaxAttempts : attempts,
      lockedAt: null,
      lastHttpStatus: error.responseCode ?? null,
      lastError: truncate(error.message),
      lastResponseBody: error.responseBody ?? null,
      nextAttemptAt: terminal
        ? new Date()
        : new Date(Date.now() + computeRetryDelayMs(attempts)),
      updatedAt: new Date(),
    })
    .where(eq(saasOutboundWebhookDeliveries.id, row.id));
};

const dispatchOutboundWebhookDelivery = async (
  row: ClaimedOutboundWebhookDelivery,
) => {
  const [webhook] = await db
    .select()
    .from(saasOutboundWebhooks)
    .where(
      and(
        eq(saasOutboundWebhooks.id, row.webhookId),
        eq(saasOutboundWebhooks.projectId, row.projectId),
      ),
    )
    .limit(1);

  if (!webhook || !webhook.isActive) {
    throw new OutboundWebhookDeliveryError(
      "Outbound webhook endpoint is missing or inactive.",
      false,
    );
  }

  const payload = parseOutboundWebhookDeliveryPayload(row.payload);
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", webhook.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const response = await withTimeout((signal) =>
    fetch(webhook.url, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "reward-saas-webhook/1.0",
        "x-reward-webhook-delivery-id": String(row.id),
        "x-reward-webhook-event": row.eventType,
        "x-reward-webhook-event-id": row.eventId,
        "x-reward-webhook-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    }),
  );

  const responseText = truncate(await response.text());
  if (!response.ok) {
    throw new OutboundWebhookDeliveryError(
      `Outbound webhook request failed with status ${response.status}.`,
      response.status >= 500 || response.status === 408 || response.status === 429,
      response.status,
      responseText,
    );
  }

  await markOutboundWebhookDeliveryDelivered(
    row,
    response,
    responseText || null,
  );
};

export async function runSaasOutboundWebhookDeliveryCycle(params?: {
  limit?: number;
}) {
  const limit = Math.max(
    1,
    params?.limit ?? config.saasOutboundWebhookBatchSize,
  );
  const claimed = await claimDueOutboundWebhookDeliveries(limit);

  let delivered = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      await dispatchOutboundWebhookDelivery(row);
      delivered += 1;
    } catch (error) {
      failed += 1;
      const normalizedError =
        error instanceof OutboundWebhookDeliveryError
          ? error
          : new OutboundWebhookDeliveryError(
              error instanceof Error
                ? error.message
                : "Outbound webhook delivery failed.",
              true,
            );

      await markOutboundWebhookDeliveryFailed(row, normalizedError);
      captureException(error, {
        tags: {
          alert_priority: "high",
          service_role: "saas_billing_worker",
          payment_subsystem: "outbound_webhook_dispatch",
        },
        extra: {
          saasOutboundWebhookDeliveryId: row.id,
          saasOutboundWebhookId: row.webhookId,
          saasOutboundWebhookEventId: row.eventId,
        },
      });
      logger.error("saas outbound webhook delivery failed", {
        outboundWebhookDeliveryId: row.id,
        outboundWebhookId: row.webhookId,
        outboundWebhookEventId: row.eventId,
        err: error,
      });
    }
  }

  return {
    claimed: claimed.length,
    delivered,
    failed,
  };
}
