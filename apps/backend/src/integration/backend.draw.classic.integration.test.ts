import {
  describeIntegrationSuite,
  getApp,
  getCreateUserSessionToken,
  getDb,
  getExecuteDraw,
  invalidatePoolCache,
  itIntegration as it,
  seedDrawScenario,
  seedUserWithWallet,
  setConfigNumber,
  verifyUserContacts,
} from './integration-test-support';
import { createHash } from 'node:crypto';
import { asc, eq, inArray } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  drawRecords,
  fairnessSeeds,
  houseAccount,
  ledgerEntries,
  prizes,
  userWallets,
} from '@reward/database';

describeIntegrationSuite('backend draw classic integration', () => {
  it('executeDraw persists a winning draw and related ledger entries', async () => {
    const { user, prize } = await seedDrawScenario();

    const record = await getExecuteDraw()(user.id, {
      clientNonce: 'integration-unit-draw',
    });

    expect(record?.status).toBe('won');
    expect(record?.prizeId).toBe(prize.id);
    expect(record?.drawCost).toBe('10.00');
    expect(record?.rewardAmount).toBe('5.00');

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        bonusBalance: userWallets.bonusBalance,
        wageredAmount: userWallets.wageredAmount,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '90.00',
      bonusBalance: '5.00',
      wageredAmount: '10.00',
    });

    const [house] = await getDb()
      .select({ prizePoolBalance: houseAccount.prizePoolBalance })
      .from(houseAccount)
      .where(eq(houseAccount.id, 1))
      .limit(1);

    expect(house?.prizePoolBalance).toBe('5.00');

    const userEntries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(asc(ledgerEntries.id));

    expect(userEntries).toEqual([
      { entryType: 'draw_cost', amount: '-10.00' },
      { entryType: 'draw_reward', amount: '5.00' },
    ]);

    const [storedRecord] = await getDb()
      .select({
        status: drawRecords.status,
        drawCost: drawRecords.drawCost,
        rewardAmount: drawRecords.rewardAmount,
      })
      .from(drawRecords)
      .where(eq(drawRecords.userId, user.id))
      .limit(1);

    expect(storedRecord).toEqual({
      status: 'won',
      drawCost: '10.00',
      rewardAmount: '5.00',
    });
  });

  it('POST /draw executes a winning draw for authenticated users', async () => {
    const { user, prize } = await seedDrawScenario();
    await verifyUserContacts(user.id, { email: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/draw',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        clientNonce: 'integration-api-draw',
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      userId: user.id,
      prizeId: prize.id,
      status: 'won',
      drawCost: '10.00',
      rewardAmount: '5.00',
    });
    expect(payload.data.fairness).toMatchObject({
      clientNonce: 'integration-api-draw',
    });
  });

  it(
    'executeDraw returns out_of_stock when the selected prize has no stock',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
      const user = await seedUserWithWallet({
        email: 'out-of-stock@example.com',
        withdrawableBalance: '50.00',
      });

      await getDb()
        .insert(prizes)
        .values({
          name: 'Out of Stock Prize',
          stock: 0,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '5.00',
          payoutBudget: '0.00',
          payoutSpent: '0.00',
          payoutPeriodDays: 1,
          isActive: true,
        });

      await invalidatePoolCache();

      const record = await getExecuteDraw()(user.id, {
        clientNonce: 'integration-out-of-stock',
      });

      expect(record?.status).toBe('out_of_stock');
      expect(record?.rewardAmount).toBe('0.00');
    }
  );

  it(
    'executeDraw returns budget_exhausted when payout budget is spent',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
      const user = await seedUserWithWallet({
        email: 'budget-exhausted@example.com',
        withdrawableBalance: '50.00',
      });

      await getDb()
        .insert(prizes)
        .values({
          name: 'Budget Exhausted Prize',
          stock: 1,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '5.00',
          payoutBudget: '1.00',
          payoutSpent: '1.00',
          payoutPeriodDays: 1,
          isActive: true,
        });

      await invalidatePoolCache();

      const record = await getExecuteDraw()(user.id, {
        clientNonce: 'integration-budget-exhausted',
      });

      expect(record?.status).toBe('budget_exhausted');
      expect(record?.rewardAmount).toBe('0.00');
    }
  );

  it(
    'executeDraw returns payout_limited when reserve blocks payout',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
      await setConfigNumber('pool_system.pool_min_reserve', '100.00');
      const user = await seedUserWithWallet({
        email: 'payout-limited@example.com',
        withdrawableBalance: '50.00',
      });

      await getDb()
        .insert(prizes)
        .values({
          name: 'Reserve Limited Prize',
          stock: 1,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '5.00',
          payoutBudget: '0.00',
          payoutSpent: '0.00',
          payoutPeriodDays: 1,
          isActive: true,
        });

      await invalidatePoolCache();

      const record = await getExecuteDraw()(user.id, {
        clientNonce: 'integration-payout-limited',
      });

      expect(record?.status).toBe('payout_limited');
      expect(record?.rewardAmount).toBe('0.00');
    }
  );

  it(
    'executeDraw keeps prize inventory and draw records consistent under concurrent requests',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('payout_control.max_big_prize_per_hour', '1');
      const firstUser = await seedUserWithWallet({
        email: 'draw-concurrency-a@example.com',
        withdrawableBalance: '100.00',
      });
      const secondUser = await seedUserWithWallet({
        email: 'draw-concurrency-b@example.com',
        withdrawableBalance: '100.00',
      });

      const [prize] = await getDb()
        .insert(prizes)
        .values({
          name: 'Concurrency Prize',
          stock: 1,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '5.00',
          payoutBudget: '0.00',
          payoutSpent: '0.00',
          payoutPeriodDays: 1,
          isActive: true,
        })
        .returning();

      await invalidatePoolCache();

      const [firstDraw, secondDraw] = await Promise.all([
        getExecuteDraw()(firstUser.id, {
          clientNonce: 'integration-draw-concurrency-a',
        }),
        getExecuteDraw()(secondUser.id, {
          clientNonce: 'integration-draw-concurrency-b',
        }),
      ]);

      expect([firstDraw?.status, secondDraw?.status].sort()).toEqual([
        'out_of_stock',
        'won',
      ]);

      const [storedPrize] = await getDb()
        .select({
          stock: prizes.stock,
        })
        .from(prizes)
        .where(eq(prizes.id, prize.id))
        .limit(1);

      expect(storedPrize?.stock).toBe(0);

      const storedRecords = await getDb()
        .select({
          userId: drawRecords.userId,
          status: drawRecords.status,
        })
        .from(drawRecords)
        .where(inArray(drawRecords.userId, [firstUser.id, secondUser.id]))
        .orderBy(asc(drawRecords.userId));

      expect(storedRecords).toHaveLength(2);
      expect(storedRecords.map((record) => record.status).sort()).toEqual([
        'out_of_stock',
        'won',
      ]);
    }
  );

  it(
    'executeDraw serializes same-user concurrent draws when maxDrawPerDay is 1',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('draw_system.max_draw_per_day', '1');
      await setConfigNumber('draw_system.cooldown_seconds', '0');

      const user = await seedUserWithWallet({
        email: 'draw-daily-limit-concurrency@example.com',
        withdrawableBalance: '100.00',
      });

      const [prize] = await getDb()
        .insert(prizes)
        .values({
          name: 'Daily Limit Concurrency Prize',
          stock: 10,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '0.00',
          payoutBudget: '0.00',
          payoutSpent: '0.00',
          payoutPeriodDays: 1,
          isActive: true,
        })
        .returning();

      await invalidatePoolCache();

      const results = await Promise.allSettled([
        getExecuteDraw()(user.id, {
          clientNonce: 'integration-draw-daily-limit-a',
        }),
        getExecuteDraw()(user.id, {
          clientNonce: 'integration-draw-daily-limit-b',
        }),
      ]);

      const fulfilled = results.find((result) => result.status === 'fulfilled');
      const rejected = results.find((result) => result.status === 'rejected');

      expect(fulfilled?.status).toBe('fulfilled');
      expect(rejected?.status).toBe('rejected');

      if (fulfilled?.status !== 'fulfilled' || rejected?.status !== 'rejected') {
        throw new Error('Expected one successful draw and one rejected draw.');
      }

      expect(fulfilled.value.status).toBe('won');
      expect((rejected.reason as Error).message).toBe('Daily draw limit reached.');
      expect((rejected.reason as { statusCode?: number }).statusCode).toBe(409);

      const storedRecords = await getDb()
        .select({
          id: drawRecords.id,
          status: drawRecords.status,
        })
        .from(drawRecords)
        .where(eq(drawRecords.userId, user.id))
        .orderBy(asc(drawRecords.id));

      expect(storedRecords).toHaveLength(1);
      expect(storedRecords[0]?.status).toBe('won');

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet?.withdrawableBalance).toBe('90.00');

      const [storedPrize] = await getDb()
        .select({
          stock: prizes.stock,
        })
        .from(prizes)
        .where(eq(prizes.id, prize.id))
        .limit(1);

      expect(storedPrize?.stock).toBe(9);
    }
  );

  it(
    'executeDraw serializes same-user concurrent draws when draw cooldown is active',
    { tag: 'critical' },
    async () => {
      await setConfigNumber('draw_system.max_draw_per_day', '0');
      await setConfigNumber('draw_system.cooldown_seconds', '300');

      const user = await seedUserWithWallet({
        email: 'draw-cooldown-concurrency@example.com',
        withdrawableBalance: '100.00',
      });

      const [prize] = await getDb()
        .insert(prizes)
        .values({
          name: 'Cooldown Concurrency Prize',
          stock: 10,
          weight: 100,
          poolThreshold: '0.00',
          userPoolThreshold: '0.00',
          rewardAmount: '0.00',
          payoutBudget: '0.00',
          payoutSpent: '0.00',
          payoutPeriodDays: 1,
          isActive: true,
        })
        .returning();

      await invalidatePoolCache();

      const results = await Promise.allSettled([
        getExecuteDraw()(user.id, {
          clientNonce: 'integration-draw-cooldown-a',
        }),
        getExecuteDraw()(user.id, {
          clientNonce: 'integration-draw-cooldown-b',
        }),
      ]);

      const fulfilled = results.find((result) => result.status === 'fulfilled');
      const rejected = results.find((result) => result.status === 'rejected');

      expect(fulfilled?.status).toBe('fulfilled');
      expect(rejected?.status).toBe('rejected');

      if (fulfilled?.status !== 'fulfilled' || rejected?.status !== 'rejected') {
        throw new Error('Expected one successful draw and one rejected draw.');
      }

      expect(fulfilled.value.status).toBe('won');
      expect((rejected.reason as Error).message).toBe('Draw cooldown active.');
      expect((rejected.reason as { statusCode?: number }).statusCode).toBe(409);

      const storedRecords = await getDb()
        .select({
          id: drawRecords.id,
          status: drawRecords.status,
        })
        .from(drawRecords)
        .where(eq(drawRecords.userId, user.id))
        .orderBy(asc(drawRecords.id));

      expect(storedRecords).toHaveLength(1);
      expect(storedRecords[0]?.status).toBe('won');

      const [wallet] = await getDb()
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);

      expect(wallet?.withdrawableBalance).toBe('90.00');

      const [storedPrize] = await getDb()
        .select({
          stock: prizes.stock,
        })
        .from(prizes)
        .where(eq(prizes.id, prize.id))
        .limit(1);

      expect(storedPrize?.stock).toBe(9);
    }
  );

  it('GET /fairness/commit and /fairness/reveal expose commitment data', async () => {
    const commitResponse = await getApp().inject({
      method: 'GET',
      url: '/fairness/commit',
    });

    expect(commitResponse.statusCode).toBe(200);
    const commitPayload = commitResponse.json();
    expect(commitPayload.ok).toBe(true);

    const epochSeconds = Number(commitPayload.data.epochSeconds);
    const currentEpoch = Number(commitPayload.data.epoch);
    const previousEpoch = currentEpoch - 1;

    const seed = 'integration-seed';
    const commitHash = createHash('sha256').update(seed).digest('hex');

    await getDb().insert(fairnessSeeds).values({
      epoch: previousEpoch,
      epochSeconds,
      commitHash,
      seed,
    });

    const revealResponse = await getApp().inject({
      method: 'GET',
      url: `/fairness/reveal?epoch=${previousEpoch}`,
    });

    expect(revealResponse.statusCode).toBe(200);
    const revealPayload = revealResponse.json();
    expect(revealPayload.ok).toBe(true);
    expect(revealPayload.data).toMatchObject({
      epoch: previousEpoch,
      seed,
      commitHash,
    });
  });
});
