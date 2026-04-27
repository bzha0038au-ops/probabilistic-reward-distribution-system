import { and, eq } from '@reward/database/orm';

import { db } from '../../../db';
import { logger } from '../../../shared/logger';
import {
  paymentReconciliationIssues,
} from '@reward/database';
import {
  creditDeposit,
  failDeposit,
  markDepositProviderPending,
  markDepositProviderSucceeded,
  reverseDeposit,
} from '../../top-up/service';
import {
  approveWithdrawal,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
  rejectWithdrawal,
  reverseWithdrawal,
} from '../../withdraw/service';
import {
  buildReconciliationReview,
  isRemoteApprovedLike,
  isRemoteFailureLike,
  isRemoteProcessingLike,
  isRemoteSuccessLike,
  isTimedOutNonTerminalOrder,
  normalizeReference,
  OPEN_ISSUE_STATUS,
  readActionResultStatus,
  RESOLVED_ISSUE_STATUS,
  toMoneyEquals,
  type LocalOrderRow,
} from './workflow';
import type { PaymentAdapterReconciliationOrder } from '../adapters';
import type { ReconciliationFinding } from './findings';
import type { PreparedPaymentProvider } from '../service';

export type AutoRepairAction =
  | 'deposit_mark_provider_pending'
  | 'deposit_mark_provider_succeeded'
  | 'deposit_credit'
  | 'deposit_mark_provider_failed'
  | 'deposit_reverse'
  | 'withdrawal_approve'
  | 'withdrawal_mark_provider_submitted'
  | 'withdrawal_mark_provider_processing'
  | 'withdrawal_reject'
  | 'withdrawal_pay'
  | 'withdrawal_reverse';

type AutoRepairOutcome = {
  actions: AutoRepairAction[];
  error: string | null;
};

