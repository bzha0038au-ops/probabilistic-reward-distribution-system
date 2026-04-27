import { asc, desc, eq } from '@reward/database/orm';

import { db } from '../../../db';
import {
  paymentProviders,
  paymentReconciliationIssues,
  paymentReconciliationRuns,
} from '@reward/database';
import { logger } from '../../../shared/logger';
import { getRegisteredPaymentAdapter } from '../adapters';
import {
  buildOrderFindings,
  buildProviderAdapterMissingFinding,
  buildRemoteOnlyFinding,
  type ReconciliationFinding,
  type ReconciliationRunTrigger,
  type ReconciliationRunStatus,
} from './findings';
import {
  buildRemoteOrderMap,
  getProviderConfigAdapterKey,
  getProviderLookbackMinutes,
  getProviderTimeoutMinutes,
  getSupportedFlows,
  isReconciliationEnabled,
  normalizeLookupKey,
} from './workflow';
import {
  buildLedgerSummaryMap,
  loadLedgerSummaryForOrder,
  loadLocalOrderById,
  loadLocalOrders,
} from './order-service';
import { captureException } from '../../../shared/telemetry';
import {
  attemptAutoRepairForOrder,
  resolveIssuesForOrder,
  resolveProviderAdapterMissingIssues,
  type AutoRepairAction,
  upsertIssue,
} from './repair-service';
import { listActiveProviders, type PreparedPaymentProvider } from '../service';

const createRun = async (params: {
  providerId: number | null;
  trigger: ReconciliationRunTrigger;
  adapter: string | null;
  windowStartedAt: Date;
  windowEndedAt: Date;
}) => {
  const [created] = await db
    .insert(paymentReconciliationRuns)
    .values({
      providerId: params.providerId,
      trigger: params.trigger,
      status: 'running',
      adapter: params.adapter,
      windowStartedAt: params.windowStartedAt,
      windowEndedAt: params.windowEndedAt,
      startedAt: params.windowEndedAt,
      createdAt: params.windowEndedAt,
      updatedAt: params.windowEndedAt,
    })
    .returning();

  return created;
};

const finishRun = async (
  runId: number,
  status: ReconciliationRunStatus,
  summary: unknown,
) => {
  await db
    .update(paymentReconciliationRuns)
    .set({
      status,
      summary,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paymentReconciliationRuns.id, runId));
};

