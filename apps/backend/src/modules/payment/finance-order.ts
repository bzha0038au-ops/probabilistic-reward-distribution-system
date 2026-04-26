export type FinanceOrderType = 'deposit' | 'withdrawal';

export type DepositStatus =
  | 'requested'
  | 'provider_pending'
  | 'provider_succeeded'
  | 'credited'
  | 'provider_failed'
  | 'reversed';

export type WithdrawalStatus =
  | 'requested'
  | 'approved'
  | 'provider_submitted'
  | 'provider_processing'
  | 'paid'
  | 'provider_failed'
  | 'rejected'
  | 'reversed';

export type FinanceStatus = DepositStatus | WithdrawalStatus;

export type FinanceReviewAction =
  | 'deposit_requested'
  | 'deposit_mark_provider_pending'
  | 'deposit_mark_provider_succeeded'
  | 'deposit_credit'
  | 'deposit_mark_provider_failed'
  | 'deposit_reverse'
  | 'withdrawal_requested'
  | 'withdrawal_approve'
  | 'withdrawal_mark_provider_submitted'
  | 'withdrawal_mark_provider_processing'
  | 'withdrawal_pay'
  | 'withdrawal_mark_provider_failed'
  | 'withdrawal_reject'
  | 'withdrawal_reverse'
  | 'system_timeout_cleanup'
  | 'system_compensation';

export type FinanceReviewStage = 'maker' | 'checker' | 'system';

export type FinanceReviewPayload = {
  adminId?: number | null;
  operatorNote?: string | null;
  settlementReference?: string | null;
  processingChannel?: string | null;
};

export type FinanceSemanticStatus =
  | 'requested'
  | 'pending'
  | 'settled'
  | 'credited'
  | 'failed'
  | 'approved'
  | 'paying'
  | 'paid'
  | 'rejected'
  | 'reversed';

type PendingReviewState = {
  action: FinanceReviewAction;
  targetStatus: FinanceStatus;
  reviewerAdminIds: number[];
  settlementReference: string | null;
  processingChannel: string | null;
  startedAt: string;
};

const DEPOSIT_TERMINAL_STATUSES = new Set<DepositStatus>([
  'credited',
  'provider_failed',
  'reversed',
]);

const WITHDRAWAL_TERMINAL_STATUSES = new Set<WithdrawalStatus>([
  'paid',
  'rejected',
  'reversed',
]);

const DEPOSIT_STATUS_TRANSITIONS = {
  requested: ['provider_pending', 'provider_failed', 'reversed'],
  provider_pending: ['provider_succeeded', 'provider_failed', 'reversed'],
  provider_succeeded: ['credited', 'reversed'],
  credited: ['reversed'],
  provider_failed: [],
  reversed: [],
} as const satisfies Record<DepositStatus, readonly DepositStatus[]>;

const WITHDRAWAL_STATUS_TRANSITIONS = {
  requested: ['approved', 'rejected', 'reversed'],
  approved: ['provider_submitted', 'rejected', 'reversed'],
  provider_submitted: ['provider_processing', 'provider_failed', 'reversed'],
  provider_processing: ['paid', 'provider_failed', 'reversed'],
  paid: ['reversed'],
  provider_failed: ['reversed'],
  rejected: [],
  reversed: [],
} as const satisfies Record<WithdrawalStatus, readonly WithdrawalStatus[]>;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      return toRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

const readNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is number => Number.isFinite(item))
    : [];

const uniqNumbers = (items: number[]) => Array.from(new Set(items));

export const normalizeOptionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const isFinanceTerminalStatus = (
  status: string | null | undefined,
  flow?: FinanceOrderType
) => {
  if (!status) {
    return false;
  }

  if (flow === 'deposit') {
    return DEPOSIT_TERMINAL_STATUSES.has(status as DepositStatus);
  }

  if (flow === 'withdrawal') {
    return WITHDRAWAL_TERMINAL_STATUSES.has(status as WithdrawalStatus);
  }

  return (
    DEPOSIT_TERMINAL_STATUSES.has(status as DepositStatus) ||
    WITHDRAWAL_TERMINAL_STATUSES.has(status as WithdrawalStatus)
  );
};

