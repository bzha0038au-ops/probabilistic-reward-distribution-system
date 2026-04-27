import type {
  SaasBillingSetupSession,
  SaasCustomerPortalSession,
} from "@reward/shared-types/saas";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { badRequestError, conflictError } from "../../shared/errors";
import { assertTenantCapability } from "./access";
import { loadTenantBillingContext } from "./billing-service-support";
import {
  getSaasStripeClient,
  isSaasStripeEnabled,
  normalizeStripeCurrency,
} from "./stripe";
import { toSaasAdminActor } from "./records";

export async function createCustomerPortalSession(
  tenantId: number,
  input: {
    returnUrl: string;
  },
  adminId?: number | null,
  permissions?: string[],
): Promise<SaasCustomerPortalSession> {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    tenantId,
    "tenant:read",
  );

  const { billingAccount } = await loadTenantBillingContext(tenantId);
  if (!billingAccount.stripeCustomerId) {
    throw badRequestError("Stripe customer is not configured for this tenant.", {
      code: API_ERROR_CODES.STRIPE_CUSTOMER_NOT_CONFIGURED,
    });
  }

  if (!isSaasStripeEnabled()) {
    throw badRequestError("SAAS Stripe is not configured.", {
      code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
    });
  }

  const session = await getSaasStripeClient().billingPortal.sessions.create({
    customer: billingAccount.stripeCustomerId,
    return_url: input.returnUrl,
    ...(billingAccount.portalConfigurationId
      ? { configuration: billingAccount.portalConfigurationId }
      : {}),
  });

  return {
    url: session.url,
  };
}

export async function createBillingSetupSession(
  tenantId: number,
  input: {
    successUrl: string;
    cancelUrl: string;
  },
  adminId?: number | null,
  permissions?: string[],
): Promise<SaasBillingSetupSession> {
  await assertTenantCapability(
    toSaasAdminActor(adminId ?? null, permissions),
    tenantId,
    "tenant:read",
  );

  const { tenant, billingAccount } = await loadTenantBillingContext(tenantId);
  if (!billingAccount.stripeCustomerId) {
    throw badRequestError("Stripe customer is not configured for this tenant.", {
      code: API_ERROR_CODES.STRIPE_CUSTOMER_NOT_CONFIGURED,
    });
  }

  if (!isSaasStripeEnabled()) {
    throw badRequestError("SAAS Stripe is not configured.", {
      code: API_ERROR_CODES.SAAS_STRIPE_NOT_CONFIGURED,
    });
  }

  const session = await getSaasStripeClient().checkout.sessions.create({
    mode: "setup",
    customer: billingAccount.stripeCustomerId,
    currency: normalizeStripeCurrency(billingAccount.currency),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      saasTenantId: String(tenant.id),
      saasTenantSlug: tenant.slug,
    },
  });

  if (!session.url) {
    throw conflictError("Stripe setup session did not return a redirect URL.", {
      code: API_ERROR_CODES.STRIPE_SETUP_SESSION_REDIRECT_URL_MISSING,
    });
  }

  return {
    url: session.url,
  };
}
