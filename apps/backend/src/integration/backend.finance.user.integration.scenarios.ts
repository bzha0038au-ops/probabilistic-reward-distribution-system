import {
  authNotificationCaptures,
  buildUserAuthHeaders,
  enrollUserMfa,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  amlChecks,
  bankCards,
  deposits,
  freezeRecords,
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

  it('POST /deposits freezes the user when first-deposit AML screening hits', async () => {
    await seedAdminAccount({
      email: 'aml-finance-admin@example.com',
    });
    const user = await seedUserWithWallet({
      email: 'aml-first-deposit@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(response.statusCode).toBe(423);
    expect(response.json().error.code).toBe('AML_REVIEW_REQUIRED');
    expect(authNotificationCaptures.amlReview).toHaveLength(1);
    expect(authNotificationCaptures.amlReview[0]).toEqual(
      expect.objectContaining({
        email: 'aml-finance-admin@example.com',
        checkpoint: 'first_deposit',
        userEmail: user.email,
      }),
    );

    const storedDeposits = await getDb()
      .select({ id: deposits.id })
      .from(deposits)
      .where(eq(deposits.userId, user.id));

    expect(storedDeposits).toHaveLength(0);

    const [freeze] = await getDb()
      .select({
        status: freezeRecords.status,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .limit(1);

    expect(freeze).toMatchObject({
      status: 'active',
      reason: 'aml_review',
    });

    const [check] = await getDb()
      .select({
        checkpoint: amlChecks.checkpoint,
        result: amlChecks.result,
      })
      .from(amlChecks)
      .where(eq(amlChecks.userId, user.id))
      .limit(1);

    expect(check).toMatchObject({
      checkpoint: 'first_deposit',
      result: 'hit',
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

    const [stored] = await getDb()
      .select({
        id: withdrawals.id,
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

    const [entry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.referenceType, 'withdrawal'),
          eq(ledgerEntries.referenceId, stored?.id ?? -1)
        )
      )
      .limit(1);

    expect(entry).toEqual({
      entryType: 'withdraw_request',
      amount: '-40.00',
    });
  });

  it('POST /withdrawals requires MFA step-up for high-value requests', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-mfa-required@example.com',
      withdrawableBalance: '600.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const mfaRequiredResponse = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: buildUserAuthHeaders(token),
      payload: {
        amount: 550,
      },
    });

    expect(mfaRequiredResponse.statusCode).toBe(403);
    expect(mfaRequiredResponse.json().error.code).toBe('USER_MFA_REQUIRED');

    const { totpCode } = await enrollUserMfa({ token });

    const missingStepUpResponse = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: buildUserAuthHeaders(token),
      payload: {
        amount: 550,
      },
    });

    expect(missingStepUpResponse.statusCode).toBe(401);
    expect(missingStepUpResponse.json().error.code).toBe('USER_STEP_UP_REQUIRED');

    const successResponse = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: buildUserAuthHeaders(token),
      payload: {
        amount: 550,
        totpCode,
      },
    });

    expect(successResponse.statusCode).toBe(201);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '50.00',
      lockedBalance: '550.00',
    });

    const [stored] = await getDb()
      .select({
        status: withdrawals.status,
        metadata: withdrawals.metadata,
      })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .orderBy(asc(withdrawals.id))
      .limit(1);

    expect(stored).toMatchObject({
      status: 'requested',
      metadata: expect.objectContaining({
        userStepUp: expect.objectContaining({
          method: 'totp',
          amountThreshold: '500.00',
        }),
      }),
    });
  });

  it('POST /withdrawals freezes the user before funds are locked when AML screening hits', async () => {
    await seedAdminAccount({
      email: 'aml-withdraw-admin@example.com',
    });
    const user = await seedUserWithWallet({
      email: 'aml-withdrawal@example.com',
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

    expect(response.statusCode).toBe(423);
    expect(response.json().error.code).toBe('AML_REVIEW_REQUIRED');
    expect(authNotificationCaptures.amlReview).toHaveLength(1);
    expect(authNotificationCaptures.amlReview[0]).toEqual(
      expect.objectContaining({
        email: 'aml-withdraw-admin@example.com',
        checkpoint: 'withdrawal_request',
        userEmail: user.email,
      }),
    );

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });

    const storedWithdrawals = await getDb()
      .select({ id: withdrawals.id })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id));

    expect(storedWithdrawals).toHaveLength(0);

    const [freeze] = await getDb()
      .select({
        status: freezeRecords.status,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .limit(1);

    expect(freeze).toMatchObject({
      status: 'active',
      reason: 'aml_review',
    });

    const [check] = await getDb()
      .select({
        checkpoint: amlChecks.checkpoint,
        result: amlChecks.result,
      })
      .from(amlChecks)
      .where(eq(amlChecks.userId, user.id))
      .orderBy(asc(amlChecks.id))
      .limit(1);

    expect(check).toMatchObject({
      checkpoint: 'withdrawal_request',
      result: 'hit',
    });
  });
}
