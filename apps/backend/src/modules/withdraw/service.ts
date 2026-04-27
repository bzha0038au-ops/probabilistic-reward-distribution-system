import { desc, eq, sql } from "drizzle-orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { userWallets, withdrawals } from "@reward/database";
import { db } from "../../db";
import {
  conflictError,
  persistenceError,
  serviceUnavailableError,
  unprocessableEntityError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { appendFinanceStateMetadata } from "../payment/finance-order";
import { applyLedgerMutation } from "../payment/ledger-mutation";
import { assertWithdrawalLedgerMutationStatus } from "../payment/state-machine";
import {
  getPaymentCapabilitySummary,
  resolvePaymentProcessingContext,
  withPaymentProcessingMetadata,
} from "../payment/service";
import { recordSuspiciousActivity } from "../risk/service";
import {
  getAntiAbuseConfig,
  getConfigDecimal,
  getPaymentConfig,
} from "../system/service";
import {
  MAX_WITHDRAW_PER_DAY_KEY,
  buildWithdrawalBusinessEventId,
  evaluateWithdrawalControls,
  mergeWithdrawalControl,
  selectOwnedPayoutMethod,
  serializeWithdrawal,
  type WithdrawalRequestContext,
} from "./workflow";
export type {
  WithdrawalRequestContext,
  WithdrawalReviewPayload,
  WithdrawalRow,
} from "./workflow";
export { MAX_WITHDRAW_PER_DAY_KEY } from "./workflow";
export {
  approveWithdrawal,
  markWithdrawalProviderFailed,
  markWithdrawalProviderProcessing,
  markWithdrawalProviderSubmitted,
  payWithdrawal,
  rejectWithdrawal,
  reverseWithdrawal,
  startWithdrawalPayout,
} from "./withdraw-lifecycle-service";

export async function listWithdrawals(userId: number, limit = 50) {
  const rows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.id))
    .limit(limit);

  return rows.map((row) => serializeWithdrawal(row));
}

export async function listWithdrawalsAdmin(limit = 50) {
  const rows = await db
    .select()
    .from(withdrawals)
    .orderBy(desc(withdrawals.id))
    .limit(limit);

  return rows.map((row) => serializeWithdrawal(row));
}

