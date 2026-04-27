import {
  saasBillingRuns,
  saasBillingTopUps,
} from '@reward/database';
import {
  and,
  desc,
  sql,
} from '@reward/database/orm';

import { db } from '../../db';
import { logger } from '../../shared/logger';
import { captureException } from '../../shared/telemetry';
import {
  config,
  findStripeBalanceTransactionForTopUp,
  findStripeInvoiceForBillingRun,
  syncBillingRunFromInvoice,
  syncBillingTopUpFromBalanceTransaction,
} from './billing-service-support';
import {
  getSaasStripeClient,
  isSaasStripeEnabled,
} from './stripe';

export async function runSaasStripeReconciliationCycle(params?: {
  limit?: number;
}) {
  if (!isSaasStripeEnabled()) {
    return {
      enabled: false,
      billingRunsChecked: 0,
      billingRunsReconciled: 0,
      billingRunsMissing: 0,
      topUpsChecked: 0,
      topUpsReconciled: 0,
      topUpsMissing: 0,
      failed: 0,
    };
  }

  const limit = Math.max(1, params?.limit ?? config.saasBillingAutomationBatchSize);
  const [billingRunCandidates, topUpCandidates] = await Promise.all([
    db
      .select()
      .from(saasBillingRuns)
      .where(
        and(
          sql`${saasBillingRuns.stripeCustomerId} IS NOT NULL`,
          sql`(
            ${saasBillingRuns.stripeInvoiceId} IS NULL
            OR ${saasBillingRuns.status} NOT IN ('paid', 'void', 'uncollectible')
          )`
        )
      )
      .orderBy(desc(saasBillingRuns.updatedAt))
      .limit(limit),
    db
      .select()
      .from(saasBillingTopUps)
      .where(
        and(
          sql`${saasBillingTopUps.stripeCustomerId} IS NOT NULL`,
          sql`(
            ${saasBillingTopUps.stripeBalanceTransactionId} IS NULL
            OR ${saasBillingTopUps.status} <> 'synced'
          )`
        )
      )
      .orderBy(desc(saasBillingTopUps.updatedAt))
      .limit(limit),
  ]);

  let billingRunsReconciled = 0;
  let billingRunsMissing = 0;
  let topUpsReconciled = 0;
  let topUpsMissing = 0;
  let failed = 0;

  for (const run of billingRunCandidates) {
    try {
      const invoice = run.stripeInvoiceId
        ? await getSaasStripeClient().invoices.retrieve(run.stripeInvoiceId)
        : await findStripeInvoiceForBillingRun(run);
      if (!invoice) {
        billingRunsMissing += 1;
        continue;
      }

      await syncBillingRunFromInvoice(run, invoice);
      billingRunsReconciled += 1;
    } catch (error) {
      failed += 1;
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'saas_billing_worker',
          payment_subsystem: 'reconciliation',
        },
        extra: {
          saasBillingRunId: run.id,
        },
      });
      logger.error('saas billing run reconciliation failed', {
        saasBillingRunId: run.id,
        err: error,
      });
    }
  }

  for (const topUp of topUpCandidates) {
    try {
      const balanceTransaction = topUp.stripeBalanceTransactionId
        ? await getSaasStripeClient().customers.retrieveBalanceTransaction(
            topUp.stripeCustomerId ?? '',
            topUp.stripeBalanceTransactionId
          )
        : await findStripeBalanceTransactionForTopUp(topUp);
      if (!balanceTransaction) {
        topUpsMissing += 1;
        continue;
      }

      await syncBillingTopUpFromBalanceTransaction(topUp, balanceTransaction);
      topUpsReconciled += 1;
    } catch (error) {
      failed += 1;
      captureException(error, {
        tags: {
          alert_priority: 'high',
          service_role: 'saas_billing_worker',
          payment_subsystem: 'reconciliation',
        },
        extra: {
          saasBillingTopUpId: topUp.id,
        },
      });
      logger.error('saas billing top-up reconciliation failed', {
        saasBillingTopUpId: topUp.id,
        err: error,
      });
    }
  }

  return {
    enabled: true,
    billingRunsChecked: billingRunCandidates.length,
    billingRunsReconciled,
    billingRunsMissing,
    topUpsChecked: topUpCandidates.length,
    topUpsReconciled,
    topUpsMissing,
    failed,
  };
}
