import { vi } from 'vitest';
import {
  describeIntegrationSuite,
  expect,
  expectPresent,
  getDb,
  getTopUpModule,
  itIntegration as it,
  seedUserWithWallet,
} from './integration-test-support';
import { asc, eq, sql } from '@reward/database/orm';
import {
  deposits,
  economyLedgerEntries,
  ledgerEntries,
  missions,
  userAssetBalances,
  userWallets,
} from '@reward/database';

vi.mock('../modules/aml', () => ({
  screenUserFirstDeposit: vi.fn(async () => undefined),
  screenUserRegistration: vi.fn(async () => undefined),
  screenUserWithdrawal: vi.fn(async () => undefined),
}));

describeIntegrationSuite('backend top-up integration', () => {
  it(
    'top-up lifecycle supports requested -> provider_pending -> provider_succeeded -> credited exactly once',
    { tag: 'critical' },
    async () => {
      const user = await seedUserWithWallet({
        email: 'top-up-fsm-approved@example.com',
      });

      const requestedDeposit = expectPresent(
        await getTopUpModule().createTopUp({
          userId: user.id,
          amount: '25.50',
        }),
      );

      expect(requestedDeposit.status).toBe('requested');

      const providerPending = await getTopUpModule().markDepositProviderPending(
        requestedDeposit.id,
        {
          processingChannel: 'manual_bank',
          operatorNote: 'receipt queued',
        },
      );
      expect(providerPending?.status).toBe('provider_pending');

      const providerSucceeded =
        await getTopUpModule().markDepositProviderSucceeded(
          requestedDeposit.id,
          {
            processingChannel: 'manual_bank',
            settlementReference: 'dep-001',
            operatorNote: 'receipt matched',
          },
        );
      expect(providerSucceeded?.status).toBe('provider_succeeded');

      const credited = await getTopUpModule().creditDeposit(
        requestedDeposit.id,
        {
          processingChannel: 'manual_bank',
          operatorNote: 'wallet credited',
        },
      );
      expect(credited?.status).toBe('credited');

      const approvedAgain = await getTopUpModule().markDepositProviderSucceeded(
        requestedDeposit.id,
        {
          processingChannel: 'manual_bank',
          settlementReference: 'dep-001',
          operatorNote: 'late provider success',
        },
      );
      expect(approvedAgain?.status).toBe('credited');

      const creditedAgain = await getTopUpModule().creditDeposit(
        requestedDeposit.id,
        {
          operatorNote: 'duplicate credit',
        },
      );
      expect(creditedAgain?.status).toBe('credited');

      const failedAfterCredit = await getTopUpModule().failDeposit(
        requestedDeposit.id,
        {
          operatorNote: 'late fail ignored',
        },
      );
      expect(failedAfterCredit?.status).toBe('credited');

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          lockedBalance: userWallets.lockedBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet).toEqual({
        withdrawableBalance: '25.50',
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
        { entryType: 'deposit_credit', amount: '25.50' },
      ]);

      const [storedDeposit] = await getDb()
        .select({
          status: deposits.status,
          metadata: deposits.metadata,
        })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(storedDeposit).toMatchObject({
        status: 'credited',
        metadata: expect.objectContaining({
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
        }),
      });
    },
  );

  it(
    'credited first deposits auto-award the starter bonus into B_LUCK while keeping legacy bonus balance at zero',
    async () => {
      const user = await seedUserWithWallet({
        email: 'top-up-first-deposit-bonus@example.com',
      });

      await getDb().insert(missions).values({
        id: 'top_up_starter',
        type: 'metric_threshold',
        params: {
          title: 'First deposit bonus',
          description:
            'Complete your first credited deposit to receive an automatic starter bonus.',
          metric: 'deposit_credited_count',
          target: 1,
          cadence: 'one_time',
          awardMode: 'auto_grant',
          bonusUnlockWagerRatio: 1,
          sortOrder: 50,
        },
        reward: '10.00',
        isActive: true,
      });

      const requestedDeposit = expectPresent(
        await getTopUpModule().createTopUp({
          userId: user.id,
          amount: '25.50',
        }),
      );

      const providerPending = await getTopUpModule().markDepositProviderPending(
        requestedDeposit.id,
        {
          processingChannel: 'manual_bank',
          operatorNote: 'receipt queued',
        },
      );
      expect(providerPending?.status).toBe('provider_pending');

      const providerSucceeded =
        await getTopUpModule().markDepositProviderSucceeded(
          requestedDeposit.id,
          {
            processingChannel: 'manual_bank',
            settlementReference: 'dep-bonus-001',
            operatorNote: 'receipt matched',
          },
        );
      expect(providerSucceeded?.status).toBe('provider_succeeded');

      const credited = await getTopUpModule().creditDeposit(
        requestedDeposit.id,
        {
          processingChannel: 'manual_bank',
          operatorNote: 'wallet credited',
        },
      );
      expect(credited?.status).toBe('credited');

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          bonusBalance: userWallets.bonusBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet).toEqual({
        withdrawableBalance: '25.50',
        bonusBalance: '0.00',
      });

      const [earnedAsset] = await getDb()
        .select({
          assetCode: userAssetBalances.assetCode,
          availableBalance: userAssetBalances.availableBalance,
          lifetimeEarned: userAssetBalances.lifetimeEarned,
          lifetimeSpent: userAssetBalances.lifetimeSpent,
        })
        .from(userAssetBalances)
        .where(
          sql`${userAssetBalances.userId} = ${user.id}
            AND ${userAssetBalances.assetCode} = 'B_LUCK'`,
        )
        .limit(1);

      expect(earnedAsset).toEqual({
        assetCode: 'B_LUCK',
        availableBalance: '10.00',
        lifetimeEarned: '10.00',
        lifetimeSpent: '0.00',
      });

      const legacyEntries = await getDb()
        .select({
          entryType: ledgerEntries.entryType,
          amount: ledgerEntries.amount,
          missionId: sql<string | null>`${ledgerEntries.metadata} ->> 'missionId'`,
          bonusUnlockWagerRatio:
            sql<string | null>`${ledgerEntries.metadata} ->> 'bonusUnlockWagerRatio'`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id))
        .orderBy(asc(ledgerEntries.id));

      expect(legacyEntries).toEqual([
        {
          entryType: 'deposit_credit',
          amount: '25.50',
          missionId: null,
          bonusUnlockWagerRatio: null,
        },
      ]);

      const economyEntries = await getDb()
        .select({
          entryType: economyLedgerEntries.entryType,
          amount: economyLedgerEntries.amount,
          assetCode: economyLedgerEntries.assetCode,
          missionId:
            sql<string | null>`${economyLedgerEntries.metadata} ->> 'missionId'`,
          bonusUnlockWagerRatio:
            sql<string | null>`${economyLedgerEntries.metadata} ->> 'bonusUnlockWagerRatio'`,
        })
        .from(economyLedgerEntries)
        .where(eq(economyLedgerEntries.userId, user.id))
        .orderBy(asc(economyLedgerEntries.id));

      expect(economyEntries).toEqual([
        {
          entryType: 'gamification_reward',
          amount: '10.00',
          assetCode: 'B_LUCK',
          missionId: 'top_up_starter',
          bonusUnlockWagerRatio: '1.00',
        },
      ]);
    },
  );

  it(
    'top-up failure path supports requested -> provider_failed without wallet or ledger mutations',
    async () => {
      const user = await seedUserWithWallet({
        email: 'top-up-fsm-failed@example.com',
      });

      const requestedDeposit = expectPresent(
        await getTopUpModule().createTopUp({
          userId: user.id,
          amount: '12.00',
        }),
      );

      expect(requestedDeposit.status).toBe('requested');

      const failed = await getTopUpModule().failDeposit(requestedDeposit.id, {
        operatorNote: 'receipt rejected',
      });
      expect(failed?.status).toBe('provider_failed');

      const approvedAfterFail = await getTopUpModule().markDepositProviderPending(
        requestedDeposit.id,
        {
          operatorNote: 'late approve ignored',
        },
      );
      expect(approvedAfterFail?.status).toBe('provider_failed');

      const failedAgain = await getTopUpModule().failDeposit(requestedDeposit.id, {
        operatorNote: 'duplicate fail',
      });
      expect(failedAgain?.status).toBe('provider_failed');

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          lockedBalance: userWallets.lockedBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet).toEqual({
        withdrawableBalance: '0.00',
        lockedBalance: '0.00',
      });

      const entries = await getDb()
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, user.id));

      expect(entries).toHaveLength(0);

      const [storedDeposit] = await getDb()
        .select({
          status: deposits.status,
          metadata: deposits.metadata,
        })
        .from(deposits)
        .where(eq(deposits.id, requestedDeposit.id))
        .limit(1);

      expect(storedDeposit).toMatchObject({
        status: 'provider_failed',
        metadata: expect.objectContaining({
          financeReviewLatest: expect.objectContaining({
            action: 'deposit_mark_provider_failed',
            operatorNote: 'receipt rejected',
          }),
        }),
      });
    },
  );
});