export async function runProviderReconciliation(params: {
  provider: PreparedPaymentProvider;
  trigger: ReconciliationRunTrigger;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const provider = params.provider;
  const adapterKey = getProviderConfigAdapterKey(provider);
  const lookbackMinutes = getProviderLookbackMinutes(provider);
  const timeoutMinutes = getProviderTimeoutMinutes(provider);
  const windowStartedAt = new Date(now.getTime() - lookbackMinutes * 60_000);
  const run = await createRun({
    providerId: provider.id,
    trigger: params.trigger,
    adapter: adapterKey,
    windowStartedAt,
    windowEndedAt: now,
  });

  try {
    const flows = getSupportedFlows(provider);
    if (!isReconciliationEnabled(provider)) {
      await finishRun(run.id, 'skipped', {
        reason: 'provider_reconciliation_disabled',
      });
      return { runId: run.id, status: 'skipped' as const };
    }

    if (flows.length === 0) {
      await finishRun(run.id, 'skipped', {
        reason: 'provider_has_no_supported_flows',
      });
      return { runId: run.id, status: 'skipped' as const };
    }

    const adapter = getRegisteredPaymentAdapter(adapterKey);
    if (!adapter || !adapter.supportsReconciliation) {
      const finding = buildProviderAdapterMissingFinding({
        providerId: provider.id,
        flow: flows[0],
        adapterKey,
      });
      await upsertIssue(run.id, provider.id, finding);
      await finishRun(run.id, 'blocked', {
        reason: 'adapter_missing',
        adapterKey,
        openIssues: 1,
      });
      return { runId: run.id, status: 'blocked' as const };
    }

    await resolveProviderAdapterMissingIssues(provider.id);

    const localOrders = await loadLocalOrders(provider, windowStartedAt);
    const ledgerSummaries = await buildLedgerSummaryMap(localOrders);
    const localReferences = localOrders
      .map((order) => normalizeLookupKey(order.providerReference))
      .filter((value): value is string => value !== null);
    const remoteOrders = await adapter.listOrdersForReconciliation({
      providerId: provider.id,
      config: provider.parsedConfig,
      flows,
      since: windowStartedAt,
      until: now,
      localReferences,
    });
    const remoteOrdersByReference = buildRemoteOrderMap(remoteOrders);

    const findings: ReconciliationFinding[] = [];
    const evaluatedOrders = [];
    const matchedRemoteKeys = new Set<string>();
    const timeoutMs = timeoutMinutes * 60_000;
    const autoRepairActionCounts = new Map<AutoRepairAction, number>();
    let autoRepairAttemptedCount = 0;
    let autoRepairFailedCount = 0;

    for (const originalOrder of localOrders) {
      let order = originalOrder;
      const referenceKey = normalizeLookupKey(order.providerReference);
      const remote = referenceKey ? remoteOrdersByReference.get(referenceKey) ?? null : null;
      if (referenceKey && remote) {
        matchedRemoteKeys.add(referenceKey);
      }

      let ledger = ledgerSummaries.get(order.orderId) ?? {
        status: 'missing_ledger_snapshot',
        healthy: false,
      };

      const autoRepair = await attemptAutoRepairForOrder({
        provider,
        order,
        remote,
        timeoutMs,
        now,
      });
      if (autoRepair.actions.length > 0 || autoRepair.error) {
        autoRepairAttemptedCount += 1;
        if (autoRepair.error) {
          autoRepairFailedCount += 1;
        }
        for (const action of autoRepair.actions) {
          autoRepairActionCounts.set(
            action,
            (autoRepairActionCounts.get(action) ?? 0) + 1,
          );
        }

        const refreshedOrder = await loadLocalOrderById(order.flow, order.orderId);
        if (refreshedOrder) {
          order = refreshedOrder;
          ledger = await loadLedgerSummaryForOrder(order);
        }
      }

      evaluatedOrders.push(order);

      const orderFindings = buildOrderFindings({
        providerId: provider.id,
        order,
        remote,
        ledger,
        now,
        timeoutMs,
      }).map((finding) =>
        autoRepair.actions.length === 0 && autoRepair.error === null
          ? finding
          : {
              ...finding,
              metadata: {
                ...finding.metadata,
                autoRepair: {
                  actions: autoRepair.actions,
                  error: autoRepair.error,
                },
              },
            },
      );

      await resolveIssuesForOrder(order, remote?.referenceId ?? remote?.providerOrderId);

      if (orderFindings.length === 0) {
        continue;
      }

      for (const finding of orderFindings) {
        findings.push(finding);
        await upsertIssue(run.id, provider.id, finding);
      }
    }

    for (const remote of remoteOrders) {
      const key = normalizeLookupKey(remote.referenceId ?? remote.providerOrderId);
      if (!key || matchedRemoteKeys.has(key)) {
        continue;
      }

      const finding = buildRemoteOnlyFinding({
        providerId: provider.id,
        remote,
      });
      findings.push(finding);
      await upsertIssue(run.id, provider.id, finding);
    }

    const summary = {
      providerId: provider.id,
      providerName: provider.name,
      adapterKey: adapter.key,
      flows,
      localOrderCount: localOrders.length,
      remoteOrderCount: remoteOrders.length,
      autoRepairAttemptedCount,
      autoRepairFailedCount,
      autoRepairActionCount: Array.from(autoRepairActionCounts.values()).reduce(
        (total, count) => total + count,
        0,
      ),
      autoRepairActions: Object.fromEntries(autoRepairActionCounts),
      issueCount: findings.length,
      manualQueueCount: findings.filter((finding) => finding.requiresManualReview).length,
      timedOutCount: findings.filter(
        (finding) => finding.issueType === 'timed_out_non_terminal',
      ).length,
      orderStatuses: Object.fromEntries(
        evaluatedOrders.reduce<Map<string, number>>((counts, order) => {
          counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
          return counts;
        }, new Map()),
      ),
    };

    await finishRun(run.id, 'completed', summary);
    logger.info('payment reconciliation run completed', summary);

    return {
      runId: run.id,
      status: 'completed' as const,
      summary,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'payment reconciliation failed';
    await finishRun(run.id, 'failed', {
      error: message,
    });
    captureException(error, {
      tags: {
        alert_priority: 'high',
        service_role: 'payment_reconciliation_worker',
        payment_provider: provider.name,
        payment_provider_id: provider.id,
      },
      extra: {
        reconciliationRunId: run.id,
      },
    });
    logger.error('payment reconciliation run failed', {
      providerId: provider.id,
      err: error,
    });
    throw error;
  }
}

export async function runPaymentReconciliationCycle(params: {
  providerId?: number | null;
  trigger: ReconciliationRunTrigger;
  now?: Date;
}) {
  const providers = await listActiveProviders(db);
  const selectedProviders =
    typeof params.providerId === 'number'
      ? providers.filter((provider) => provider.id === params.providerId)
      : providers;

  const results = [];
  for (const provider of selectedProviders) {
    results.push(
      await runProviderReconciliation({
        provider,
        trigger: params.trigger,
        now: params.now,
      }),
    );
  }

  return {
    providerCount: selectedProviders.length,
    results,
  };
}

export async function listPaymentReconciliationRuns(limit = 50) {
  return db
    .select({
      id: paymentReconciliationRuns.id,
      providerId: paymentReconciliationRuns.providerId,
      providerName: paymentProviders.name,
      trigger: paymentReconciliationRuns.trigger,
      status: paymentReconciliationRuns.status,
      adapter: paymentReconciliationRuns.adapter,
      summary: paymentReconciliationRuns.summary,
      startedAt: paymentReconciliationRuns.startedAt,
      completedAt: paymentReconciliationRuns.completedAt,
      createdAt: paymentReconciliationRuns.createdAt,
    })
    .from(paymentReconciliationRuns)
    .leftJoin(
      paymentProviders,
      eq(paymentProviders.id, paymentReconciliationRuns.providerId),
    )
    .orderBy(desc(paymentReconciliationRuns.id))
    .limit(limit);
}

export async function listPaymentReconciliationIssues(limit = 100) {
  return db
    .select()
    .from(paymentReconciliationIssues)
    .where(eq(paymentReconciliationIssues.status, 'open'))
    .orderBy(
      asc(paymentReconciliationIssues.status),
      desc(paymentReconciliationIssues.lastDetectedAt),
    )
    .limit(limit);
}
