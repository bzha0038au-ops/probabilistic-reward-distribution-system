import {
  describeIntegrationSuite,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedQuickEightScenario,
  verifyUserContacts,
} from './integration-test-support';
import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  houseAccount,
  ledgerEntries,
  quickEightRounds,
  userWallets,
} from '@reward/database';

describeIntegrationSuite('backend quick-eight integration', () => {
  it('POST /quick-eight settles a winning round for authenticated users', async () => {
    const user = await seedQuickEightScenario();
    await verifyUserContacts(user.id, { email: true });
    const { ensureFairnessSeed } = await import('../modules/fairness/service');
    const { drawQuickEightNumbers } = await import('../modules/quick-eight/service');
    const fairnessSeed = await ensureFairnessSeed(getDb());
    const clientNonce = 'integration-quick-eight';
    const preview = drawQuickEightNumbers({
      seed: fairnessSeed.seed,
      userId: user.id,
      clientNonce,
    });
    const winningNumbers = preview.drawnNumbers.slice(0, 8);

    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/quick-eight',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        numbers: winningNumbers,
        stakeAmount: '1.00',
        clientNonce,
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      userId: user.id,
      selectedNumbers: winningNumbers,
      matchedNumbers: winningNumbers,
      hitCount: 8,
      multiplier: '4800.00',
      stakeAmount: '1.00',
      payoutAmount: '4800.00',
      status: 'won',
      fairness: {
        clientNonce,
        commitHash: fairnessSeed.commitHash,
      },
    });

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        wageredAmount: userWallets.wageredAmount,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '4899.00',
      wageredAmount: '1.00',
    });

    const [house] = await getDb()
      .select({ prizePoolBalance: houseAccount.prizePoolBalance })
      .from(houseAccount)
      .where(eq(houseAccount.id, 1))
      .limit(1);

    expect(house?.prizePoolBalance).toBe('45201.00');

    const userEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
        referenceType: ledgerEntries.referenceType,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(userEntries).toEqual([
      {
        entryType: 'quick_eight_stake',
        amount: '-1.00',
        referenceType: 'quick_eight',
      },
      {
        entryType: 'quick_eight_payout',
        amount: '4800.00',
        referenceType: 'quick_eight',
      },
    ]);

    const [storedRound] = await getDb()
      .select({
        hitCount: quickEightRounds.hitCount,
        multiplier: quickEightRounds.multiplier,
        stakeAmount: quickEightRounds.stakeAmount,
        payoutAmount: quickEightRounds.payoutAmount,
        status: quickEightRounds.status,
      })
      .from(quickEightRounds)
      .where(eq(quickEightRounds.userId, user.id))
      .limit(1);

    expect(storedRound).toEqual({
      hitCount: 8,
      multiplier: '4800.00',
      stakeAmount: '1.00',
      payoutAmount: '4800.00',
      status: 'won',
    });
  });
});
