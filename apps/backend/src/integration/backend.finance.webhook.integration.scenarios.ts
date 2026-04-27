import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import Stripe from 'stripe';

import {
  deposits,
  ledgerEntries,
  paymentProviders,
  paymentWebhookEvents,
  userWallets,
} from '@reward/database';

import {
  expectPresent,
  getApp,
  getDb,
  getTopUpModule,
  itIntegration as it,
  seedUserWithWallet,
} from './integration-test-support';

const stripeWebhookUrl = '/payments/webhooks/stripe';

const insertActiveStripeProvider = async (webhookSecret: string) => {
  process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = webhookSecret;

  await getDb().insert(paymentProviders).values({
    name: 'stripe',
    providerType: 'deposit',
    isActive: true,
    config: {
      supportsDeposit: true,
    },
  });
};

const signStripeWebhookPayload = (
  secret: string,
  payload: string,
  timestamp = Math.floor(Date.now() / 1000)
) =>
  Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp,
  });

const postStripeWebhook = (payload: string, signature: string) =>
  getApp().inject({
    method: 'POST',
    url: stripeWebhookUrl,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    payload,
  });

const processQueuedWebhookEvents = async () => {
  const webhookModule = await import('../modules/payment/webhook');
  return webhookModule.processPendingPaymentWebhookEvents();
};

