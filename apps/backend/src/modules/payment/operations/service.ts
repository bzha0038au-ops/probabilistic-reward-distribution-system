import { and, desc, inArray, lte } from '@reward/database/orm';

import { deposits, withdrawals } from '@reward/database';
import { db } from '../../../db';
import { logger } from '../../../shared/logger';
import { getConfig } from '../../../shared/config';
import { creditDeposit, failDeposit } from '../../top-up/service';
import { reverseWithdrawal } from '../../withdraw/service';

type PaymentOperationsServiceConfig = ReturnType<typeof getConfig> & {
  paymentOperationsTimeoutMinutes: number;
  paymentOperationsBatchSize: number;
};

export type PaymentOperationsTrigger = 'scheduled' | 'manual';

export type PaymentOperationsSummary = {
  trigger: PaymentOperationsTrigger;
  cleanup: {
    depositsExpired: number;
    withdrawalsExpired: number;
  };
  compensation: {
    depositsCredited: number;
    withdrawalsReversed: number;
  };
  scanned: {
    depositsExpired: number;
    withdrawalsExpired: number;
    depositsPendingCredit: number;
    withdrawalsStuckPaying: number;
  };
  startedAt: string;
  completedAt: string;
};

const buildSystemReference = (prefix: string, orderId: number) =>
  `${prefix}-${orderId}-${Date.now()}`;

const buildCutoff = (minutes: number) => new Date(Date.now() - minutes * 60_000);

export async function runPaymentOperationsCycle(input?: {
  trigger?: PaymentOperationsTrigger;
}) {
  const config = getConfig() as PaymentOperationsServiceConfig;
  const startedAt = new Date().toISOString();
  const timeoutCutoff = buildCutoff(config.paymentOperationsTimeoutMinutes);
  const batchSize = config.paymentOperationsBatchSize;

  const [
    staleDeposits,
    staleWithdrawals,
    pendingCreditDeposits,
    stuckPayoutWithdrawals,
  ] = await Promise.all([
    db
      .select({
        id: deposits.id,
        status: deposits.status,
      })
      .from(deposits)
      .where(
        and(
          inArray(deposits.status, ['requested', 'provider_pending']),
          lte(deposits.updatedAt, timeoutCutoff)
        )
      )
      .orderBy(desc(deposits.updatedAt))
      .limit(batchSize),
    db
      .select({
        id: withdrawals.id,
        status: withdrawals.status,
      })
      .from(withdrawals)
      .where(
        and(
          inArray(withdrawals.status, ['requested', 'approved']),
          lte(withdrawals.updatedAt, timeoutCutoff)
        )
      )
      .orderBy(desc(withdrawals.updatedAt))
      .limit(batchSize),
    db
      .select({
        id: deposits.id,
      })
      .from(deposits)
      .where(
        and(
          inArray(deposits.status, ['provider_succeeded']),
          lte(deposits.updatedAt, timeoutCutoff)
        )
      )
      .orderBy(desc(deposits.updatedAt))
      .limit(batchSize),
    db
      .select({
        id: withdrawals.id,
      })
      .from(withdrawals)
      .where(
        and(
          inArray(withdrawals.status, ['provider_submitted', 'provider_processing']),
          lte(withdrawals.updatedAt, timeoutCutoff)
        )
      )
      .orderBy(desc(withdrawals.updatedAt))
      .limit(batchSize),
  ]);

  let depositsExpired = 0;
  let withdrawalsExpired = 0;
  let depositsCredited = 0;
  let withdrawalsReversed = 0;

  for (const deposit of staleDeposits) {
    try {
      const updated = await failDeposit(deposit.id, {
        adminId: null,
        operatorNote:
          'System timeout cleanup marked the stale deposit request as failed.',
        processingChannel: 'system_cleanup',
        settlementReference:
          deposit.status === 'provider_pending'
            ? buildSystemReference('deposit-timeout', deposit.id)
            : null,
      });

      if (updated?.status === 'provider_failed') {
        depositsExpired += 1;
      }
    } catch (error) {
      logger.error('payment cleanup failed for stale deposit', {
        depositId: deposit.id,
        err: error,
      });
    }
  }

  for (const withdrawal of staleWithdrawals) {
    try {
      const updated = await reverseWithdrawal(withdrawal.id, {
        adminId: null,
        operatorNote:
          'System timeout cleanup reversed the stale withdrawal request.',
        processingChannel: 'system_cleanup',
        settlementReference:
          withdrawal.status === 'approved'
            ? buildSystemReference('withdraw-timeout', withdrawal.id)
            : null,
      });

      if (updated?.status === 'reversed') {
        withdrawalsExpired += 1;
      }
    } catch (error) {
      logger.error('payment cleanup failed for stale withdrawal', {
        withdrawalId: withdrawal.id,
        err: error,
      });
    }
  }

  for (const deposit of pendingCreditDeposits) {
    try {
      const updated = await creditDeposit(deposit.id, {
        adminId: null,
        operatorNote:
          'System compensation credited a settled deposit that was stuck before ledger write.',
        processingChannel: 'system_compensation',
      });

      if (updated?.status === 'credited') {
        depositsCredited += 1;
      }
    } catch (error) {
      logger.error('payment compensation failed for settled deposit', {
        depositId: deposit.id,
        err: error,
      });
    }
  }

  for (const withdrawal of stuckPayoutWithdrawals) {
    try {
      const updated = await reverseWithdrawal(withdrawal.id, {
        adminId: null,
        operatorNote:
          'System compensation reversed a payout that stayed stuck in paying state.',
        processingChannel: 'system_compensation',
        settlementReference: buildSystemReference(
          'withdraw-compensation',
          withdrawal.id
        ),
      });

      if (updated?.status === 'reversed') {
        withdrawalsReversed += 1;
      }
    } catch (error) {
      logger.error('payment compensation failed for stuck payout withdrawal', {
        withdrawalId: withdrawal.id,
        err: error,
      });
    }
  }

  return {
    trigger: input?.trigger ?? 'scheduled',
    cleanup: {
      depositsExpired,
      withdrawalsExpired,
    },
    compensation: {
      depositsCredited,
      withdrawalsReversed,
    },
    scanned: {
      depositsExpired: staleDeposits.length,
      withdrawalsExpired: staleWithdrawals.length,
      depositsPendingCredit: pendingCreditDeposits.length,
      withdrawalsStuckPaying: stuckPayoutWithdrawals.length,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  } satisfies PaymentOperationsSummary;
}
