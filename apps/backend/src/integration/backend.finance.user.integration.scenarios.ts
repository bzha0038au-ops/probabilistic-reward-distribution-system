import {
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  bankCards,
  deposits,
  ledgerEntries,
  userWallets,
  withdrawals,
} from '@reward/database';

export function registerFinanceUserScenarios() {
  it('POST /bank-cards creates cards and updates default selection', async () => {
    const user = await seedUserWithWallet({
      email: 'bank-card@example.com',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createFirst = await getApp().inject({
      method: 'POST',
      url: '/bank-cards',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        cardholderName: 'Test User',
        bankName: 'Demo Bank',
        brand: 'Visa',
        last4: '1234',
        isDefault: true,
      },
    });

    expect(createFirst.statusCode).toBe(201);
    const firstPayload = createFirst.json();
    expect(firstPayload.ok).toBe(true);

    const createSecond = await getApp().inject({
      method: 'POST',
      url: '/bank-cards',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        cardholderName: 'Test User',
        bankName: 'Demo Bank',
        brand: 'Mastercard',
        last4: '5678',
        isDefault: false,
      },
    });

    const secondPayload = createSecond.json();
    const secondId = secondPayload.data?.id as number;
    expect(secondId).toBeTruthy();

    const setDefault = await getApp().inject({
      method: 'PATCH',
      url: `/bank-cards/${secondId}/default`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(setDefault.statusCode).toBe(200);

    const cards = await getDb()
      .select({
        id: bankCards.id,
        isDefault: bankCards.isDefault,
      })
      .from(bankCards)
      .where(eq(bankCards.userId, user.id))
      .orderBy(asc(bankCards.id));

    expect(cards.find((card) => card.id === secondId)?.isDefault).toBe(true);
  });

  it('POST /top-ups creates a requested deposit record', async () => {
    const user = await seedUserWithWallet({
      email: 'top-up@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/top-ups',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.ok).toBe(true);

    const [deposit] = await getDb()
      .select({
        id: deposits.id,
        status: deposits.status,
        amount: deposits.amount,
        providerId: deposits.providerId,
        metadata: deposits.metadata,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .limit(1);

    expect(deposit).toMatchObject({
      status: 'requested',
      amount: '25.50',
      providerId: null,
      metadata: expect.objectContaining({
        paymentFlow: 'deposit',
        processingMode: 'manual',
        manualFallbackRequired: true,
        manualFallbackReason: 'no_active_payment_provider',
        manualFallbackStatus: 'requested',
      }),
    });
  });

  it('POST /withdrawals locks balance and writes ledger entry', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal@example.com',
      withdrawableBalance: '100.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 40,
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.ok).toBe(true);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '40.00',
    });

    const [entry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id))
      .limit(1);

    expect(entry).toEqual({
      entryType: 'withdraw_request',
      amount: '-40.00',
    });

    const [stored] = await getDb()
      .select({
        status: withdrawals.status,
        metadata: withdrawals.metadata,
      })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .limit(1);

    expect(stored).toMatchObject({
      status: 'requested',
      metadata: expect.objectContaining({
        paymentFlow: 'withdrawal',
        processingMode: 'manual',
        manualFallbackRequired: true,
        manualFallbackReason: 'no_active_payment_provider',
        manualFallbackStatus: 'requested',
      }),
    });
  });
}
