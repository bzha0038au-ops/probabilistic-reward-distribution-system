import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  saasStripeWebhookEvents,
} from '@reward/database';
import {
  eq,
  sql,
} from '@reward/database/orm';

import { db } from '../../db';
import { badRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { readSqlRows } from '../../shared/sql-result';
import { captureException } from '../../shared/telemetry';
import {
  computeWebhookRetryDelayMs,
  parseStripeEventObject,
} from './billing';
import {
  config,
  resolveBillingRunForStripeInvoice,
  resolveStripeWebhookContext,
  syncBillingRunFromInvoice,
} from './billing-service-support';
import {
  getSaasStripeClient,
  getSaasStripeWebhookSecret,
} from './stripe';

const processSaasStripeWebhookEventRow = async (
  row: typeof saasStripeWebhookEvents.$inferSelect
) => {
  const event = parseStripeEventObject(row.payload);
  if (!event) {
    throw badRequestError('Queued SaaS Stripe webhook payload is invalid.', {
      code: API_ERROR_CODES.SAAS_WEBHOOK_PAYLOAD_INVALID,
    });
  }

  const context = await resolveStripeWebhookContext(event);
  if (event.type.startsWith('invoice.') && context.invoice) {
    const run = await resolveBillingRunForStripeInvoice({
      invoice: context.invoice,
      billingRunId: context.billingRunId,
    });
    if (run) {
      await syncBillingRunFromInvoice(run, context.invoice, event.type);
    }
  }

  await db
    .update(saasStripeWebhookEvents)
    .set({
      tenantId: context.tenantId,
      billingRunId: context.billingRunId,
      status: 'processed',
      lastError: null,
      lockedAt: null,
      processedAt: new Date(),
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(saasStripeWebhookEvents.id, row.id));

  return {
    eventId: event.id,
    eventType: event.type,
    tenantId: context.tenantId,
    billingRunId: context.billingRunId,
  };
};

export async function handleSaasStripeWebhook(
  payloadRaw: string,
  signature: string | null
) {
  const webhookSecret = getSaasStripeWebhookSecret();
  if (!webhookSecret) {
    throw badRequestError('SAAS Stripe webhook secret is not configured.', {
      code: API_ERROR_CODES.SAAS_STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED,
    });
  }

  const event = getSaasStripeClient().webhooks.constructEvent(
    payloadRaw,
    signature ?? '',
    webhookSecret
  );
  const context = await resolveStripeWebhookContext(event);
  const payload =
    (() => {
      try {
        return JSON.parse(payloadRaw) as Record<string, unknown>;
      } catch {
        return event as unknown as Record<string, unknown>;
      }
    })();

  const [inserted] = await db
    .insert(saasStripeWebhookEvents)
    .values({
      tenantId: context.tenantId,
      billingRunId: context.billingRunId,
      eventId: event.id,
      eventType: event.type,
      status: 'pending',
      attempts: 0,
      payload,
      nextAttemptAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  const [existing] = inserted
    ? [inserted]
    : await db
        .select()
        .from(saasStripeWebhookEvents)
        .where(eq(saasStripeWebhookEvents.eventId, event.id))
        .limit(1);

  return {
    eventId: event.id,
    eventType: event.type,
    duplicate: !inserted,
    queued: Boolean(inserted),
    status: existing?.status ?? inserted?.status ?? 'pending',
  };
}

export async function runSaasStripeWebhookCompensationCycle(params?: {
  limit?: number;
  lockTimeoutMs?: number;
}) {
  const limit = Math.max(1, params?.limit ?? config.saasBillingWebhookBatchSize);
  const lockTimeoutMs = Math.max(
    1_000,
    params?.lockTimeoutMs ?? config.saasBillingWebhookLockTimeoutMs
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const staleProcessingCutoff = new Date(now.getTime() - lockTimeoutMs);
  const staleProcessingCutoffIso = staleProcessingCutoff.toISOString();
  const result = await db.execute(sql`
    WITH picked AS (
      SELECT id
      FROM ${saasStripeWebhookEvents}
      WHERE (
        (
          (${saasStripeWebhookEvents.status} = 'pending' OR ${saasStripeWebhookEvents.status} = 'failed')
          AND ${saasStripeWebhookEvents.nextAttemptAt} <= ${nowIso}
        )
        OR (
          ${saasStripeWebhookEvents.status} = 'processing'
          AND (${saasStripeWebhookEvents.lockedAt} IS NULL OR ${saasStripeWebhookEvents.lockedAt} <= ${staleProcessingCutoffIso})
        )
      )
      ORDER BY ${saasStripeWebhookEvents.nextAttemptAt} ASC, ${saasStripeWebhookEvents.id} ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${saasStripeWebhookEvents}
    SET
      status = 'processing',
      locked_at = ${nowIso},
      attempts = ${saasStripeWebhookEvents.attempts} + 1,
      updated_at = ${nowIso}
    FROM picked
    WHERE ${saasStripeWebhookEvents.id} = picked.id
    RETURNING
      ${saasStripeWebhookEvents.id} AS "id",
      ${saasStripeWebhookEvents.tenantId} AS "tenantId",
      ${saasStripeWebhookEvents.billingRunId} AS "billingRunId",
      ${saasStripeWebhookEvents.eventId} AS "eventId",
      ${saasStripeWebhookEvents.eventType} AS "eventType",
      ${saasStripeWebhookEvents.status} AS "status",
      ${saasStripeWebhookEvents.attempts} AS "attempts",
      ${saasStripeWebhookEvents.payload} AS "payload",
      ${saasStripeWebhookEvents.lastError} AS "lastError",
      ${saasStripeWebhookEvents.nextAttemptAt} AS "nextAttemptAt",
      ${saasStripeWebhookEvents.lockedAt} AS "lockedAt",
      ${saasStripeWebhookEvents.processedAt} AS "processedAt",
      ${saasStripeWebhookEvents.createdAt} AS "createdAt",
      ${saasStripeWebhookEvents.updatedAt} AS "updatedAt"
  `);
  const claimed = readSqlRows<typeof saasStripeWebhookEvents.$inferSelect>(result);

  let processed = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      await processSaasStripeWebhookEventRow(row);
      processed += 1;
    } catch (error) {
      failed += 1;
      const attempts = Math.max(1, Number(row.attempts ?? 1));
      await db
        .update(saasStripeWebhookEvents)
        .set({
          status: 'failed',
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : 'Unknown Stripe webhook processing error.',
          nextAttemptAt: new Date(Date.now() + computeWebhookRetryDelayMs(attempts)),
          updatedAt: new Date(),
        })
        .where(eq(saasStripeWebhookEvents.id, row.id));
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'saas_billing_worker',
          payment_subsystem: 'webhook_compensation',
        },
        extra: {
          saasWebhookEventId: row.id,
          saasStripeEventId: row.eventId,
          attempts,
        },
      });
      logger.error('saas stripe webhook event processing failed', {
        saasWebhookEventId: row.id,
        saasStripeEventId: row.eventId,
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