const canTransitionStatus = <TStatus extends string>(
  transitions: Record<TStatus, readonly TStatus[]>,
  fromStatus: string | null | undefined,
  toStatus: TStatus
) => {
  if (!fromStatus) {
    return false;
  }

  const nextStatuses = transitions[fromStatus as TStatus];
  return Array.isArray(nextStatuses) ? nextStatuses.includes(toStatus) : false;
};

export const canTransitionDepositStatus = (
  fromStatus: string | null | undefined,
  toStatus: DepositStatus
) => canTransitionStatus(DEPOSIT_STATUS_TRANSITIONS, fromStatus, toStatus);

export const canTransitionWithdrawalStatus = (
  fromStatus: string | null | undefined,
  toStatus: WithdrawalStatus
) => canTransitionStatus(WITHDRAWAL_STATUS_TRANSITIONS, fromStatus, toStatus);

export const readFinanceMetadata = (
  existing: unknown
) => toRecord(existing);

export const toDepositSemanticStatus = (
  status: DepositStatus
): FinanceSemanticStatus => {
  switch (status) {
    case 'requested':
      return 'requested';
    case 'provider_pending':
      return 'pending';
    case 'provider_succeeded':
      return 'settled';
    case 'credited':
      return 'credited';
    case 'provider_failed':
      return 'failed';
    case 'reversed':
      return 'reversed';
  }
};

export const toWithdrawalSemanticStatus = (
  status: WithdrawalStatus
): FinanceSemanticStatus => {
  switch (status) {
    case 'requested':
      return 'requested';
    case 'approved':
      return 'approved';
    case 'provider_submitted':
    case 'provider_processing':
      return 'paying';
    case 'provider_failed':
      return 'failed';
    case 'paid':
      return 'paid';
    case 'rejected':
      return 'rejected';
    case 'reversed':
      return 'reversed';
  }
};

const readPendingReviewState = (
  existing: Record<string, unknown> | null | undefined
): PendingReviewState | null => {
  const metadata = readFinanceMetadata(existing);
  const raw = toRecord(Reflect.get(metadata, 'pendingReview'));
  const action = Reflect.get(raw, 'action');
  const targetStatus = Reflect.get(raw, 'targetStatus');

  if (typeof action !== 'string' || typeof targetStatus !== 'string') {
    return null;
  }

  return {
    action: action as FinanceReviewAction,
    targetStatus: targetStatus as FinanceStatus,
    reviewerAdminIds: uniqNumbers(readNumberArray(Reflect.get(raw, 'reviewerAdminIds'))),
    settlementReference: normalizeOptionalString(
      Reflect.get(raw, 'settlementReference') as string | null | undefined
    ),
    processingChannel: normalizeOptionalString(
      Reflect.get(raw, 'processingChannel') as string | null | undefined
    ),
    startedAt:
      typeof Reflect.get(raw, 'startedAt') === 'string'
        ? (Reflect.get(raw, 'startedAt') as string)
        : new Date().toISOString(),
  };
};

type DualReviewParams = {
  action: FinanceReviewAction;
  targetStatus: FinanceStatus;
  review: FinanceReviewPayload;
  requireSettlementReference?: boolean;
  bypassDualReview?: boolean;
};

export type DualReviewResult = {
  confirmed: boolean;
  reviewStage: FinanceReviewStage;
  metadata: Record<string, unknown>;
  effectiveReview: {
    adminId: number | null;
    operatorNote: string;
    settlementReference: string | null;
    processingChannel: string | null;
  };
};

