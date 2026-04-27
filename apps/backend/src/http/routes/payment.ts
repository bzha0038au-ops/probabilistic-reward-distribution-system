import type { AppInstance } from './types';

import { sendError, sendSuccess } from '../respond';
import {
  queuePaymentWebhookEvent,
  readPaymentWebhookEventId,
  readPaymentWebhookEventIdFromHeaders,
  readPaymentWebhookSignatureFromHeaders,
  verifyPaymentWebhookSignature,
} from '../../modules/payment/webhook';

const readString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const safeParseJson = (payloadRaw: string) => {
  try {
    return JSON.parse(payloadRaw) as unknown;
  } catch {
    return null;
  }
};

export async function registerPaymentRoutes(app: AppInstance) {
  app.register(async (paymentRoutes) => {
    paymentRoutes.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body)
    );
    paymentRoutes.addContentTypeParser(
      'text/plain',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body)
    );

    paymentRoutes.post('/payments/webhooks/:provider', async (request, reply) => {
      const provider = readString(Reflect.get(request.params as object, 'provider'));
      if (!provider) {
        return sendError(reply, 400, 'Invalid payment provider.');
      }

      const payloadRaw =
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body ?? null);
      const payloadJson = safeParseJson(payloadRaw);
      const headers = request.headers as Record<string, string | string[] | undefined>;
      const signature = readPaymentWebhookSignatureFromHeaders(headers);
      const eventId =
        readPaymentWebhookEventId(payloadJson) ??
        readPaymentWebhookEventIdFromHeaders(headers);
      const verification = await verifyPaymentWebhookSignature({
        provider,
        headers,
        signature,
        payloadRaw,
      });
      const queued = await queuePaymentWebhookEvent({
        provider,
        eventId,
        signature,
        signatureStatus: verification.signatureStatus,
        payloadRaw,
        payloadJson,
      });

      return sendSuccess(
        reply,
        {
          accepted: true,
          duplicate: queued.duplicate,
          requeued: queued.requeued,
          eventId: queued.event.eventId,
          signatureStatus: verification.signatureStatus,
          signatureReason: verification.reason,
        },
        queued.duplicate ? 200 : 202
      );
    });
  });
}
