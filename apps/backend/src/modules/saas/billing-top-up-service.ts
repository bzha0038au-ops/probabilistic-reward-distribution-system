import { saasBillingTopUps } from "@reward/database";
import { eq } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type { SaasBillingTopUpCreate } from "@reward/shared-types/saas";

import { db } from "../../db";
import {
  badRequestError,
  conflictError,
  notFoundError,
} from "../../shared/errors";
import { toMoneyString } from "../../shared/money";
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
import { normalizeMetadata, toSaasAdminActor } from "./records";

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

export async function createBillingTopUp(
  payload: SaasBillingTopUpCreate,
  adminId?: number | null,
  permissions?: string[],
) {
  const actor = toSaasAdminActor(adminId ?? null, permissions);
  await assertTenantCapability(actor, payload.tenantId, "billing:write");

  const { billingAccount } = await loadTenantBillingContext(payload.tenantId);
  const [created] = await db
    .insert(saasBillingTopUps)
    .values({
      tenantId: payload.tenantId,
      billingAccountId: billingAccount.id,
      amount: toMoneyString(payload.amount),
      currency: payload.currency.trim().toUpperCase(),
      note: payload.note?.trim() || null,
      status: "pending",
      stripeCustomerId: billingAccount.stripeCustomerId,
      metadata: normalizeMetadata(payload.metadata),
      createdByAdminId: adminId ?? null,
    })
    .returning();

  if (!created) {
    throw conflictError("Failed to create billing top-up.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_BILLING_TOP_UP,
    });
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

  if (!isSaasStripeEnabled()) {
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