export function registerFinanceWebhookScenarios() {
  it(
    'webhook security: dedupes duplicate verified deliveries before processing',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-deposit@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '18.50',
      }));

      const payload = JSON.stringify({
        id: 'evt_deposit_success_1',
        type: 'deposit.succeeded',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'succeeded',
          settlementReference: 'gw-dep-001',
        },
      });
      const signature = signStripeWebhookPayload(webhookSecret, payload);

      const firstResponse = await postStripeWebhook(payload, signature);

      expect(firstResponse.statusCode).toBe(202);
      expect(firstResponse.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        requeued: false,
        eventId: 'evt_deposit_success_1',
        signatureStatus: 'verified',
      });

      const duplicateResponse = await postStripeWebhook(payload, signature);

      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json().data).toMatchObject({
        accepted: true,
        duplicate: true,
        requeued: false,
        eventId: 'evt_deposit_success_1',
        signatureStatus: 'verified',
      });

      const queuedEvents = await getDb()
        .select({
          eventId: paymentWebhookEvents.eventId,
          payloadRaw: paymentWebhookEvents.payloadRaw,
          receiveCount: paymentWebhookEvents.receiveCount,
          signatureStatus: paymentWebhookEvents.signatureStatus,
          processingStatus: paymentWebhookEvents.processingStatus,
        })
        .from(paymentWebhookEvents)
        .orderBy(asc(paymentWebhookEvents.id));

      expect(queuedEvents).toEqual([
        {
          eventId: 'evt_deposit_success_1',
          payloadRaw: payload,
          receiveCount: 2,
          signatureStatus: 'verified',
          processingStatus: 'pending',
        },
      ]);

      const [depositBeforeProcessing] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositBeforeProcessing?.status).toBe('requested');
      expect(await processQueuedWebhookEvents()).toBe(1);

      const [processedEvent] = await getDb()
        .select({
          processingStatus: paymentWebhookEvents.processingStatus,
          processingAttempts: paymentWebhookEvents.processingAttempts,
          processingResult: paymentWebhookEvents.processingResult,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_success_1'))
        .limit(1);

      expect(processedEvent).toMatchObject({
        processingStatus: 'processed',
        processingAttempts: 1,
        processingResult: expect.objectContaining({
          action: 'deposit_mark_provider_succeeded',
          orderType: 'deposit',
          orderId: requestedDeposit.id,
          finalOrderStatus: 'provider_succeeded',
        }),
      });

      const [depositAfterProcessing] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositAfterProcessing?.status).toBe('provider_succeeded');

      const [wallet] = await getDb()
        .select({ withdrawableBalance: userWallets.withdrawableBalance })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet?.withdrawableBalance).toBe('0.00');

      const entries = await getDb()
        .select({
          entryType: ledgerEntries.entryType,
          amount: ledgerEntries.amount,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id))
        .orderBy(asc(ledgerEntries.id));

      expect(entries).toEqual([]);
    }
  );

  it(
    'webhook security: rejects invalid signatures and keeps deposits at requested',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-invalid-signature@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '11.00',
      }));

      const payload = JSON.stringify({
        id: 'evt_deposit_invalid_sig',
        type: 'deposit.succeeded',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'succeeded',
        },
      });

      const response = await postStripeWebhook(
        payload,
        signStripeWebhookPayload('wrong-webhook-secret', payload)
      );

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        signatureStatus: 'failed',
        signatureReason: 'signature_mismatch',
      });

      expect(await processQueuedWebhookEvents()).toBe(1);

      const [storedEvent] = await getDb()
        .select({
          signatureStatus: paymentWebhookEvents.signatureStatus,
          processingStatus: paymentWebhookEvents.processingStatus,
          processingResult: paymentWebhookEvents.processingResult,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_invalid_sig'))
        .limit(1);

      expect(storedEvent).toMatchObject({
        signatureStatus: 'failed',
        processingStatus: 'ignored',
        processingResult: expect.objectContaining({
          reason: 'signature_verification_failed',
        }),
      });

      const [depositRecord] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositRecord?.status).toBe('requested');
    }
  );

  it(
    'webhook security: rejects replayed Stripe deliveries outside the tolerance window',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-replay@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '14.25',
      }));

      const payload = JSON.stringify({
        id: 'evt_deposit_replay_sig',
        type: 'deposit.succeeded',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'succeeded',
        },
      });

      const response = await postStripeWebhook(
        payload,
        signStripeWebhookPayload(
          webhookSecret,
          payload,
          Math.floor(Date.now() / 1000) - 900
        )
      );

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        signatureStatus: 'failed',
        signatureReason: 'signature_mismatch',
      });

      expect(await processQueuedWebhookEvents()).toBe(1);

      const [storedEvent] = await getDb()
        .select({
          signatureStatus: paymentWebhookEvents.signatureStatus,
          processingStatus: paymentWebhookEvents.processingStatus,
          processingResult: paymentWebhookEvents.processingResult,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_replay_sig'))
        .limit(1);

      expect(storedEvent).toMatchObject({
        signatureStatus: 'failed',
        processingStatus: 'ignored',
        processingResult: expect.objectContaining({
          reason: 'signature_verification_failed',
        }),
      });

      const [depositRecord] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositRecord?.status).toBe('requested');
    }
  );

  it(
    'webhook security: ignores delayed provider_pending events after a success',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-delayed@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '9.90',
      }));

      const successPayload = JSON.stringify({
        id: 'evt_deposit_success_2',
        type: 'deposit.succeeded',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'succeeded',
        },
      });

      const successResponse = await postStripeWebhook(
        successPayload,
        signStripeWebhookPayload(webhookSecret, successPayload)
      );

      expect(successResponse.statusCode).toBe(202);
      expect(await processQueuedWebhookEvents()).toBe(1);

      const delayedPendingPayload = JSON.stringify({
        id: 'evt_deposit_pending_2',
        type: 'deposit.pending',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'pending',
        },
      });

      const delayedResponse = await postStripeWebhook(
        delayedPendingPayload,
        signStripeWebhookPayload(webhookSecret, delayedPendingPayload)
      );

      expect(delayedResponse.statusCode).toBe(202);
      expect(delayedResponse.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        signatureStatus: 'verified',
      });
      expect(await processQueuedWebhookEvents()).toBe(1);

      const eventStates = await getDb()
        .select({
          eventId: paymentWebhookEvents.eventId,
          processingStatus: paymentWebhookEvents.processingStatus,
          processingResult: paymentWebhookEvents.processingResult,
        })
        .from(paymentWebhookEvents)
        .orderBy(asc(paymentWebhookEvents.id));

      expect(eventStates).toEqual([
        {
          eventId: 'evt_deposit_success_2',
          processingStatus: 'processed',
          processingResult: expect.objectContaining({
            action: 'deposit_mark_provider_succeeded',
          }),
        },
        {
          eventId: 'evt_deposit_pending_2',
          processingStatus: 'processed',
          processingResult: expect.objectContaining({
            action: 'deposit_mark_provider_pending',
            finalOrderStatus: 'provider_succeeded',
          }),
        },
      ]);

      const [depositRecord] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositRecord?.status).toBe('provider_succeeded');

      const entries = await getDb()
        .select({
          entryType: ledgerEntries.entryType,
          amount: ledgerEntries.amount,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id))
        .orderBy(asc(ledgerEntries.id));

      expect(entries).toEqual([]);
    }
  );

  it(
    'webhook security: ignores unknown event types without mutating deposits',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-unknown-event@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '7.50',
      }));

      const payload = JSON.stringify({
        id: 'evt_deposit_unknown_type',
        type: 'provider.unknown',
        data: {
          referenceType: 'deposit',
          referenceId: requestedDeposit.id,
          status: 'mystery',
        },
      });

      const response = await postStripeWebhook(
        payload,
        signStripeWebhookPayload(webhookSecret, payload)
      );

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        signatureStatus: 'verified',
      });

      expect(await processQueuedWebhookEvents()).toBe(1);

      const [storedEvent] = await getDb()
        .select({
          processingStatus: paymentWebhookEvents.processingStatus,
          processingResult: paymentWebhookEvents.processingResult,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, 'evt_deposit_unknown_type'))
        .limit(1);

      expect(storedEvent).toMatchObject({
        processingStatus: 'ignored',
        processingResult: expect.objectContaining({
          reason: 'status_not_actionable',
          eventType: 'provider.unknown',
          providerStatus: 'mystery',
          orderType: 'deposit',
          orderId: requestedDeposit.id,
        }),
      });

      const [depositRecord] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositRecord?.status).toBe('requested');
    }
  );

  it(
    'webhook security: fails malformed payloads after signature verification without mutating deposits',
    { tag: 'critical' },
    async () => {
      const webhookSecret = 'integration-stripe-webhook-secret';
      await insertActiveStripeProvider(webhookSecret);

      const user = await seedUserWithWallet({
        email: 'payment-webhook-malformed@example.com',
      });

      const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
        userId: user.id,
        amount: '12.34',
      }));

      const payload = `{"id":"evt_deposit_malformed","type":"deposit.succeeded","data":{"referenceType":"deposit","referenceId":${requestedDeposit.id},`;
      const response = await postStripeWebhook(
        payload,
        signStripeWebhookPayload(webhookSecret, payload)
      );

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toMatchObject({
        accepted: true,
        duplicate: false,
        signatureStatus: 'failed',
      });

      expect(await processQueuedWebhookEvents()).toBe(1);

      const storedEvents = await getDb()
        .select({
          eventId: paymentWebhookEvents.eventId,
          payloadRaw: paymentWebhookEvents.payloadRaw,
          signatureStatus: paymentWebhookEvents.signatureStatus,
          processingStatus: paymentWebhookEvents.processingStatus,
          processingResult: paymentWebhookEvents.processingResult,
          processingError: paymentWebhookEvents.processingError,
        })
        .from(paymentWebhookEvents)
        .orderBy(asc(paymentWebhookEvents.id));

      expect(storedEvents).toEqual([
        {
          eventId: expect.stringMatching(/^payload-sha256:/),
          payloadRaw: payload,
          signatureStatus: 'failed',
          processingStatus: 'ignored',
          processingResult: expect.objectContaining({
            reason: 'signature_verification_failed',
          }),
          processingError: null,
        },
      ]);

      const [depositRecord] = await getDb()
        .select({ status: deposits.status })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(depositRecord?.status).toBe('requested');
    }
  );
}
