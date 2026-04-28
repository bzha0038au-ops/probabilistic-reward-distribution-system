import { vi } from 'vitest';
import {
  describeIntegrationSuite,
  expect,
  expectPresent,
  getDb,
  getWithdrawModule,
  itIntegration as it,
  listUserLedgerEntries,
  seedApprovedKycProfile,
  seedUserWithWallet,
} from './integration-test-support';
import { eq } from '@reward/database/orm';
import { userWallets, withdrawals } from '@reward/database';

vi.mock('../modules/aml', () => ({
  screenUserFirstDeposit: vi.fn(async () => undefined),
  screenUserRegistration: vi.fn(async () => undefined),
  screenUserWithdrawal: vi.fn(async () => undefined),
}));

describeIntegrationSuite('backend withdraw integration', () => {
  it(
    'withdrawal lifecycle supports requested -> approved -> provider_submitted -> provider_processing -> paid',
    { tag: 'critical' },
    async () => {
      const user = await seedUserWithWallet({
        email: 'withdrawal-fsm-approved@example.com',
        withdrawableBalance: '100.00',
      });
      await seedApprovedKycProfile(user.id, 'tier_2');

      const pending = expectPresent(
        await getWithdrawModule().createWithdrawal({
          userId: user.id,
          amount: '40.00',
        }),
      );

      expect(pending.status).toBe('requested');

      const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
        operatorNote: 'kyc verified',
      });
      expect(approved?.status).toBe('approved');

      const approvedAgain = await getWithdrawModule().approveWithdrawal(
        pending.id,
      );
      expect(approvedAgain?.status).toBe('approved');

      const submitted =
        await getWithdrawModule().markWithdrawalProviderSubmitted(pending.id, {
          processingChannel: 'manual_bank',
          settlementReference: 'wd-001',
        });
      expect(submitted?.status).toBe('provider_submitted');

      const processing =
        await getWithdrawModule().markWithdrawalProviderProcessing(pending.id, {
          processingChannel: 'manual_bank',
          settlementReference: 'wd-001',
        });
      expect(processing?.status).toBe('provider_processing');

      const paid = await getWithdrawModule().payWithdrawal(pending.id, {
        operatorNote: 'bank transfer confirmed',
        processingChannel: 'manual_bank',
        settlementReference: 'wd-001',
      });
      expect(paid?.status).toBe('paid');

      const paidAgain = await getWithdrawModule().payWithdrawal(pending.id);
      expect(paidAgain?.status).toBe('paid');

      const rejectedAfterPay = await getWithdrawModule().rejectWithdrawal(
        pending.id,
      );
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

      const entries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );

      expect(entries).toEqual([
        { entryType: 'withdraw_request', amount: '-40.00' },
        { entryType: 'withdraw_paid', amount: '-40.00' },
      ]);

      const [storedWithdrawal] = await getDb()
        .select({
          status: withdrawals.status,
          metadata: withdrawals.metadata,
        })
        .from(withdrawals)
        .where(eq(withdrawals.id, pending.id))
        .limit(1);

      expect(storedWithdrawal).toMatchObject({
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
    },
  );

  it(
    'withdrawal rejection path supports requested -> rejected without extra payout side effects',
    async () => {
      const user = await seedUserWithWallet({
        email: 'withdrawal-fsm-rejected@example.com',
        withdrawableBalance: '100.00',
      });
      await seedApprovedKycProfile(user.id, 'tier_2');

      const pending = expectPresent(
        await getWithdrawModule().createWithdrawal({
          userId: user.id,
          amount: '30.00',
        }),
      );

      expect(pending.status).toBe('requested');

      const rejected = await getWithdrawModule().rejectWithdrawal(pending.id);
      expect(rejected?.status).toBe('rejected');

      const approvedAfterReject = await getWithdrawModule().approveWithdrawal(
        pending.id,
      );
      expect(approvedAfterReject?.status).toBe('rejected');

      const paidAfterReject = await getWithdrawModule().payWithdrawal(
        pending.id,
        {
          operatorNote: 'too-late',
          processingChannel: 'manual_bank',
          settlementReference: 'wd-rejected-001',
        },
      );
      expect(paidAfterReject?.status).toBe('rejected');

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

      const entries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );

      expect(entries).toEqual([
        { entryType: 'withdraw_request', amount: '-30.00' },
        { entryType: 'withdraw_rejected_refund', amount: '30.00' },
      ]);

      const [storedWithdrawal] = await getDb()
        .select({
          status: withdrawals.status,
        })
        .from(withdrawals)
        .where(eq(withdrawals.id, pending.id))
        .limit(1);

      expect(storedWithdrawal?.status).toBe('rejected');
    },
  );

  it(
    'withdrawal provider failure keeps funds locked until an explicit reverse',
    { tag: 'critical' },
    async () => {
      const user = await seedUserWithWallet({
        email: 'withdrawal-fsm-provider-failed@example.com',
        withdrawableBalance: '90.00',
      });
      await seedApprovedKycProfile(user.id, 'tier_2');

      const pending = expectPresent(
        await getWithdrawModule().createWithdrawal({
          userId: user.id,
          amount: '35.00',
        }),
      );

      const approved = await getWithdrawModule().approveWithdrawal(pending.id, {
        operatorNote: 'approved for provider submission',
      });
      expect(approved?.status).toBe('approved');

      const submitted =
        await getWithdrawModule().markWithdrawalProviderSubmitted(pending.id, {
          processingChannel: 'manual_bank',
          settlementReference: 'wd-failed-001',
        });
      expect(submitted?.status).toBe('provider_submitted');

      const processing =
        await getWithdrawModule().markWithdrawalProviderProcessing(pending.id, {
          processingChannel: 'manual_bank',
          settlementReference: 'wd-failed-001',
        });
      expect(processing?.status).toBe('provider_processing');

      const providerFailed =
        await getWithdrawModule().markWithdrawalProviderFailed(pending.id, {
          operatorNote: 'provider reported failure',
          processingChannel: 'manual_bank',
          settlementReference: 'wd-failed-001',
        });
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

      const entriesAfterFailure = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );

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

      const finalEntries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );

      expect(finalEntries).toEqual([
        { entryType: 'withdraw_request', amount: '-35.00' },
        { entryType: 'withdraw_reversed_refund', amount: '35.00' },
      ]);

      const [storedWithdrawal] = await getDb()
        .select({
          status: withdrawals.status,
          metadata: withdrawals.metadata,
        })
        .from(withdrawals)
        .where(eq(withdrawals.id, pending.id))
        .limit(1);

      expect(storedWithdrawal).toMatchObject({
        status: 'reversed',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'withdrawal_reverse',
            settlementReference: 'wd-failed-001-reverse',
          }),
        }),
      });
    },
  );
});
