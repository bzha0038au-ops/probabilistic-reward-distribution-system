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
  isBillingRunSyncConflictError,
  parseStripeEventObject,
} from './billing';
import {
  config,
  markBillingRunSyncProcessing,
  recordBillingRunSyncFailure,
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
      const processingRun = await markBillingRunSyncProcessing(run, {
        action: 'stripe_webhook',
        stage: 'invoice_webhook',
        observedInvoiceStatus: context.invoice.status,
        eventType: event.type,
      });
      try {
        await syncBillingRunFromInvoice(processingRun, context.invoice, event.type, {
          action: "stripe_webhook",
          stage: "invoice_webhook",
        });
      } catch (error) {
        if (isBillingRunSyncConflictError(error)) {
          throw error;
        }

        try {
          await recordBillingRunSyncFailure(processingRun, {
            action: 'stripe_webhook',
            stage: 'invoice_webhook',
            error,
            recoveryPath: 'wait_for_stripe_webhook_retry_or_reconciliation',
            observedInvoiceStatus: context.invoice.status,
            eventType: event.type,
          });
        } catch {
          // Preserve the original webhook sync error when failure bookkeeping cannot be written.
        }
        throw error;
      }
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
  let contended = 0;
  for (const row of claimed) {
    try {
      await processSaasStripeWebhookEventRow(row);
      processed += 1;
    } catch (error) {
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

      if (isBillingRunSyncConflictError(error)) {
        contended += 1;
        logger.info('saas stripe webhook event deferred due to billing run contention', {
          saasWebhookEventId: row.id,
          saasStripeEventId: row.eventId,
          attempts,
        });
        continue;
      }

      failed += 1;
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
    contended,
    failed,
  };
}
