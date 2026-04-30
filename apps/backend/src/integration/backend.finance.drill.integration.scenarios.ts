import { vi } from 'vitest';
import { deposits, userWallets, withdrawals } from '@reward/database';
import { eq, sql } from '@reward/database/orm';
import {
  expect,
  expectPresent,
  getDb,
  getTopUpModule,
  getWithdrawModule,
  itIntegration as it,
  listUserLedgerEntries,
  seedApprovedKycProfile,
  seedUserWithWallet,
} from './integration-test-support';

import { runPaymentOperationsCycle } from '../modules/payment/operations/service';

vi.mock('../modules/aml', () => ({
  screenUserFirstDeposit: vi.fn(async () => undefined),
  screenUserRegistration: vi.fn(async () => undefined),
  screenUserWithdrawal: vi.fn(async () => undefined),
}));

const staleTimestamp = () => new Date(Date.now() - 2 * 60 * 60 * 1_000);

export function registerFinanceDrillScenarios() {
  it(
    'payment drill: stale requested deposits and approved withdrawals are cleaned up with manual-safe fallbacks',
    { tag: 'critical' },
    async () => {
      const user = await seedUserWithWallet({
        email: 'payment-drill-cleanup@example.com',
        withdrawableBalance: '100.00',
      });
      await seedApprovedKycProfile(user.id, 'tier_2');

      const requestedDeposit = expectPresent(
        await getTopUpModule().createTopUp({
          userId: user.id,
          amount: '25.00',
        }),
      );
      const requestedWithdrawal = expectPresent(
        await getWithdrawModule().createWithdrawal({
          userId: user.id,
          amount: '40.00',
        }),
      );
      const approvedWithdrawal = await getWithdrawModule().approveWithdrawal(
        requestedWithdrawal.id,
        {
          operatorNote: 'approved for timeout drill',
        },
      );

      expect(approvedWithdrawal?.status).toBe('approved');

      const expiredAt = staleTimestamp().toISOString();
      await getDb().execute(sql`
        update deposits
        set updated_at = ${expiredAt}
        where id = ${requestedDeposit.id}
      `);
      await getDb().execute(sql`
        update withdrawals
        set updated_at = ${expiredAt}
        where id = ${requestedWithdrawal.id}
      `);

      const summary = await runPaymentOperationsCycle({ trigger: 'manual' });

      expect(summary).toMatchObject({
        trigger: 'manual',
        cleanup: {
          depositsExpired: 1,
          withdrawalsExpired: 1,
        },
        compensation: {
          depositsCredited: 0,
          withdrawalsReversed: 0,
        },
      });

      const [storedDeposit] = await getDb()
        .select({ status: deposits.status, metadata: deposits.metadata })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);
      expect(storedDeposit).toMatchObject({
        status: 'provider_failed',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'deposit_mark_provider_failed',
            processingChannel: 'system_cleanup',
          }),
        }),
      });

      const [storedWithdrawal] = await getDb()
        .select({ status: withdrawals.status, metadata: withdrawals.metadata })
        .from(withdrawals)
        .where(eq(withdrawals.id, requestedWithdrawal.id))
        .limit(1);
      expect(storedWithdrawal).toMatchObject({
        status: 'reversed',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'withdrawal_reverse',
            processingChannel: 'system_cleanup',
          }),
        }),
      });

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

      const ledgerEntries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );
      expect(ledgerEntries).toEqual([
        { entryType: 'withdraw_request', amount: '-40.00' },
        { entryType: 'withdraw_reversed_refund', amount: '40.00' },
      ]);
    },
  );

  it(
    'payment drill: settled deposits and stuck provider payouts are compensated before funds drift grows',
    { tag: 'critical' },
    async () => {
      const user = await seedUserWithWallet({
        email: 'payment-drill-compensation@example.com',
        withdrawableBalance: '100.00',
      });
      await seedApprovedKycProfile(user.id, 'tier_2');

      const pendingDeposit = expectPresent(
        await getTopUpModule().createTopUp({
          userId: user.id,
          amount: '25.00',
        }),
      );
      await getTopUpModule().markDepositProviderPending(pendingDeposit.id, {
        processingChannel: 'manual_bank',
        operatorNote: 'queued for compensation drill',
      });
      const settledDeposit = await getTopUpModule().markDepositProviderSucceeded(
        pendingDeposit.id,
        {
          processingChannel: 'manual_bank',
          settlementReference: 'dep-drill-001',
          operatorNote: 'provider confirmed before credit',
        },
      );
      expect(settledDeposit?.status).toBe('provider_succeeded');

      const requestedWithdrawal = expectPresent(
        await getWithdrawModule().createWithdrawal({
          userId: user.id,
          amount: '30.00',
        }),
      );
      await getWithdrawModule().approveWithdrawal(requestedWithdrawal.id, {
        operatorNote: 'approved for provider timeout drill',
      });
      await getWithdrawModule().markWithdrawalProviderSubmitted(
        requestedWithdrawal.id,
        {
          processingChannel: 'manual_bank',
          settlementReference: 'wd-drill-001',
        },
      );
      const processingWithdrawal =
        await getWithdrawModule().markWithdrawalProviderProcessing(
          requestedWithdrawal.id,
          {
            processingChannel: 'manual_bank',
            settlementReference: 'wd-drill-001',
          },
        );
      expect(processingWithdrawal?.status).toBe('provider_processing');

      const expiredAt = staleTimestamp().toISOString();
      await getDb().execute(sql`
        update deposits
        set updated_at = ${expiredAt}
        where id = ${pendingDeposit.id}
      `);
      await getDb().execute(sql`
        update withdrawals
        set updated_at = ${expiredAt}
        where id = ${requestedWithdrawal.id}
      `);

      const summary = await runPaymentOperationsCycle({ trigger: 'manual' });

      expect(summary).toMatchObject({
        trigger: 'manual',
        cleanup: {
          depositsExpired: 0,
          withdrawalsExpired: 0,
        },
        compensation: {
          depositsCredited: 1,
          withdrawalsReversed: 1,
        },
      });

      const [creditedDeposit] = await getDb()
        .select({ status: deposits.status, metadata: deposits.metadata })
        .from(deposits)
        .where(eq(deposits.id, pendingDeposit.id))
        .limit(1);
      expect(creditedDeposit).toMatchObject({
        status: 'credited',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'deposit_credit',
            processingChannel: 'system_compensation',
          }),
        }),
      });

      const [reversedWithdrawal] = await getDb()
        .select({ status: withdrawals.status, metadata: withdrawals.metadata })
        .from(withdrawals)
        .where(eq(withdrawals.id, requestedWithdrawal.id))
        .limit(1);
      expect(reversedWithdrawal).toMatchObject({
        status: 'reversed',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'withdrawal_reverse',
            processingChannel: 'system_compensation',
          }),
        }),
      });

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          lockedBalance: userWallets.lockedBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);
      expect(wallet).toEqual({
        withdrawableBalance: '125.00',
        lockedBalance: '0.00',
      });

      const ledgerEntries = (await listUserLedgerEntries(user.id)).map(
        ({ entryType, amount }) => ({ entryType, amount }),
      );
      expect(ledgerEntries).toEqual([
        { entryType: 'withdraw_request', amount: '-30.00' },
        { entryType: 'deposit_credit', amount: '25.00' },
        { entryType: 'withdraw_reversed_refund', amount: '30.00' },
      ]);
    },
  );
}
