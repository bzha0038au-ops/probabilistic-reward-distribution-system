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
import { asc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  drawRecords,
  playModeSessions,
  prizes,
  userPlayModes,
  userWallets,
} from '@reward/database';

describeIntegrationSuite('backend draw gacha integration', () => {
  it(
    'GET /draw/catalog returns gacha presentation data for authenticated users',
    { timeout: 15_000 },
    async () => {
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
    },
  );

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

  it('POST /draw/play applies dual_bet as a product wrapper without changing the draw engine', async () => {
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
        count: 1,
        clientNonce: 'integration-draw-dual-bet',
        playMode: {
          type: 'dual_bet',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      requestedCount: 1,
      count: 2,
      totalCost: '20.00',
      totalReward: '10.00',
      endingBalance: '80.00',
      playMode: {
        type: 'dual_bet',
        appliedMultiplier: 2,
        nextMultiplier: 2,
      },
    });
    expect(payload.data.results).toHaveLength(2);
    expect(payload.data.results[0]?.fairness).toMatchObject({
      clientNonce: 'leg-1/2:integration-draw-dual-bet:1/1',
    });
    expect(payload.data.results[1]?.fairness).toMatchObject({
      clientNonce: 'leg-2/2:integration-draw-dual-bet:1/1',
    });

    const storedRecords = await getDb()
      .select({
        metadata: drawRecords.metadata,
      })
      .from(drawRecords)
      .where(eq(drawRecords.userId, user.id))
      .orderBy(asc(drawRecords.id));
    expect(storedRecords).toHaveLength(2);
    expect(storedRecords[0]?.metadata).toMatchObject({
      playMode: {
        type: 'dual_bet',
        appliedMultiplier: 2,
      },
    });
    expect(storedRecords[0]?.metadata).toMatchObject({
      fairness: {
        clientNonce: 'leg-1/2:integration-draw-dual-bet:1/1',
      },
    });
    expect(storedRecords[1]?.metadata).toMatchObject({
      fairness: {
        clientNonce: 'leg-2/2:integration-draw-dual-bet:1/1',
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
    expect(wallet).toMatchObject({
      withdrawableBalance: '80.00',
      wageredAmount: '20.00',
    });

    const sessions = await getDb()
      .select({
        id: playModeSessions.id,
        parentSessionId: playModeSessions.parentSessionId,
        executionIndex: playModeSessions.executionIndex,
        status: playModeSessions.status,
        mode: playModeSessions.mode,
        metadata: playModeSessions.metadata,
      })
      .from(playModeSessions)
      .where(eq(playModeSessions.userId, user.id));
    expect(sessions).toHaveLength(3);
    const parentSession = sessions.find((session) => session.parentSessionId === null);
    expect(parentSession).toMatchObject({
      executionIndex: 0,
      status: 'settled',
      mode: 'dual_bet',
      metadata: expect.objectContaining({
        requestedCount: 1,
        actualCount: 2,
        totalCost: '20.00',
        totalReward: '10.00',
        wageringRequirementDelta: '20.00',
        wrapperExecutionCount: 2,
      }),
    });
    expect((parentSession?.metadata as { legs?: unknown[] } | null)?.legs).toHaveLength(2);
    expect(
      sessions
        .filter((session) => session.parentSessionId === parentSession?.id)
        .sort((left, right) => left.executionIndex - right.executionIndex),
    ).toMatchObject([
      expect.objectContaining({
        executionIndex: 1,
        status: 'settled',
        metadata: expect.objectContaining({
          totalCost: '10.00',
          totalReward: '5.00',
          wageringRequirementDelta: '10.00',
          clientNonce: 'leg-1/2:integration-draw-dual-bet',
          wrapperExecutionIndex: 1,
        }),
      }),
      expect.objectContaining({
        executionIndex: 2,
        status: 'settled',
        metadata: expect.objectContaining({
          totalCost: '10.00',
          totalReward: '5.00',
          wageringRequirementDelta: '10.00',
          clientNonce: 'leg-2/2:integration-draw-dual-bet',
          wrapperExecutionIndex: 2,
        }),
      }),
    ]);

    const [storedMode] = await getDb()
      .select({
        mode: userPlayModes.mode,
        state: userPlayModes.state,
      })
      .from(userPlayModes)
      .where(eq(userPlayModes.userId, user.id))
      .limit(1);
    expect(storedMode).toMatchObject({
      mode: 'dual_bet',
      state: expect.objectContaining({
        type: 'dual_bet',
        nextMultiplier: 2,
      }),
    });
  });

  it('POST /draw/play rolls back the whole dual_bet wrapper when the second leg fails', async () => {
    try {
      const { user, prize } = await seedDrawScenario({
        email: 'draw-dual-bet-rollback@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('draw_system.max_draw_per_request', '10');
      await setConfigNumber('draw_system.cooldown_seconds', '60');
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
          count: 1,
          clientNonce: 'integration-draw-dual-bet-rollback',
          playMode: {
            type: 'dual_bet',
          },
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          message: 'Draw cooldown active.',
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
      expect(wallet).toMatchObject({
        withdrawableBalance: '100.00',
        wageredAmount: '0.00',
      });

      const storedRecords = await getDb()
        .select({ id: drawRecords.id })
        .from(drawRecords)
        .where(eq(drawRecords.userId, user.id));
      expect(storedRecords).toHaveLength(0);

      const sessions = await getDb()
        .select({ id: playModeSessions.id })
        .from(playModeSessions)
        .where(eq(playModeSessions.userId, user.id));
      expect(sessions).toHaveLength(0);
    } finally {
      await setConfigNumber('draw_system.cooldown_seconds', '0');
    }
  });

  it(
    'POST /draw/play defers draw rewards until the next request without changing the draw engine',
    { timeout: 30000 },
    async () => {
      const { user, prize } = await seedDrawScenario({
        email: 'draw-deferred-double-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('draw_system.max_draw_per_request', '10');
      await setConfigNumber('payout_control.max_big_prize_per_hour', '10');
      await getDb()
        .update(prizes)
        .set({
          stock: 10,
          userPoolThreshold: '0.00',
        })
        .where(eq(prizes.id, prize.id));
      await invalidatePoolCache();
      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const firstResponse = await getApp().inject({
        method: 'POST',
        url: '/draw/play',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          count: 1,
          clientNonce: 'integration-draw-deferred-double-win',
          playMode: {
            type: 'deferred_double',
          },
        },
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstPayload = firstResponse.json();
      expect(firstPayload.ok).toBe(true);
      expect(firstPayload.data).toMatchObject({
        requestedCount: 1,
        count: 1,
        totalCost: '10.00',
        totalReward: '5.00',
        winCount: 1,
        endingBalance: '90.00',
        playMode: {
          type: 'deferred_double',
          appliedMultiplier: 1,
          nextMultiplier: 1,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '5.00',
          pendingPayoutCount: 1,
        },
      });
      expect(firstPayload.data.results).toHaveLength(1);
      expect(firstPayload.data.results[0]).toMatchObject({
        status: 'won',
      });

      await getDb()
        .update(prizes)
        .set({
          stock: 10,
          userPoolThreshold: '999.00',
        })
        .where(eq(prizes.id, prize.id));
      await invalidatePoolCache();

      const secondResponse = await getApp().inject({
        method: 'POST',
        url: '/draw/play',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          count: 1,
          clientNonce: 'integration-draw-deferred-double-miss',
          playMode: {
            type: 'deferred_double',
          },
        },
      });

      expect(secondResponse.statusCode).toBe(200);
      const secondPayload = secondResponse.json();
      expect(secondPayload.ok).toBe(true);
      expect(secondPayload.data).toMatchObject({
        requestedCount: 1,
        count: 1,
        totalCost: '10.00',
        totalReward: '0.00',
        winCount: 0,
        endingBalance: '80.00',
        playMode: {
          type: 'deferred_double',
          appliedMultiplier: 1,
          nextMultiplier: 1,
          lastOutcome: 'miss',
          carryActive: false,
          pendingPayoutAmount: '0.00',
          pendingPayoutCount: 0,
        },
      });
      expect(secondPayload.data.results).toHaveLength(1);
      expect(secondPayload.data.results[0]).toMatchObject({
        status: 'miss',
      });

      const [walletAfterRelease] = await getDb()
        .select({
          bonusBalance: userWallets.bonusBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);
      expect(walletAfterRelease?.bonusBalance).toBe('5.00');

      const catalogResponse = await getApp().inject({
        method: 'GET',
        url: '/draw/catalog',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(catalogResponse.statusCode).toBe(200);
      expect(catalogResponse.json()).toMatchObject({
        ok: true,
        data: {
          playMode: {
            type: 'deferred_double',
            nextMultiplier: 1,
            lastOutcome: 'miss',
            carryActive: false,
          },
        },
      });
    }
  );

  it(
    'POST /draw/play carries snowball rewards across wins and releases them after a miss',
    { timeout: 30000 },
    async () => {
      const { user, prize } = await seedDrawScenario({
        email: 'draw-snowball-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      await setConfigNumber('draw_system.max_draw_per_request', '10');
      await setConfigNumber('payout_control.max_big_prize_per_hour', '10');
      await getDb()
        .update(prizes)
        .set({
          stock: 20,
          userPoolThreshold: '0.00',
        })
        .where(eq(prizes.id, prize.id));
      await invalidatePoolCache();
      const { token } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const firstResponse = await getApp().inject({
        method: 'POST',
        url: '/draw/play',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          count: 1,
          clientNonce: 'integration-draw-snowball-one',
          playMode: {
            type: 'snowball',
          },
        },
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstPayload = firstResponse.json();
      expect(firstPayload.ok).toBe(true);
      expect(firstPayload.data).toMatchObject({
        requestedCount: 1,
        count: 1,
        totalCost: '10.00',
        totalReward: '5.00',
        winCount: 1,
        endingBalance: '90.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 2,
          streak: 1,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '5.00',
          pendingPayoutCount: 1,
          snowballCarryAmount: '5.00',
        },
      });

      const secondResponse = await getApp().inject({
        method: 'POST',
        url: '/draw/play',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          count: 1,
          clientNonce: 'integration-draw-snowball-two',
          playMode: {
            type: 'snowball',
          },
        },
      });

      expect(secondResponse.statusCode).toBe(200);
      const secondPayload = secondResponse.json();
      expect(secondPayload.ok).toBe(true);
      expect(secondPayload.data).toMatchObject({
        requestedCount: 1,
        count: 1,
        totalCost: '10.00',
        totalReward: '5.00',
        winCount: 1,
        endingBalance: '80.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 3,
          streak: 2,
          lastOutcome: 'win',
          carryActive: true,
          pendingPayoutAmount: '10.00',
          pendingPayoutCount: 2,
          snowballCarryAmount: '10.00',
        },
      });

      await getDb()
        .update(prizes)
        .set({
          stock: 20,
          userPoolThreshold: '999.00',
        })
        .where(eq(prizes.id, prize.id));
      await invalidatePoolCache();

      const thirdResponse = await getApp().inject({
        method: 'POST',
        url: '/draw/play',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          count: 1,
          clientNonce: 'integration-draw-snowball-three',
          playMode: {
            type: 'snowball',
          },
        },
      });

      expect(thirdResponse.statusCode).toBe(200);
      const thirdPayload = thirdResponse.json();
      expect(thirdPayload.ok).toBe(true);
      expect(thirdPayload.data).toMatchObject({
        requestedCount: 1,
        count: 1,
        totalCost: '10.00',
        totalReward: '0.00',
        winCount: 0,
        endingBalance: '70.00',
        playMode: {
          type: 'snowball',
          appliedMultiplier: 1,
          nextMultiplier: 1,
          streak: 0,
          lastOutcome: 'miss',
          carryActive: false,
          pendingPayoutAmount: '0.00',
          pendingPayoutCount: 0,
          snowballCarryAmount: '0.00',
        },
      });
      expect(thirdPayload.data.results).toHaveLength(1);

      const [walletAfterSnowballRelease] = await getDb()
        .select({
          bonusBalance: userWallets.bonusBalance,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);
      expect(walletAfterSnowballRelease?.bonusBalance).toBe('10.00');

      const [storedMode] = await getDb()
        .select({
          mode: userPlayModes.mode,
          state: userPlayModes.state,
        })
        .from(userPlayModes)
        .where(eq(userPlayModes.userId, user.id))
        .limit(1);
      expect(storedMode).toMatchObject({
        mode: 'snowball',
        state: expect.objectContaining({
          type: 'snowball',
          nextMultiplier: 1,
          streak: 0,
          lastOutcome: 'miss',
        }),
      });
    }
  );

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
