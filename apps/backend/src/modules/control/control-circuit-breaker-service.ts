import { API_ERROR_CODES } from '@reward/shared-types/api';
import { eq } from '@reward/database/orm';

import { paymentProviders } from '@reward/database';
import { db } from '../../db';
import { notFoundError } from '../../shared/errors';
import { toControlPaymentProviderRecord } from './control-overview-service';
import { normalizeReason } from './change-request';

const updateProviderCircuitState = async (payload: {
  providerId: number;
  tripped: boolean;
  reason?: string | null;
}) => {
  const [updated] = await db
    .update(paymentProviders)
    .set({
      isCircuitBroken: payload.tripped,
      circuitBrokenAt: payload.tripped ? new Date() : null,
      circuitBreakReason: payload.tripped ? normalizeReason(payload.reason) : null,
      updatedAt: new Date(),
    })
    .where(eq(paymentProviders.id, payload.providerId))
    .returning({
      id: paymentProviders.id,
      name: paymentProviders.name,
      providerType: paymentProviders.providerType,
      priority: paymentProviders.priority,
      isActive: paymentProviders.isActive,
      isCircuitBroken: paymentProviders.isCircuitBroken,
      circuitBrokenAt: paymentProviders.circuitBrokenAt,
      circuitBreakReason: paymentProviders.circuitBreakReason,
      config: paymentProviders.config,
    });

  if (!updated) {
    throw notFoundError(`Payment provider ${payload.providerId} not found.`, {
      code: API_ERROR_CODES.PAYMENT_PROVIDER_NOT_FOUND,
    });
  }

  return toControlPaymentProviderRecord(updated);
};

export async function tripPaymentProviderCircuitBreaker(payload: {
  providerId: number;
  reason?: string | null;
}) {
  return updateProviderCircuitState({
    providerId: payload.providerId,
    tripped: true,
    reason: payload.reason,
  });
}

export async function resetPaymentProviderCircuitBreaker(payload: {
  providerId: number;
}) {
  return updateProviderCircuitState({
    providerId: payload.providerId,
    tripped: false,
  });
}
