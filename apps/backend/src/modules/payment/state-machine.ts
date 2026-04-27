import { internalInvariantError } from '../../shared/errors';

type TransitionActor = 'user' | 'admin' | 'provider' | 'system';

type TransitionGraph<Status extends string> = Record<Status, readonly Status[]>;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const toTransitionTrail = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  );
};

export const DEPOSIT_STATUSES = [
  'requested',
  'provider_pending',
  'provider_succeeded',
  'provider_failed',
  'credited',
  'reversed',
] as const;

export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const WITHDRAWAL_STATUSES = [
  'requested',
  'approved',
  'provider_submitted',
  'provider_processing',
  'provider_failed',
  'paid',
  'rejected',
  'reversed',
] as const;

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

const depositTransitions = {
  requested: ['provider_pending', 'provider_failed', 'reversed'],
  provider_pending: ['provider_succeeded', 'provider_failed', 'reversed'],
  provider_succeeded: ['credited', 'reversed'],
  provider_failed: [],
  credited: ['reversed'],
  reversed: [],
} satisfies TransitionGraph<DepositStatus>;

const withdrawalTransitions = {
  requested: ['approved', 'rejected', 'reversed'],
  approved: ['provider_submitted', 'rejected', 'reversed'],
  provider_submitted: ['provider_processing', 'provider_failed', 'reversed'],
  provider_processing: ['provider_failed', 'paid', 'reversed'],
  provider_failed: ['reversed'],
  paid: ['reversed'],
  rejected: [],
  reversed: [],
} satisfies TransitionGraph<WithdrawalStatus>;

const depositLedgerStatuses = new Set<DepositStatus>(['credited', 'reversed']);
const withdrawalLedgerStatuses = new Set<WithdrawalStatus>([
  'requested',
  'paid',
  'rejected',
  'reversed',
]);

const hasTransition = <Status extends string>(
  graph: TransitionGraph<Status>,
  from: Status,
  to: Status
) => graph[from].includes(to);

const assertTransition = <Status extends string>(
  graph: TransitionGraph<Status>,
  flow: 'deposit' | 'withdrawal',
  from: Status,
  to: Status
) => {
  if (hasTransition(graph, from, to)) {
    return;
  }

  throw internalInvariantError(`Invalid ${flow} status transition: ${from} -> ${to}.`);
};

const assertInitialState = (
  flow: 'deposit' | 'withdrawal',
  to: DepositStatus | WithdrawalStatus
) => {
  if (to === 'requested') {
    return;
  }

  throw internalInvariantError(`Invalid initial ${flow} status: ${to}.`);
};

export type FinanceStateTransitionInput<Status extends string> = {
  from: Status | null;
  to: Status;
  actor: TransitionActor;
  event: string;
  note?: string | null;
};

const appendFinanceStateTransitionMetadata = <Status extends string>(
  flow: 'deposit' | 'withdrawal',
  existing: unknown,
  input: FinanceStateTransitionInput<Status>
) => {
  const metadata = toRecord(existing);
  const recordedAt = new Date().toISOString();
  const trail = toTransitionTrail(Reflect.get(metadata, 'financeStateTrail'));
  const entry: Record<string, unknown> = {
    flow,
    from: input.from,
    to: input.to,
    actor: input.actor,
    event: input.event,
    recordedAt,
  };

  const note = input.note?.trim() ?? '';
  if (note !== '') {
    entry.note = note;
  }

  return {
    ...metadata,
    financeState: input.to,
    financeStateLatest: entry,
    financeStateTrail: [...trail, entry],
  };
};

export const isDepositStatus = (value: string | null | undefined): value is DepositStatus =>
  typeof value === 'string' && (DEPOSIT_STATUSES as readonly string[]).includes(value);

export const isWithdrawalStatus = (
  value: string | null | undefined
): value is WithdrawalStatus =>
  typeof value === 'string' && (WITHDRAWAL_STATUSES as readonly string[]).includes(value);

export const parseDepositStatus = (value: string | null | undefined): DepositStatus => {
  if (isDepositStatus(value)) {
    return value;
  }

  throw internalInvariantError(`Unknown deposit status: ${value ?? 'null'}.`);
};

export const parseWithdrawalStatus = (
  value: string | null | undefined
): WithdrawalStatus => {
  if (isWithdrawalStatus(value)) {
    return value;
  }

  throw internalInvariantError(`Unknown withdrawal status: ${value ?? 'null'}.`);
};

export const canTransitionDepositStatus = (from: DepositStatus, to: DepositStatus) =>
  hasTransition(depositTransitions, from, to);

export const canTransitionWithdrawalStatus = (
  from: WithdrawalStatus,
  to: WithdrawalStatus
) => hasTransition(withdrawalTransitions, from, to);

export const appendDepositStateTransition = (
  existing: unknown,
  input: FinanceStateTransitionInput<DepositStatus>
) => {
  if (input.from === null) {
    assertInitialState('deposit', input.to);
  } else {
    assertTransition(depositTransitions, 'deposit', input.from, input.to);
  }

  return appendFinanceStateTransitionMetadata('deposit', existing, input);
};

export const appendWithdrawalStateTransition = (
  existing: unknown,
  input: FinanceStateTransitionInput<WithdrawalStatus>
) => {
  if (input.from === null) {
    assertInitialState('withdrawal', input.to);
  } else {
    assertTransition(withdrawalTransitions, 'withdrawal', input.from, input.to);
  }

  return appendFinanceStateTransitionMetadata('withdrawal', existing, input);
};

export const assertDepositLedgerMutationStatus = (status: DepositStatus) => {
  if (depositLedgerStatuses.has(status)) {
    return;
  }

  throw internalInvariantError(`Ledger writes are not allowed for deposit status ${status}.`);
};

export const assertWithdrawalLedgerMutationStatus = (status: WithdrawalStatus) => {
  if (withdrawalLedgerStatuses.has(status)) {
    return;
  }

  throw internalInvariantError(
    `Ledger writes are not allowed for withdrawal status ${status}.`
  );
};