export function applyDualReviewGate(
  existing: unknown,
  params: DualReviewParams
): DualReviewResult {
  const metadata = readFinanceMetadata(existing);
  const adminId = params.review.adminId ?? null;
  const operatorNote = normalizeOptionalString(params.review.operatorNote);
  const settlementReference = normalizeOptionalString(
    params.review.settlementReference
  );
  const processingChannel = normalizeOptionalString(params.review.processingChannel);

  if (!operatorNote) {
    throw new Error('Operator note is required.');
  }
  if (params.requireSettlementReference && !settlementReference) {
    throw new Error('Settlement reference is required.');
  }

  if (params.bypassDualReview || adminId === null) {
    return {
      confirmed: true,
      reviewStage: adminId === null ? 'system' : 'checker',
      metadata: {
        ...metadata,
        pendingReview: null,
        pendingReviewAction: null,
        pendingReviewCount: 0,
        pendingReviewTargetStatus: null,
      },
      effectiveReview: {
        adminId,
        operatorNote,
        settlementReference,
        processingChannel,
      },
    };
  }

  const pending = readPendingReviewState(metadata);
  if (pending && (pending.action !== params.action || pending.targetStatus !== params.targetStatus)) {
    throw new Error('Another review is already pending for this order.');
  }
  if (pending && pending.action === params.action && pending.targetStatus === params.targetStatus) {
    if (pending.reviewerAdminIds.includes(adminId)) {
      throw new Error('A different reviewer must confirm this action.');
    }

    if (
      pending.settlementReference &&
      settlementReference &&
      pending.settlementReference !== settlementReference
    ) {
      throw new Error('Settlement reference must match the pending review.');
    }

    if (
      pending.processingChannel &&
      processingChannel &&
      pending.processingChannel !== processingChannel
    ) {
      throw new Error('Processing channel must match the pending review.');
    }

    return {
      confirmed: true,
      reviewStage: 'checker',
      metadata: {
        ...metadata,
        pendingReview: null,
        pendingReviewAction: null,
        pendingReviewCount: 0,
        pendingReviewTargetStatus: null,
      },
      effectiveReview: {
        adminId,
        operatorNote,
        settlementReference: settlementReference ?? pending.settlementReference,
        processingChannel: processingChannel ?? pending.processingChannel,
      },
    };
  }

  const pendingReview: PendingReviewState = {
    action: params.action,
    targetStatus: params.targetStatus,
    reviewerAdminIds: [adminId],
    settlementReference,
    processingChannel,
    startedAt: new Date().toISOString(),
  };

  return {
    confirmed: false,
    reviewStage: 'maker',
    metadata: {
      ...metadata,
      pendingReview,
      pendingReviewAction: params.action,
      pendingReviewCount: pendingReview.reviewerAdminIds.length,
      pendingReviewTargetStatus: params.targetStatus,
    },
    effectiveReview: {
      adminId,
      operatorNote,
      settlementReference,
      processingChannel,
    },
  };
}

export function appendFinanceReviewMetadata(
  existing: unknown,
  entry: {
    action: FinanceReviewAction;
    reviewStage: FinanceReviewStage;
    adminId?: number | null;
    operatorNote: string;
    settlementReference?: string | null;
    processingChannel?: string | null;
  }
) {
  const metadata = readFinanceMetadata(existing);
  const reviewTrail = Array.isArray(Reflect.get(metadata, 'financeReviewTrail'))
    ? (Reflect.get(metadata, 'financeReviewTrail') as unknown[])
        .map((item) => toRecord(item))
    : [];
  const reviewerAdminIds = uniqNumbers([
    ...readNumberArray(Reflect.get(metadata, 'financeReviewerAdminIds')),
    ...(entry.adminId ? [entry.adminId] : []),
  ]);
  const recordedAt = new Date().toISOString();

  const reviewEntry: Record<string, unknown> = {
    action: entry.action,
    reviewStage: entry.reviewStage,
    adminId: entry.adminId ?? null,
    operatorNote: entry.operatorNote,
    recordedAt,
  };

  if (entry.settlementReference) {
    reviewEntry.settlementReference = entry.settlementReference;
  }
  if (entry.processingChannel) {
    reviewEntry.processingChannel = entry.processingChannel;
  }

  return {
    ...metadata,
    financeReviewLatest: reviewEntry,
    financeReviewTrail: [...reviewTrail, reviewEntry],
    financeReviewerAdminIds: reviewerAdminIds,
  };
}

