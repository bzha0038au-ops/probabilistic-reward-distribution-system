import {
  financeReviews,
  paymentProviderEvents,
  paymentSettlementEvents,
} from '@reward/database';
import type { DbTransaction } from '../../db';
import type {
  FinanceOrderType,
  FinanceReviewAction,
  FinanceReviewStage,
} from './finance-order';

export async function insertFinanceReview(
  tx: DbTransaction,
  payload: {
    orderType: FinanceOrderType;
    orderId: number;
    action: FinanceReviewAction;
    reviewStage: FinanceReviewStage;
    adminId?: number | null;
    operatorNote: string;
    settlementReference?: string | null;
    processingChannel?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await tx.insert(financeReviews).values({
    orderType: payload.orderType,
    orderId: payload.orderId,
    action: payload.action,
    reviewStage: payload.reviewStage,
    adminId: payload.adminId ?? null,
    operatorNote: payload.operatorNote,
    settlementReference: payload.settlementReference ?? null,
    processingChannel: payload.processingChannel ?? null,
    metadata: payload.metadata ?? null,
  });
}

export async function insertPaymentProviderEvent(
  tx: DbTransaction,
  payload: {
    orderType: FinanceOrderType;
    orderId: number;
    userId?: number | null;
    providerId?: number | null;
    eventType: string;
    providerStatus: string;
    externalReference?: string | null;
    processingChannel?: string | null;
    payload?: Record<string, unknown> | null;
  }
) {
  await tx.insert(paymentProviderEvents).values({
    orderType: payload.orderType,
    orderId: payload.orderId,
    userId: payload.userId ?? null,
    providerId: payload.providerId ?? null,
    eventType: payload.eventType,
    providerStatus: payload.providerStatus,
    externalReference: payload.externalReference ?? null,
    processingChannel: payload.processingChannel ?? null,
    payload: payload.payload ?? null,
  });
}

export async function insertPaymentSettlementEvent(
  tx: DbTransaction,
  payload: {
    orderType: FinanceOrderType;
    orderId: number;
    userId?: number | null;
    eventType: string;
    settlementStatus: string;
    settlementReference?: string | null;
    failureReason?: string | null;
    payload?: Record<string, unknown> | null;
  }
) {
  await tx.insert(paymentSettlementEvents).values({
    orderType: payload.orderType,
    orderId: payload.orderId,
    userId: payload.userId ?? null,
    eventType: payload.eventType,
    settlementStatus: payload.settlementStatus,
    settlementReference: payload.settlementReference ?? null,
    failureReason: payload.failureReason ?? null,
    payload: payload.payload ?? null,
  });
}
