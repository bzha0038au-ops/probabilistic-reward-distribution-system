import type { AppInstance } from '../types';

import { handleSaasStripeWebhook } from '../../../modules/saas/service';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';

const readStripeSignature = (
  headers: Record<string, string | string[] | undefined>
) => {
  const value = headers['stripe-signature'];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
};

export async function registerSaasBillingRoutes(app: AppInstance) {
  app.register(async (billingRoutes) => {
    billingRoutes.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body)
    );
    billingRoutes.addContentTypeParser(
      'text/plain',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body)
    );

    billingRoutes.post('/v1/engine/billing/webhooks/stripe', async (request, reply) => {
      const payloadRaw =
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body ?? null);
      const signature = readStripeSignature(
        request.headers as Record<string, string | string[] | undefined>
      );

      if (!signature) {
        return sendError(reply, 400, 'Missing Stripe signature.');
      }

      try {
        const result = await handleSaasStripeWebhook(payloadRaw, signature);
        return sendSuccess(reply, { received: true, ...result }, 202);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to process SaaS billing webhook.'
        );
      }
    });
  });
}