export function appendFinanceStateMetadata(
  existing: unknown,
  params:
    | {
        flow?: FinanceOrderType;
        fromStatus: FinanceStatus | null;
        toStatus: FinanceStatus;
        action: FinanceReviewAction;
        adminId?: number | null;
        failureReason?: string | null;
        providerStatus?: string | null;
        settlementStatus?: string | null;
        ledgerEntryType?: string | null;
        ledgerState?: 'not_written' | 'written' | 'held';
      }
    | {
        flow: FinanceOrderType;
        status: FinanceStatus;
        failureReason?: string | null;
        providerStatus?: string | null;
        settlementStatus?: string | null;
        ledgerEntryType?: string | null;
        ledgerState?: 'not_written' | 'written' | 'held';
      }
) {
  const metadata = readFinanceMetadata(existing);
  const recordedAt = new Date().toISOString();
  const isSimpleParams = 'status' in params;
  const flow = isSimpleParams
    ? params.flow
    : params.flow ??
      (params.action.startsWith('deposit_') ? 'deposit' : 'withdrawal');
  const fromStatus = isSimpleParams
    ? (Reflect.get(metadata, 'financeCurrentStatus') as FinanceStatus | null | undefined) ??
      null
    : params.fromStatus;
  const toStatus = isSimpleParams ? params.status : params.toStatus;
  const action = isSimpleParams ? 'system_compensation' : params.action;
  const adminId = isSimpleParams ? null : params.adminId ?? null;

  const ledgerEntryTypes = params.ledgerEntryType
    ? Array.from(
        new Set([
          ...((Reflect.get(metadata, 'ledgerEntryTypes') as string[] | undefined) ?? []),
          params.ledgerEntryType,
        ])
      )
    : ((Reflect.get(metadata, 'ledgerEntryTypes') as string[] | undefined) ?? []);

  const semanticStatus =
    flow === 'deposit'
      ? toDepositSemanticStatus(toStatus as DepositStatus)
      : toWithdrawalSemanticStatus(toStatus as WithdrawalStatus);

  const stateEntry: Record<string, unknown> = {
    flow,
    fromStatus,
    toStatus,
    action,
    adminId,
    providerStatus: params.providerStatus ?? null,
    settlementStatus: params.settlementStatus ?? null,
    failureReason: params.failureReason ?? null,
    ledgerEntryType: params.ledgerEntryType ?? null,
    ledgerState:
      params.ledgerState ??
      (ledgerEntryTypes.length > 0 ? 'written' : 'not_written'),
    recordedAt,
  };
  const stateTrail = Array.isArray(Reflect.get(metadata, 'financeStateTrail'))
    ? (Reflect.get(metadata, 'financeStateTrail') as unknown[]).map((item) => toRecord(item))
    : [];

  return {
    ...metadata,
    financeCurrentStatus: toStatus,
    financeSemanticStatus: semanticStatus,
    userVisibleStatus: semanticStatus,
    providerStatus: params.providerStatus ?? Reflect.get(metadata, 'providerStatus') ?? null,
    settlementStatus:
      params.settlementStatus ?? Reflect.get(metadata, 'settlementStatus') ?? null,
    ledgerWrittenAt:
      params.ledgerEntryType
        ? recordedAt
        : (Reflect.get(metadata, 'ledgerWrittenAt') as string | null | undefined) ?? null,
    ledgerEntryTypes,
    ledgerState:
      params.ledgerState ??
      (ledgerEntryTypes.length > 0 ? 'written' : 'not_written'),
    failureReason: params.failureReason ?? null,
    manualFallbackStatus: toStatus,
    manualFallbackResolvedAt: isFinanceTerminalStatus(toStatus, flow)
      ? recordedAt
      : null,
    financeStateLatest: stateEntry,
    financeStateTrail: [...stateTrail, stateEntry],
    pendingReview: null,
    pendingReviewAction: null,
    pendingReviewCount: 0,
    pendingReviewTargetStatus: null,
  };
}
