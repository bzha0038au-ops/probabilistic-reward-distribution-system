import { saasBillingRuns, saasBillingTopUps } from "@reward/database";
import { and, eq, inArray, ne, sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { SaasBillingTopUpCreate } from "@reward/shared-types/saas";

import { db, type DbClient, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  notFoundError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { assertTenantCapability } from "./access";
import {
  findStripeBalanceTransactionForTopUp,
  loadTenantBillingContext,
  syncBillingTopUpFromBalanceTransaction,
} from "./billing-service-support";
import { buildBillingTopUpIdempotencyKey } from "./billing";
import {
  getSaasStripeClient,
  isSaasStripeEnabled,
  normalizeStripeCurrency,
  toStripeAmount,
} from "./stripe";
import {
  normalizeMetadata,
  toSaasAdminActor,
  toSaasBillingTopUp,
} from "./records";

const LOCAL_MANUAL_CREDIT_SOURCE = "local_manual_credit" as const;
const STRIPE_BALANCE_SOURCE = "stripe_balance" as const;
const SUCCESSFUL_TOP_UP_STATUSES = ["applied", "synced"] as const;

type BillingDatabase = DbClient | DbTransaction;

const loadBillingTopUp = async (topUpId: number) => {
  const [topUp] = await db
    .select()
    .from(saasBillingTopUps)
    .where(eq(saasBillingTopUps.id, topUpId))
    .limit(1);

  if (!topUp) {
    throw notFoundError("Billing top-up not found.", {
      code: API_ERROR_CODES.BILLING_TOP_UP_NOT_FOUND,
    });
  }

  return topUp;
};

const mergeTopUpMetadata = (
  value: unknown,
  source: typeof LOCAL_MANUAL_CREDIT_SOURCE | typeof STRIPE_BALANCE_SOURCE,
  appliedAt?: Date,
) =>
  normalizeMetadata({
    ...(normalizeMetadata(value) ?? {}),
    topUpSource: source,
    ...(appliedAt ? { localCreditAppliedAt: appliedAt.toISOString() } : {}),
  });

const applyBillingTopUpLocally = async (
  topUp: typeof saasBillingTopUps.$inferSelect,
) => {
  if (topUp.status === "applied") {
    return toSaasBillingTopUp(topUp);
  }

  const appliedAt = new Date();
  const [updated] = await db
    .update(saasBillingTopUps)
    .set({
      status: "applied",
      syncedAt: appliedAt,
      metadata: mergeTopUpMetadata(
        topUp.metadata,
        LOCAL_MANUAL_CREDIT_SOURCE,
        appliedAt,
      ),
      updatedAt: appliedAt,
    })
    .where(eq(saasBillingTopUps.id, topUp.id))
    .returning();

  return toSaasBillingTopUp(updated ?? topUp);
};

export const readSaasTenantAvailableCreditAmount = async (
  database: BillingDatabase,
  tenantId: number,
  options?: {
    excludeBillingRunId?: number | null;
  },
) => {
  const [topUpTotals] = await database
    .select({
      total: sql<string>`coalesce(sum(${saasBillingTopUps.amount}), 0)::text`,
    })
    .from(saasBillingTopUps)
    .where(
      and(
        eq(saasBillingTopUps.tenantId, tenantId),
        inArray(saasBillingTopUps.status, SUCCESSFUL_TOP_UP_STATUSES),
      ),
    );

  const creditAppliedFilter =
    options?.excludeBillingRunId && options.excludeBillingRunId > 0
      ? and(
          eq(saasBillingRuns.tenantId, tenantId),
          ne(saasBillingRuns.id, options.excludeBillingRunId),
        )
      : eq(saasBillingRuns.tenantId, tenantId);
  const [billingRunTotals] = await database
    .select({
      total: sql<string>`coalesce(sum(${saasBillingRuns.creditAppliedAmount}), 0)::text`,
    })
    .from(saasBillingRuns)
    .where(creditAppliedFilter);

  const availableCreditAmount = toDecimal(topUpTotals?.total ?? "0").minus(
    billingRunTotals?.total ?? "0",
  );

  return toMoneyString(
    availableCreditAmount.greaterThan(0) ? availableCreditAmount : "0",
  );
};

export async function createBillingTopUp(
  payload: SaasBillingTopUpCreate,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  await assertTenantCapability(actor, payload.tenantId, "billing:write");

  const { billingAccount } = await loadTenantBillingContext(payload.tenantId);
  const stripeEnabled = isSaasStripeEnabled();
  const createdAt = new Date();
  const [created] = await db
    .insert(saasBillingTopUps)
    .values({
      tenantId: payload.tenantId,
      billingAccountId: billingAccount.id,
      amount: toMoneyString(payload.amount),
      currency: payload.currency.trim().toUpperCase(),
      note: payload.note?.trim() || null,
      status: stripeEnabled ? "pending" : "applied",
      stripeCustomerId: stripeEnabled ? billingAccount.stripeCustomerId : null,
      syncedAt: stripeEnabled ? null : createdAt,
      metadata: mergeTopUpMetadata(
        payload.metadata,
        stripeEnabled ? STRIPE_BALANCE_SOURCE : LOCAL_MANUAL_CREDIT_SOURCE,
        stripeEnabled ? undefined : createdAt,
      ),
      createdByAdminId: adminId ?? null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to create billing top-up.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_BILLING_TOP_UP,
    });
  }

  if (!stripeEnabled) {
    return applyBillingTopUpLocally(created);
  }

  return syncBillingTopUp(created.id, adminId, permissions);
}

export async function syncBillingTopUp(
  topUpId: number,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  const topUp = await loadBillingTopUp(topUpId);

  await assertTenantCapability(actor, topUp.tenantId, "billing:write");

  if (topUp.status === "applied" || topUp.status === "synced") {
    return toSaasBillingTopUp(topUp);
  }

  if (!isSaasStripeEnabled()) {
    if (!topUp.stripeCustomerId) {
      return applyBillingTopUpLocally(topUp);
    }

    throw badRequestError("SAAS Stripe is not configured.", {
      code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
    });
  }

  if (!topUp.stripeCustomerId) {
    throw badRequestError("Stripe customer is not configured for this tenant.", {
      code: API_ERROR_CODES.STRIPE_CUSTOMER_NOT_CONFIGURED,
    });
  }

  try {
    const stripe = getSaasStripeClient();
    const balanceTransaction =
      (topUp.stripeBalanceTransactionId
        ? await stripe.customers.retrieveBalanceTransaction(
            topUp.stripeCustomerId,
            topUp.stripeBalanceTransactionId,
          )
        : null) ??
      (await findStripeBalanceTransactionForTopUp(topUp)) ??
      (await stripe.customers.createBalanceTransaction(
        topUp.stripeCustomerId,
        {
          amount: -Math.abs(toStripeAmount(topUp.amount)),
          currency: normalizeStripeCurrency(topUp.currency),
          description: topUp.note ?? `SaaS manual top-up #${topUp.id}`,
          metadata: {
            saasTopUpId: String(topUp.id),
            saasTenantId: String(topUp.tenantId),
          },
        },
        {
          idempotencyKey: buildBillingTopUpIdempotencyKey(topUp),
        },
      ));

    return syncBillingTopUpFromBalanceTransaction(topUp, balanceTransaction);
  } catch (error) {
    await db
      .update(saasBillingTopUps)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(saasBillingTopUps.id, topUp.id));
    throw error;
  }
}
