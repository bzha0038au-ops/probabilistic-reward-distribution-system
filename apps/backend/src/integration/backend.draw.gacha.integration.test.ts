import {
  describeIntegrationSuite,
  getApp,
  getCreateUserSessionToken,
  getDb,
  invalidatePoolCache,
  itIntegration as it,
  seedDrawScenario,
  setConfigNumber,
  verifyUserContacts,
} from './integration-test-support';
import { eq } from '@reward/database/orm';
import { expect } from 'vitest';
import { drawRecords, prizes, userWallets } from '@reward/database';

describeIntegrationSuite('backend draw gacha integration', () => {
  it('GET /draw/catalog returns gacha presentation data for authenticated users', async () => {
    const { user, prize } = await seedDrawScenario();
    await verifyUserContacts(user.id, { email: true });
    await setConfigNumber('draw_system.max_draw_per_request', '10');
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/draw/catalog',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      drawEnabled: true,
      balance: '100.00',
      drawCost: '10.00',
      maxBatchCount: 10,
      recommendedBatchCount: 10,
      prizes: [
        expect.objectContaining({
          id: prize.id,
          name: prize.name,
        }),
      ],
      featuredPrizes: [
        expect.objectContaining({
          id: prize.id,
          name: prize.name,
        }),
      ],
    });
    expect(payload.data.pity).toMatchObject({
      currentStreak: 0,
    });
    expect(payload.data.fairness).toMatchObject({
      commitHash: expect.any(String),
    });
  });

  it('POST /draw/play executes a multi-pull and returns aggregated results', async () => {
    const { user, prize } = await seedDrawScenario();
    await verifyUserContacts(user.id, { email: true });
    await setConfigNumber('draw_system.max_draw_per_request', '10');
    await setConfigNumber('payout_control.max_big_prize_per_hour', '10');
    await getDb()
      .update(prizes)
      .set({ stock: 10 })
      .where(eq(prizes.id, prize.id));
    await invalidatePoolCache();
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/draw/play',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        count: 2,
        clientNonce: 'integration-multi-draw',
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      count: 2,
      totalCost: '20.00',
      totalReward: '10.00',
      winCount: 2,
      endingBalance: '80.00',
      highestRarity: expect.any(String),
    });
    expect(payload.data.pity).toMatchObject({
      currentStreak: 0,
    });
    expect(payload.data.results).toHaveLength(2);
    expect(payload.data.results[0]).toMatchObject({
      prizeId: prize.id,
      status: 'won',
      rewardAmount: '5.00',
      prize: {
        id: prize.id,
        name: prize.name,
      },
      fairness: {
        clientNonce: 'integration-multi-draw:1/2',
      },
    });
    expect(payload.data.results[1]).toMatchObject({
      prizeId: prize.id,
      status: 'won',
      rewardAmount: '5.00',
      prize: {
        id: prize.id,
        name: prize.name,
      },
      fairness: {
        clientNonce: 'integration-multi-draw:2/2',
      },
    });
  });

  it('POST /draw/play rejects a batch that would exceed the daily draw limit', async () => {
    const { user, prize } = await seedDrawScenario();
    await verifyUserContacts(user.id, { email: true });
    await setConfigNumber('draw_system.max_draw_per_request', '10');
    await setConfigNumber('draw_system.max_draw_per_day', '1');
    await setConfigNumber('draw_system.cooldown_seconds', '0');
    await setConfigNumber('payout_control.max_big_prize_per_hour', '10');
    await getDb()
      .update(prizes)
      .set({ stock: 10 })
      .where(eq(prizes.id, prize.id));
    await invalidatePoolCache();
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/draw/play',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        count: 2,
        clientNonce: 'integration-daily-limit-multi-draw',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        message: 'Daily draw limit reached.',
      },
    });

    const storedRecords = await getDb()
      .select({
        id: drawRecords.id,
      })
      .from(drawRecords)
      .where(eq(drawRecords.userId, user.id));
    expect(storedRecords).toHaveLength(0);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet?.withdrawableBalance).toBe('100.00');

    const [storedPrize] = await getDb()
      .select({
        stock: prizes.stock,
      })
      .from(prizes)
      .where(eq(prizes.id, prize.id))
      .limit(1);
    expect(storedPrize?.stock).toBe(10);
  });

  it('POST /draw/play rejects a batch when draw cooldown would block subsequent pulls', async () => {
    const { user, prize } = await seedDrawScenario();
    await verifyUserContacts(user.id, { email: true });
    await setConfigNumber('draw_system.max_draw_per_request', '10');
    await setConfigNumber('draw_system.max_draw_per_day', '0');
    await setConfigNumber('draw_system.cooldown_seconds', '300');
    await setConfigNumber('payout_control.max_big_prize_per_hour', '10');
    await getDb()
      .update(prizes)
      .set({ stock: 10 })
      .where(eq(prizes.id, prize.id));
    await invalidatePoolCache();
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/draw/play',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        count: 2,
        clientNonce: 'integration-cooldown-multi-draw',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        message: 'Draw cooldown active.',
      },
    });

    const storedRecords = await getDb()
      .select({
        id: drawRecords.id,
      })
      .from(drawRecords)
      .where(eq(drawRecords.userId, user.id));
    expect(storedRecords).toHaveLength(0);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet?.withdrawableBalance).toBe('100.00');

    const [storedPrize] = await getDb()
      .select({
        stock: prizes.stock,
      })
      .from(prizes)
      .where(eq(prizes.id, prize.id))
      .limit(1);
    expect(storedPrize?.stock).toBe(10);
  });
});