export async function createWithdrawal(payload: {
  userId: number;
  amount: string;
  payoutMethodId?: number | null;
  bankCardId?: number | null;
  metadata?: Record<string, unknown> | null;
  requestContext?: WithdrawalRequestContext;
}) {
  return db.transaction(async (tx) => {
    const paymentConfig = await getPaymentConfig(tx);
    if (!paymentConfig.withdrawEnabled) {
      throw serviceUnavailableError("Withdrawals are currently disabled.");
    }

    await tx
      .insert(userWallets)
      .values({ userId: payload.userId })
      .onConflictDoNothing();

    const walletResult = await tx.execute(sql`
      SELECT withdrawable_balance, locked_balance, wagered_amount
      FROM ${userWallets}
      WHERE ${userWallets.userId} = ${payload.userId}
      FOR UPDATE
    `);

    const wallet = readSqlRows<{
      withdrawable_balance: string | number;
      locked_balance: string | number;
      wagered_amount: string | number;
    }>(walletResult)[0];
    if (!wallet) {
      throw persistenceError("Wallet not found.");
    }

    const amount = toDecimal(payload.amount);
    const minAllowed = paymentConfig.minWithdrawAmount;
    const maxAllowed = paymentConfig.maxWithdrawAmount;
    const antiAbuse = await getAntiAbuseConfig(tx);

    if (amount.lte(0)) {
      throw unprocessableEntityError("Amount must be greater than 0.");
    }
    if (minAllowed.gt(0) && amount.lt(minAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: "withdraw_below_min",
          metadata: {
            amount: toMoneyString(amount),
            min: toMoneyString(minAllowed),
          },
        },
        tx,
      );
      throw unprocessableEntityError("Amount below minimum withdrawal.");
    }
    if (maxAllowed.gt(0) && amount.gt(maxAllowed)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: "withdraw_above_max",
          metadata: {
            amount: toMoneyString(amount),
            max: toMoneyString(maxAllowed),
          },
        },
        tx,
      );
      throw unprocessableEntityError("Amount exceeds maximum withdrawal.");
    }

    const maxPerDay = await getConfigDecimal(tx, MAX_WITHDRAW_PER_DAY_KEY, 0);
    if (maxPerDay.gt(0)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ total = 0 }] = await tx
        .select({
          total: sql<number>`coalesce(sum(${withdrawals.amount}), 0)`,
        })
        .from(withdrawals)
        .where(
          sql`${withdrawals.userId} = ${payload.userId} AND ${withdrawals.createdAt} >= ${startOfDay}`,
        );

      const totalToday = toDecimal(total ?? 0);
      if (totalToday.plus(amount).gt(maxPerDay)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: "withdraw_daily_limit",
            metadata: {
              amount: toMoneyString(amount),
              totalToday: toMoneyString(totalToday),
              maxPerDay: toMoneyString(maxPerDay),
            },
          },
          tx,
        );
        throw conflictError("Daily withdrawal limit exceeded.", {
          code: API_ERROR_CODES.DAILY_WITHDRAWAL_LIMIT_EXCEEDED,
        });
      }
    }

    if (antiAbuse.minWagerBeforeWithdraw.gt(0)) {
      const wageredBefore = toDecimal(wallet.wagered_amount ?? 0);
      if (wageredBefore.lt(antiAbuse.minWagerBeforeWithdraw)) {
        await recordSuspiciousActivity(
          {
            userId: payload.userId,
            reason: "withdraw_min_wager",
            metadata: {
              wagered: toMoneyString(wageredBefore),
              required: toMoneyString(antiAbuse.minWagerBeforeWithdraw),
            },
          },
          tx,
        );
        throw conflictError("Minimum wager requirement not met.", {
          code: API_ERROR_CODES.MINIMUM_WAGER_REQUIREMENT_NOT_MET,
        });
      }
    }

    const withdrawableBefore = toDecimal(wallet.withdrawable_balance ?? 0);
    if (withdrawableBefore.lt(amount)) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: "withdraw_insufficient_funds",
          metadata: {
            amount: toMoneyString(amount),
            withdrawable: toMoneyString(withdrawableBefore),
          },
        },
        tx,
      );
      throw conflictError("Insufficient withdrawable balance.", {
        code: API_ERROR_CODES.INSUFFICIENT_WITHDRAWABLE_BALANCE,
      });
    }

    const payoutMethod = await selectOwnedPayoutMethod(
      tx,
      payload.userId,
      payload.payoutMethodId ?? payload.bankCardId,
    );
    const controls = await evaluateWithdrawalControls(tx, {
      userId: payload.userId,
      amount,
      payoutMethod,
      requestContext: payload.requestContext ?? {},
    });

    const withdrawableAfter = withdrawableBefore.minus(amount);
    const lockedAfter = toDecimal(wallet.locked_balance ?? 0).plus(amount);
    const processing = await resolvePaymentProcessingContext(tx, "withdrawal", {
      userId: payload.userId,
      amount: toMoneyString(amount),
      channelType: payoutMethod?.channelType ?? null,
      assetType: payoutMethod?.assetType ?? null,
      assetCode: payoutMethod?.assetCode ?? null,
      network: payoutMethod?.network ?? null,
      metadata: payload.metadata ?? null,
    });
    const capability = getPaymentCapabilitySummary();
    const forcedManual = controls.metadata.manualChannelRequired;
    const paymentMetadata = withPaymentProcessingMetadata(payload.metadata, {
      flow: "withdrawal",
      processingMode: forcedManual ? "manual" : processing.mode,
      manualFallbackRequired: forcedManual
        ? true
        : processing.manualFallbackRequired,
      manualFallbackReason: forcedManual
        ? "risk_manual_review_required"
        : processing.manualFallbackReason,
      paymentProviderId: processing.providerId,
      paymentOperatingMode: capability.operatingMode,
      paymentAutomationRequested: capability.automatedExecutionRequested,
      paymentAutomationReady: capability.automatedExecutionReady,
      paymentAdapterKey: processing.adapterKey,
      paymentAdapterRegistered: processing.adapterRegistered,
    });
    const metadata = appendFinanceStateMetadata(
      mergeWithdrawalControl(paymentMetadata, controls.metadata),
      {
        flow: "withdrawal",
        status: "requested",
        providerStatus: null,
        settlementStatus: null,
        ledgerEntryType: "withdraw_request",
      },
    );

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, payload.userId));

    const [created] = await tx
      .insert(withdrawals)
      .values({
        userId: payload.userId,
        providerId: processing.providerId,
        payoutMethodId: payoutMethod?.id ?? null,
        amount: toMoneyString(amount),
        channelType: payoutMethod?.channelType ?? "fiat",
        assetType: payoutMethod?.assetType ?? "fiat",
        assetCode: payoutMethod?.assetCode ?? null,
        network: payoutMethod?.network ?? null,
        status: "requested",
        metadata,
      })
      .returning();

    assertWithdrawalLedgerMutationStatus("requested");

    if (created) {
      await applyLedgerMutation(tx, {
        businessEventId: buildWithdrawalBusinessEventId(
          created.id,
          "lock_funds",
        ),
        orderType: "withdrawal",
        orderId: created.id,
        userId: payload.userId,
        providerId: processing.providerId,
        mutationType: "withdraw_lock_funds",
        sourceType: "order_request",
        sourceEventKey: null,
        amount: toMoneyString(amount.negated()),
        currency: payoutMethod?.assetCode ?? null,
        entryType: "withdraw_request",
        balanceBefore: toMoneyString(withdrawableBefore),
        balanceAfter: toMoneyString(withdrawableAfter),
        referenceType: "withdrawal",
        referenceId: created.id,
        metadata: {
          status: "requested",
          riskSignals: controls.metadata.riskSignals,
          manualChannelRequired: controls.metadata.manualChannelRequired,
        },
      });
    }

    if (controls.suspiciousSignals.length > 0) {
      await recordSuspiciousActivity(
        {
          userId: payload.userId,
          reason: "withdraw_risk_cluster",
          metadata: {
            signals: controls.suspiciousSignals,
            sharedIpUserCount: controls.metadata.sharedIpUserCount,
            sharedDeviceUserCount: controls.metadata.sharedDeviceUserCount,
            sharedPayoutUserCount: controls.metadata.sharedPayoutUserCount,
            payoutMethodId: payoutMethod?.id ?? null,
          },
          score: controls.suspiciousSignals.length,
        },
        tx,
      );
    }

    return serializeWithdrawal(created ?? null);
  });
}