const attemptDepositAutoRepair = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timedOut: boolean;
}) => {
  const actions: AutoRepairAction[] = [];
  let currentStatus = params.order.status;
  const remote = params.remote;
  const baseNote = remote
    ? `Payment reconciliation synchronized the deposit with remote status ${remote.status}.`
    : 'Payment reconciliation closed the deposit after no remote order was found.';

  const callAction = async (
    action: AutoRepairAction,
    operation: () => Promise<{ status?: string | null } | null>,
  ) => {
    const result = await operation();
    actions.push(action);
    currentStatus = readActionResultStatus(result, currentStatus);
  };

  if (remote !== null) {
    if (remote.amount && !toMoneyEquals(remote.amount, params.order.amount)) {
      return { actions, error: null } satisfies AutoRepairOutcome;
    }

    if (remote.status === 'pending' && currentStatus === 'requested') {
      await callAction('deposit_mark_provider_pending', () =>
        markDepositProviderPending(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          }),
        ),
      );
    }

    if (isRemoteSuccessLike(remote)) {
      if (currentStatus === 'requested') {
        await callAction('deposit_mark_provider_pending', () =>
          markDepositProviderPending(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }

      if (currentStatus === 'provider_pending' || currentStatus === 'provider_failed') {
        await callAction('deposit_mark_provider_succeeded', () =>
          markDepositProviderSucceeded(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }

      if (currentStatus === 'provider_succeeded') {
        await callAction('deposit_credit', () =>
          creditDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }
    }

    if (isRemoteFailureLike(remote)) {
      if (currentStatus === 'requested' || currentStatus === 'provider_pending') {
        await callAction('deposit_mark_provider_failed', () =>
          failDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      } else if (currentStatus === 'provider_succeeded' || currentStatus === 'credited') {
        await callAction('deposit_reverse', () =>
          reverseDeposit(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }
    }

    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!params.timedOut) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!normalizeReference(params.order.providerReference)) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (currentStatus === 'requested' || currentStatus === 'provider_pending') {
    await callAction('deposit_mark_provider_failed', () =>
      failDeposit(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        }),
      ),
    );
  } else if (currentStatus === 'provider_succeeded') {
    await callAction('deposit_reverse', () =>
      reverseDeposit(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        }),
      ),
    );
  }

  return { actions, error: null } satisfies AutoRepairOutcome;
};

const attemptWithdrawalAutoRepair = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timedOut: boolean;
}) => {
  const actions: AutoRepairAction[] = [];
  let currentStatus = params.order.status;
  const remote = params.remote;
  const baseNote = remote
    ? `Payment reconciliation synchronized the withdrawal with remote status ${remote.status}.`
    : 'Payment reconciliation reversed the withdrawal after no remote order was found.';

  const callAction = async (
    action: AutoRepairAction,
    operation: () => Promise<{ status?: string | null } | null>,
  ) => {
    const result = await operation();
    actions.push(action);
    currentStatus = readActionResultStatus(result, currentStatus);
  };

  if (remote !== null) {
    if (remote.amount && !toMoneyEquals(remote.amount, params.order.amount)) {
      return { actions, error: null } satisfies AutoRepairOutcome;
    }

    if (isRemoteApprovedLike(remote) && currentStatus === 'requested') {
      await callAction('withdrawal_approve', () =>
        approveWithdrawal(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          }),
        ),
      );
    }

    if (isRemoteProcessingLike(remote) || isRemoteSuccessLike(remote)) {
      if (currentStatus === 'requested') {
        await callAction('withdrawal_approve', () =>
          approveWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }

      if (currentStatus === 'approved') {
        await callAction('withdrawal_mark_provider_submitted', () =>
          markWithdrawalProviderSubmitted(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }
    }

    if (isRemoteProcessingLike(remote) || isRemoteSuccessLike(remote)) {
      if (currentStatus === 'approved' || currentStatus === 'provider_submitted') {
        await callAction('withdrawal_mark_provider_processing', () =>
          markWithdrawalProviderProcessing(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }
    }

    if (isRemoteSuccessLike(remote) && currentStatus === 'provider_processing') {
      await callAction('withdrawal_pay', () =>
        payWithdrawal(
          params.order.orderId,
          buildReconciliationReview({
            provider: params.provider,
            order: params.order,
            remote,
            note: baseNote,
          }),
        ),
      );
    }

    if (isRemoteFailureLike(remote)) {
      if (currentStatus === 'requested' || currentStatus === 'approved') {
        await callAction('withdrawal_reject', () =>
          rejectWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      } else if (
        currentStatus === 'provider_submitted' ||
        currentStatus === 'provider_processing' ||
        currentStatus === 'provider_failed' ||
        currentStatus === 'paid'
      ) {
        await callAction('withdrawal_reverse', () =>
          reverseWithdrawal(
            params.order.orderId,
            buildReconciliationReview({
              provider: params.provider,
              order: params.order,
              remote,
              note: baseNote,
            }),
          ),
        );
      }
    }

    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!params.timedOut) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (!normalizeReference(params.order.providerReference)) {
    return { actions, error: null } satisfies AutoRepairOutcome;
  }

  if (
    currentStatus === 'requested' ||
    currentStatus === 'approved' ||
    currentStatus === 'provider_submitted' ||
    currentStatus === 'provider_processing'
  ) {
    await callAction('withdrawal_reverse', () =>
      reverseWithdrawal(
        params.order.orderId,
        buildReconciliationReview({
          provider: params.provider,
          order: params.order,
          remote: null,
          note: baseNote,
        }),
      ),
    );
  }

  return { actions, error: null } satisfies AutoRepairOutcome;
};

export const attemptAutoRepairForOrder = async (params: {
  provider: PreparedPaymentProvider;
  order: LocalOrderRow;
  remote: PaymentAdapterReconciliationOrder | null;
  timeoutMs: number;
  now: Date;
}) => {
  const timedOut = isTimedOutNonTerminalOrder(
    params.order,
    params.now,
    params.timeoutMs,
  );

  try {
    return params.order.flow === 'deposit'
      ? await attemptDepositAutoRepair({
          provider: params.provider,
          order: params.order,
          remote: params.remote,
          timedOut,
        })
      : await attemptWithdrawalAutoRepair({
          provider: params.provider,
          order: params.order,
          remote: params.remote,
          timedOut,
        });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'payment reconciliation auto repair failed';
    logger.error('payment reconciliation auto repair failed', {
      providerId: params.provider.id,
      flow: params.order.flow,
      orderId: params.order.orderId,
      remoteStatus: params.remote?.status ?? null,
      err: error,
    });

    return {
      actions: [],
      error: message,
    } satisfies AutoRepairOutcome;
  }
};

export const upsertIssue = async (
  runId: number,
  providerId: number | null,
  finding: ReconciliationFinding,
) => {
  const now = new Date();
  await db
    .insert(paymentReconciliationIssues)
    .values({
      runId,
      providerId,
      fingerprint: finding.fingerprint,
      flow: finding.flow,
      orderType: finding.orderType,
      orderId: finding.orderId,
      localStatus: finding.localStatus,
      remoteStatus: finding.remoteStatus,
      ledgerStatus: finding.ledgerStatus,
      localReference: finding.localReference,
      remoteReference: finding.remoteReference,
      issueType: finding.issueType,
      severity: finding.severity,
      requiresManualReview: finding.requiresManualReview,
      autoRecheckEligible: finding.autoRecheckEligible,
      status: OPEN_ISSUE_STATUS,
      metadata: finding.metadata,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolvedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: paymentReconciliationIssues.fingerprint,
      set: {
        runId,
        providerId,
        flow: finding.flow,
        orderType: finding.orderType,
        orderId: finding.orderId,
        localStatus: finding.localStatus,
        remoteStatus: finding.remoteStatus,
        ledgerStatus: finding.ledgerStatus,
        localReference: finding.localReference,
        remoteReference: finding.remoteReference,
        issueType: finding.issueType,
        severity: finding.severity,
        requiresManualReview: finding.requiresManualReview,
        autoRecheckEligible: finding.autoRecheckEligible,
        status: OPEN_ISSUE_STATUS,
        metadata: finding.metadata,
        lastDetectedAt: now,
        resolvedAt: null,
        updatedAt: now,
      },
    });
};

export const resolveIssuesForOrder = async (
  order: LocalOrderRow,
  remoteReference?: string | null,
) => {
  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS),
        eq(paymentReconciliationIssues.orderType, order.flow),
        eq(paymentReconciliationIssues.orderId, order.orderId),
      ),
    );

  const normalizedRemoteReference = normalizeReference(remoteReference);
  if (!normalizedRemoteReference) {
    return;
  }

  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS),
        eq(paymentReconciliationIssues.issueType, 'local_order_missing'),
        eq(paymentReconciliationIssues.remoteReference, normalizedRemoteReference),
      ),
    );
};

export const resolveProviderAdapterMissingIssues = async (providerId: number) => {
  await db
    .update(paymentReconciliationIssues)
    .set({
      status: RESOLVED_ISSUE_STATUS,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentReconciliationIssues.providerId, providerId),
        eq(paymentReconciliationIssues.issueType, 'provider_adapter_missing'),
        eq(paymentReconciliationIssues.status, OPEN_ISSUE_STATUS),
      ),
    );
};
