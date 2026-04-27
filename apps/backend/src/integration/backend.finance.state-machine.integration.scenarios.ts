import {
  buildAdminCookieHeaders,
  enrollAdminMfa,
  expectPresent,
  FINANCE_ADMIN_PERMISSION_KEYS,
  getApp,
  getDb,
  getTopUpModule,
  getWithdrawModule,
  grantAdminPermissions,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
} from './integration-test-support';
import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  deposits,
  ledgerEntries,
  userWallets,
  withdrawals,
} from '@reward/database';

export function registerFinanceStateMachineScenarios() {
  it('deposit FSM only allows requested deposits to reach credit once', async () => {
    const approvedUser = await seedUserWithWallet({
      email: 'deposit-fsm-approved@example.com',
    });

    const requestedApprovedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: approvedUser.id,
      amount: '25.50',
    }));

    expect(requestedApprovedDeposit?.status).toBe('requested');

    const providerPending = await getTopUpModule().markDepositProviderPending(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        operatorNote: 'receipt queued',
      }
    );
    expect(providerPending?.status).toBe('provider_pending');

    const approved = await getTopUpModule().markDepositProviderSucceeded(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'dep-001',
        operatorNote: 'receipt matched',
      }
    );
    expect(approved?.status).toBe('provider_succeeded');

    const credited = await getTopUpModule().creditDeposit(requestedApprovedDeposit.id, {
      processingChannel: 'manual_bank',
      operatorNote: 'wallet credited',
    });
    expect(credited?.status).toBe('credited');

    const approvedAgain = await getTopUpModule().markDepositProviderSucceeded(
      requestedApprovedDeposit.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'dep-001',
        operatorNote: 'late provider success',
      }
    );
    expect(approvedAgain?.status).toBe('credited');

    const creditedAgain = await getTopUpModule().creditDeposit(requestedApprovedDeposit.id, {
      operatorNote: 'duplicate credit',
    });
    expect(creditedAgain?.status).toBe('credited');

    const failedAfterApprove = await getTopUpModule().failDeposit(requestedApprovedDeposit.id, {
      operatorNote: 'late fail ignored',
    });
    expect(failedAfterApprove?.status).toBe('credited');

    const [approvedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, approvedUser.id))
      .limit(1);

    expect(approvedWallet).toEqual({
      withdrawableBalance: '25.50',
      lockedBalance: '0.00',
    });

    const approvedEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, approvedUser.id))
      .orderBy(asc(ledgerEntries.id));

    expect(approvedEntries).toEqual([{ entryType: 'deposit_credit', amount: '25.50' }]);

    expect(credited?.metadata).toMatchObject({
      financeReviewLatest: expect.objectContaining({
        action: 'deposit_credit',
        processingChannel: 'manual_bank',
        operatorNote: 'wallet credited',
      }),
      financeReviewTrail: expect.arrayContaining([
        expect.objectContaining({
          action: 'deposit_credit',
          processingChannel: 'manual_bank',
          operatorNote: 'wallet credited',
        }),
      ]),
    });

    const failedUser = await seedUserWithWallet({
      email: 'deposit-fsm-failed@example.com',
    });

    const requestedFailedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: failedUser.id,
      amount: '12.00',
    }));

    expect(requestedFailedDeposit?.status).toBe('requested');

    const failed = await getTopUpModule().failDeposit(requestedFailedDeposit.id);
    expect(failed?.status).toBe('provider_failed');

    const approvedAfterFail = await getTopUpModule().approveDeposit(requestedFailedDeposit.id);
    expect(approvedAfterFail?.status).toBe('provider_failed');

    const failedAgain = await getTopUpModule().failDeposit(requestedFailedDeposit.id);
    expect(failedAgain?.status).toBe('provider_failed');

    const [failedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, failedUser.id))
      .limit(1);

    expect(failedWallet).toEqual({
      withdrawableBalance: '0.00',
      lockedBalance: '0.00',
    });

    const failedEntries = await getDb()
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, failedUser.id));

    expect(failedEntries).toHaveLength(0);
  });

  it('admin deposit state routes stay idempotent across duplicate and out-of-order submissions', { tag: 'critical' }, async () => {
    const makerEmail = 'finance-admin-deposit-maker@example.com';
    const checkerEmail = 'finance-admin-deposit-checker@example.com';
    const maker = await seedAdminAccount({ email: makerEmail });
    const checker = await seedAdminAccount({ email: checkerEmail });
    await grantAdminPermissions(maker.admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    await grantAdminPermissions(checker.admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const makerSession = await enrollAdminMfa({
      email: makerEmail,
      password: maker.password,
    });
    const checkerSession = await enrollAdminMfa({
      email: checkerEmail,
      password: checker.password,
    });

    const user = await seedUserWithWallet({
      email: 'finance-route-deposit@example.com',
    });
    const requestedDeposit = expectPresent(await getTopUpModule().createTopUp({
      userId: user.id,
      amount: '75.00',
    }));

    const makerHeaders = buildAdminCookieHeaders(makerSession.token);
    const checkerHeaders = buildAdminCookieHeaders(checkerSession.token);
    const makerReviewPayload = {
      totpCode: makerSession.totpCode,
      operatorNote: 'maker-pass',
      settlementReference: 'dep-route-001',
      processingChannel: 'manual_bank',
    };
    const checkerReviewPayload = {
      totpCode: checkerSession.totpCode,
      operatorNote: 'checker-pass',
      settlementReference: 'dep-route-001',
      processingChannel: 'manual_bank',
    };

    const [firstPending, duplicatePending] = await Promise.all([
      getApp().inject({
        method: 'PATCH',
        url: `/admin/deposits/${requestedDeposit.id}/provider-pending`,
        headers: makerHeaders,
        payload: makerReviewPayload,
      }),
      getApp().inject({
        method: 'PATCH',
        url: `/admin/deposits/${requestedDeposit.id}/provider-pending`,
        headers: makerHeaders,
        payload: makerReviewPayload,
      }),
    ]);

    expect(firstPending.statusCode).toBe(200);
    expect(duplicatePending.statusCode).toBe(200);

    const markSucceededMaker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-succeeded`,
      headers: makerHeaders,
      payload: makerReviewPayload,
    });
    expect(markSucceededMaker.statusCode).toBe(200);

    const markSucceededChecker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-succeeded`,
      headers: checkerHeaders,
      payload: checkerReviewPayload,
    });
    expect(markSucceededChecker.statusCode).toBe(200);

    const creditMaker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/credit`,
      headers: makerHeaders,
      payload: makerReviewPayload,
    });
    expect(creditMaker.statusCode).toBe(200);

    const creditChecker = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/credit`,
      headers: checkerHeaders,
      payload: checkerReviewPayload,
    });
    expect(creditChecker.statusCode).toBe(200);

    const failAfterApprove = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${requestedDeposit.id}/provider-fail`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'late-fail',
      },
    });
    expect(failAfterApprove.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.withdrawableBalance).toBe('75.00');

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([{ entryType: 'deposit_credit', amount: '75.00' }]);

    const [storedDeposit] = await getDb()
      .select({
        status: deposits.status,
      })
      .from(deposits)
      .where(eq(deposits.id, requestedDeposit.id))
      .limit(1);

    expect(storedDeposit?.status).toBe('credited');
  });

  it('withdrawal FSM supports requested -> approved -> provider_submitted -> provider_processing -> paid', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-fsm-approved@example.com',
      withdrawableBalance: '100.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '40.00',
    }));

    expect(pending?.status).toBe('requested');

    const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
      operatorNote: 'kyc verified',
    });
    expect(approved?.status).toBe('approved');

    const approvedAgain = await getWithdrawModule().approveWithdrawal(pending.id);
    expect(approvedAgain?.status).toBe('approved');

    const submitted = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-001',
      }
    );
    expect(submitted?.status).toBe('provider_submitted');

    const processing = await getWithdrawModule().markWithdrawalProviderProcessing(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-001',
      }
    );
    expect(processing?.status).toBe('provider_processing');

    const paid = await getWithdrawModule().payWithdrawal(pending.id, {
      operatorNote: 'bank transfer confirmed',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-001',
    });
    expect(paid?.status).toBe('paid');

    const paidAgain = await getWithdrawModule().payWithdrawal(pending.id);
    expect(paidAgain?.status).toBe('paid');

    const rejectedAfterPay = await getWithdrawModule().rejectWithdrawal(pending.id);
    expect(rejectedAfterPay?.status).toBe('paid');

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
      lockedBalance: '0.00',
    });

    const [stored] = await getDb()
      .select({ status: withdrawals.status, metadata: withdrawals.metadata })
      .from(withdrawals)
      .where(eq(withdrawals.id, pending.id))
      .limit(1);

    expect(stored).toMatchObject({
      status: 'paid',
      metadata: expect.objectContaining({
        financeReviewLatest: expect.objectContaining({
          action: 'withdrawal_pay',
          processingChannel: 'manual_bank',
          settlementReference: 'wd-001',
        }),
        financeReviewTrail: expect.arrayContaining([
          expect.objectContaining({
            action: 'withdrawal_pay',
            processingChannel: 'manual_bank',
            settlementReference: 'wd-001',
          }),
        ]),
      }),
    });

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-40.00' },
      { entryType: 'withdraw_paid', amount: '-40.00' },
    ]);
  });

  it('withdrawal FSM supports requested -> rejected and the full provider payout path to paid', async () => {
    const rejectedUser = await seedUserWithWallet({
      email: 'withdrawal-fsm-rejected@example.com',
      withdrawableBalance: '100.00',
    });

    const pendingRejected = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: rejectedUser.id,
      amount: '30.00',
    }));

    expect(pendingRejected?.status).toBe('requested');

    const rejected = await getWithdrawModule().rejectWithdrawal(pendingRejected.id);
    expect(rejected?.status).toBe('rejected');

    const approvedAfterReject = await getWithdrawModule().approveWithdrawal(pendingRejected.id);
    expect(approvedAfterReject?.status).toBe('rejected');

    const paidAfterReject = await getWithdrawModule().payWithdrawal(pendingRejected.id, {
      operatorNote: 'too-late',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-rejected-001',
    });
    expect(paidAfterReject?.status).toBe('rejected');

    const [rejectedWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, rejectedUser.id))
      .limit(1);

    expect(rejectedWallet).toEqual({
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });

    const rejectedEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, rejectedUser.id))
      .orderBy(asc(ledgerEntries.id));

    expect(rejectedEntries).toEqual([
      { entryType: 'withdraw_request', amount: '-30.00' },
      { entryType: 'withdraw_rejected_refund', amount: '30.00' },
    ]);

    const paidUser = await seedUserWithWallet({
      email: 'withdrawal-fsm-paid@example.com',
      withdrawableBalance: '80.00',
    });

    const pendingPaid = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: paidUser.id,
      amount: '20.00',
    }));

    expect(pendingPaid?.status).toBe('requested');

    const approvedPaid = await getWithdrawModule().approveWithdrawal(pendingPaid.id, {
      operatorNote: 'approved for payout',
    });
    expect(approvedPaid?.status).toBe('approved');

    const submittedPaid = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pendingPaid.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-paid-001',
      }
    );
    expect(submittedPaid?.status).toBe('provider_submitted');

    const processingPaid = await getWithdrawModule().markWithdrawalProviderProcessing(
      pendingPaid.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-paid-001',
      }
    );
    expect(processingPaid?.status).toBe('provider_processing');

    const paidDirectly = await getWithdrawModule().payWithdrawal(pendingPaid.id, {
      operatorNote: 'settled externally',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-paid-001',
    });
    expect(paidDirectly?.status).toBe('paid');

    const approvedAfterDirectPay = await getWithdrawModule().approveWithdrawal(pendingPaid.id);
    expect(approvedAfterDirectPay?.status).toBe('paid');

    const [paidWallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, paidUser.id))
      .limit(1);

    expect(paidWallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '0.00',
    });
  });

  it('keeps withdrawal funds locked at provider_failed until an explicit reverse', async () => {
    const user = await seedUserWithWallet({
      email: 'withdrawal-fsm-provider-failed@example.com',
      withdrawableBalance: '90.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '35.00',
    }));

    const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
      operatorNote: 'approved for provider submission',
    });
    expect(approved?.status).toBe('approved');

    const submitted = await getWithdrawModule().markWithdrawalProviderSubmitted(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(submitted?.status).toBe('provider_submitted');

    const processing = await getWithdrawModule().markWithdrawalProviderProcessing(
      pending.id,
      {
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(processing?.status).toBe('provider_processing');

    const providerFailed = await getWithdrawModule().markWithdrawalProviderFailed(
      pending.id,
      {
        operatorNote: 'provider reported failure',
        processingChannel: 'manual_bank',
        settlementReference: 'wd-failed-001',
      }
    );
    expect(providerFailed?.status).toBe('provider_failed');

    const [walletAfterFailure] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(walletAfterFailure).toEqual({
      withdrawableBalance: '55.00',
      lockedBalance: '35.00',
    });

    const entriesAfterFailure = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entriesAfterFailure).toEqual([
      { entryType: 'withdraw_request', amount: '-35.00' },
    ]);

    const reversed = await getWithdrawModule().reverseWithdrawal(pending.id, {
      operatorNote: 'funds returned after provider failure',
      processingChannel: 'manual_bank',
      settlementReference: 'wd-failed-001-reverse',
    });
    expect(reversed?.status).toBe('reversed');

    const [walletAfterReverse] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(walletAfterReverse).toEqual({
      withdrawableBalance: '90.00',
      lockedBalance: '0.00',
    });

    const finalEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(finalEntries).toEqual([
      { entryType: 'withdraw_request', amount: '-35.00' },
      { entryType: 'withdraw_reversed_refund', amount: '35.00' },
    ]);
  });

  it('admin withdrawal routes tolerate duplicate approvals and ignore out-of-order rejects after pay', { tag: 'critical' }, async () => {
    const makerEmail = 'finance-admin-withdraw-maker@example.com';
    const checkerEmail = 'finance-admin-withdraw-checker@example.com';
    const maker = await seedAdminAccount({ email: makerEmail });
    const checker = await seedAdminAccount({ email: checkerEmail });
    await grantAdminPermissions(maker.admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    await grantAdminPermissions(checker.admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const makerSession = await enrollAdminMfa({
      email: makerEmail,
      password: maker.password,
    });
    const checkerSession = await enrollAdminMfa({
      email: checkerEmail,
      password: checker.password,
    });

    const user = await seedUserWithWallet({
      email: 'finance-route-withdraw@example.com',
      withdrawableBalance: '120.00',
    });

    const pending = expectPresent(await getWithdrawModule().createWithdrawal({
      userId: user.id,
      amount: '45.00',
    }));

    const makerHeaders = buildAdminCookieHeaders(makerSession.token);
    const checkerHeaders = buildAdminCookieHeaders(checkerSession.token);

    const approveOnce = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/approve`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'approve-once',
      },
    });
    const approveTwice = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/approve`,
      headers: checkerHeaders,
      payload: {
        totpCode: checkerSession.totpCode,
        operatorNote: 'approve-twice',
      },
    });

    expect(approveOnce.statusCode).toBe(200);
    expect(approveTwice.statusCode).toBe(200);

    const providerSubmit = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/provider-submit`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'provider-submit',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    expect(providerSubmit.statusCode).toBe(200);

    const providerProcessing = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/provider-processing`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'provider-processing',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    expect(providerProcessing.statusCode).toBe(200);

    const payOnce = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/pay`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'paid-once',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });
    const payTwice = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/pay`,
      headers: checkerHeaders,
      payload: {
        totpCode: checkerSession.totpCode,
        operatorNote: 'paid-twice',
        settlementReference: 'wd-route-001',
        processingChannel: 'manual_bank',
      },
    });

    expect(payOnce.statusCode).toBe(200);
    expect(payTwice.statusCode).toBe(200);

    const rejectAfterPay = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${pending.id}/reject`,
      headers: makerHeaders,
      payload: {
        totpCode: makerSession.totpCode,
        operatorNote: 'too-late',
      },
    });
    expect(rejectAfterPay.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '75.00',
      lockedBalance: '0.00',
    });

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-45.00' },
      { entryType: 'withdraw_paid', amount: '-45.00' },
    ]);

    const [storedWithdrawal] = await getDb()
      .select({
        status: withdrawals.status,
      })
      .from(withdrawals)
      .where(eq(withdrawals.id, pending.id))
      .limit(1);

    expect(storedWithdrawal?.status).toBe('paid');
  });
}
