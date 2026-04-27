import {
  expectPresent,
  getApp,
  getDb,
  getTopUpModule,
  itIntegration as it,
  seedUserWithWallet,
  signPaymentWebhookPayload,
} from './integration-test-support';
import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  deposits,
  ledgerEntries,
  paymentProviders,
  paymentWebhookEvents,
  userWallets,
} from '@reward/database';

export function registerFinanceWebhookScenarios() {
  it('stores webhook events before asynchronously advancing deposits into provider_succeeded and dedupes duplicate callbacks', { tag: 'critical' }, async () => {
    const webhookSecret = 'integration-stripe-webhook-secret';
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = webhookSecret;

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

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
    const signature = signPaymentWebhookPayload(webhookSecret, payload);

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signature,
      },
      payload,
    });

    expect(firstResponse.statusCode).toBe(202);
    expect(firstResponse.json().data).toMatchObject({
      accepted: true,
      duplicate: false,
      requeued: false,
      eventId: 'evt_deposit_success_1',
      signatureStatus: 'verified',
    });

    const duplicateResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signature,
      },
      payload,
    });

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

    const webhookModule = await import('../modules/payment/webhook');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

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
  });

  it('persists invalidly signed webhook events but keeps deposits at requested', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = 'integration-stripe-webhook-secret';

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

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

    const response = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': 'sha256=deadbeef',
      },
      payload,
    });

    expect(response.statusCode).toBe(202);

    const webhookModule = await import('../modules/payment/webhook');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

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
  });

  it('does not regress provider_succeeded deposits when delayed provider_pending webhooks arrive later', async () => {
    const webhookSecret = 'integration-stripe-webhook-secret';
    process.env.PAYMENT_WEBHOOK_SECRET__STRIPE = webhookSecret;

    await getDb().insert(paymentProviders).values({
      name: 'stripe',
      providerType: 'deposit',
      isActive: true,
      config: {
        supportsDeposit: true,
      },
    });

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

    await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signPaymentWebhookPayload(webhookSecret, successPayload),
      },
      payload: successPayload,
    });

    const webhookModule = await import('../modules/payment/webhook');
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

    const delayedPendingPayload = JSON.stringify({
      id: 'evt_deposit_pending_2',
      type: 'deposit.pending',
      data: {
        referenceType: 'deposit',
        referenceId: requestedDeposit.id,
        status: 'pending',
      },
    });

    const delayedResponse = await getApp().inject({
      method: 'POST',
      url: '/payments/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'x-payment-signature': signPaymentWebhookPayload(
          webhookSecret,
          delayedPendingPayload
        ),
      },
      payload: delayedPendingPayload,
    });

    expect(delayedResponse.statusCode).toBe(202);
    expect(await webhookModule.processPendingPaymentWebhookEvents()).toBe(1);

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
  });
}
