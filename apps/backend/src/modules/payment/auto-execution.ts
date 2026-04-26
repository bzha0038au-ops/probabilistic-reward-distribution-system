import type { DepositStatus, WithdrawalStatus } from './state-machine';
import { toDecimal, toMoneyString } from '../../shared/money';

type PaymentWalletSnapshot = {
  withdrawableBalance: string;
  lockedBalance: string;
};

type BaseAutomationSnapshot = {
  amount: string;
  wallet: PaymentWalletSnapshot;
  processedUpdateKeys: string[];
  reconciliationRequired: boolean;
  providerStatus: string | null;
};

export type DepositAutomationSnapshot = BaseAutomationSnapshot & {
  flow: 'deposit';
  orderStatus: DepositStatus;
  credited: boolean;
};

export type WithdrawalAutomationSnapshot = BaseAutomationSnapshot & {
  flow: 'withdrawal';
  orderStatus: WithdrawalStatus;
  lockedAmount: string;
};

export type PaymentAutomationSnapshot =
  | DepositAutomationSnapshot
  | WithdrawalAutomationSnapshot;

export type PaymentAutomationUpdate = {
  source: 'provider_callback' | 'reconciliation';
  dedupeKey: string;
  status: 'success' | 'failed' | 'timeout';
  providerStatus?: string | null;
};

export type PaymentAutomationEffect =
  | { type: 'mark_reconciliation_required' }
  | { type: 'credit_wallet'; amount: string }
  | { type: 'complete_withdrawal'; amount: string }
  | { type: 'unlock_withdrawal'; amount: string };

export type PaymentAutomationResult = {
  snapshot: PaymentAutomationSnapshot;
  duplicate: boolean;
  stateChanged: boolean;
  effects: PaymentAutomationEffect[];
};

const appendProcessedKey = (
  processedUpdateKeys: string[],
  dedupeKey: string
) => Array.from(new Set([...processedUpdateKeys, dedupeKey]));

const resolveProviderStatus = (update: PaymentAutomationUpdate) =>
  update.providerStatus ?? update.status;

const clampAtZero = (value: ReturnType<typeof toDecimal>) =>
  value.isNegative() ? toDecimal(0) : value;

export function applyPaymentAutomationUpdate(
  snapshot: PaymentAutomationSnapshot,
  update: PaymentAutomationUpdate
): PaymentAutomationResult {
  if (snapshot.processedUpdateKeys.includes(update.dedupeKey)) {
    return {
      snapshot,
      duplicate: true,
      stateChanged: false,
      effects: [],
    };
  }

  const nextProcessedUpdateKeys = appendProcessedKey(
    snapshot.processedUpdateKeys,
    update.dedupeKey
  );
  const nextProviderStatus = resolveProviderStatus(update);

  if (update.status === 'timeout') {
    return {
      snapshot: {
        ...snapshot,
        processedUpdateKeys: nextProcessedUpdateKeys,
        providerStatus: nextProviderStatus,
        reconciliationRequired: true,
      },
      duplicate: false,
      stateChanged: true,
      effects: [{ type: 'mark_reconciliation_required' }],
    };
  }

  if (snapshot.flow === 'deposit') {
    if (update.status === 'failed') {
      const nextStatus = snapshot.credited ? snapshot.orderStatus : 'provider_failed';

      return {
        snapshot: {
          ...snapshot,
          processedUpdateKeys: nextProcessedUpdateKeys,
          providerStatus: nextProviderStatus,
          reconciliationRequired: false,
          orderStatus: nextStatus,
        },
        duplicate: false,
        stateChanged: true,
        effects: [],
      };
    }

    if (snapshot.credited) {
      return {
        snapshot: {
          ...snapshot,
          processedUpdateKeys: nextProcessedUpdateKeys,
          providerStatus: nextProviderStatus,
          reconciliationRequired: false,
          orderStatus: 'credited',
        },
        duplicate: false,
        stateChanged: true,
        effects: [],
      };
    }

    const amount = toDecimal(snapshot.amount);
    const withdrawableBefore = toDecimal(snapshot.wallet.withdrawableBalance);
    const withdrawableAfter = withdrawableBefore.plus(amount);

    return {
      snapshot: {
        ...snapshot,
        processedUpdateKeys: nextProcessedUpdateKeys,
        providerStatus: nextProviderStatus,
        reconciliationRequired: false,
        credited: true,
        orderStatus: 'credited',
        wallet: {
          ...snapshot.wallet,
          withdrawableBalance: toMoneyString(withdrawableAfter),
        },
      },
      duplicate: false,
      stateChanged: true,
      effects: [
        {
          type: 'credit_wallet',
          amount: toMoneyString(amount),
        },
      ],
    };
  }

  if (update.status === 'failed') {
    return {
      snapshot: {
        ...snapshot,
        processedUpdateKeys: nextProcessedUpdateKeys,
        providerStatus: nextProviderStatus,
        reconciliationRequired: false,
        orderStatus: 'provider_failed',
      },
      duplicate: false,
      stateChanged: true,
      effects: [],
    };
  }

  const payoutAmount = toDecimal(snapshot.amount);
  const lockedAmount = toDecimal(snapshot.lockedAmount);

  if (lockedAmount.lte(0)) {
    return {
      snapshot: {
        ...snapshot,
        processedUpdateKeys: nextProcessedUpdateKeys,
        providerStatus: nextProviderStatus,
        reconciliationRequired: false,
        orderStatus: 'paid',
      },
      duplicate: false,
      stateChanged: true,
      effects: [],
    };
  }

  const lockedAfter = clampAtZero(
    toDecimal(snapshot.wallet.lockedBalance).minus(payoutAmount)
  );

  return {
    snapshot: {
      ...snapshot,
      processedUpdateKeys: nextProcessedUpdateKeys,
      providerStatus: nextProviderStatus,
      reconciliationRequired: false,
      orderStatus: 'paid',
      lockedAmount: '0.00',
      wallet: {
        ...snapshot.wallet,
        lockedBalance: toMoneyString(lockedAfter),
      },
    },
    duplicate: false,
    stateChanged: true,
    effects: [
      {
        type: 'complete_withdrawal',
        amount: toMoneyString(payoutAmount),
      },
    ],
  };
}
