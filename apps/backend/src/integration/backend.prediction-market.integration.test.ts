import {
  buildAdminCookieHeaders,
  buildUserAuthHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getCreateUserSessionToken,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import {
  adminActions,
  ledgerEntries,
  predictionMarkets,
  predictionPositions,
  userWallets,
} from '@reward/database';
import { and, asc, eq } from '@reward/database/orm';
import type {
  CancelPredictionMarketRequest,
  CreatePredictionMarketRequest,
  PredictionMarketDetail,
  PredictionMarketPositionMutationResponse,
  PredictionMarketPositionRequest,
  PredictionMarketSummary,
  SettlePredictionMarketRequest,
} from '@reward/shared-types/prediction-market';

type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

const expectSuccessEnvelope = <T>(
  response: {
    statusCode: number;
    json: () => unknown;
  },
  statusCode = 200,
) => {
  expect(response.statusCode).toBe(statusCode);
  const payload = response.json() as SuccessEnvelope<T>;
  expect(payload.ok).toBe(true);
  expect(payload.requestId).toEqual(expect.any(String));
  return payload.data;
};

const seedMarketAdmin = async (email: string) => {
  const { admin, password } = await seedAdminAccount({ email });
  await grantAdminPermissions(admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
  const session = await enrollAdminMfa({ email, password });
  return {
    ...buildAdminCookieHeaders(session.token),
    'x-admin-totp-code': session.totpCode,
  };
};

const seedMarketUser = async (params: {
  email: string;
  withdrawableBalance?: string;
}) => {
  const user = await seedUserWithWallet({
    email: params.email,
    withdrawableBalance: params.withdrawableBalance ?? '100.00',
  });
  await verifyUserContacts(user.id, { email: true });
  const { token } = await getCreateUserSessionToken()({
    userId: user.id,
    email: user.email,
    role: 'user',
  });

  return { user, token };
};

const createPredictionMarketViaAdmin = async (
  headers: Record<string, string>,
  payload: CreatePredictionMarketRequest,
) => {
  const response = await getApp().inject({
    method: 'POST',
    url: '/admin/markets',
    headers,
    payload: {
      ...payload,
      totpCode: headers['x-admin-totp-code'],
    },
  });

  return expectSuccessEnvelope<PredictionMarketDetail>(response, 201);
};

const listPredictionMarketsViaUser = async (token: string) => {
  const response = await getApp().inject({
    method: 'GET',
    url: '/markets',
    headers: buildUserAuthHeaders(token),
  });

  return expectSuccessEnvelope<PredictionMarketSummary[]>(response);
};

const getPredictionMarketViaUser = async (token: string, marketId: number) => {
  const response = await getApp().inject({
    method: 'GET',
    url: `/markets/${marketId}`,
    headers: buildUserAuthHeaders(token),
  });

  return expectSuccessEnvelope<PredictionMarketDetail>(response);
};

const placePredictionPositionViaUser = async (
  token: string,
  marketId: number,
  payload: PredictionMarketPositionRequest,
) => {
  const response = await getApp().inject({
    method: 'POST',
    url: `/markets/${marketId}/positions`,
    headers: buildUserAuthHeaders(token),
    payload,
  });

  return expectSuccessEnvelope<PredictionMarketPositionMutationResponse>(
    response,
    201,
  );
};

const settlePredictionMarketViaAdmin = async (
  headers: Record<string, string>,
  marketId: number,
  payload: SettlePredictionMarketRequest,
) => {
  const response = await getApp().inject({
    method: 'POST',
    url: `/admin/markets/${marketId}/settle`,
    headers,
    payload: {
      ...payload,
      totpCode: headers['x-admin-totp-code'],
    },
  });

  return expectSuccessEnvelope<PredictionMarketDetail>(response);
};

const cancelPredictionMarketViaAdmin = async (
  headers: Record<string, string>,
  marketId: number,
  payload: CancelPredictionMarketRequest,
) => {
  const response = await getApp().inject({
    method: 'POST',
    url: `/admin/markets/${marketId}/cancel`,
    headers,
    payload: {
      ...payload,
      totpCode: headers['x-admin-totp-code'],
    },
  });

  return expectSuccessEnvelope<PredictionMarketDetail>(response);
};

const buildCreateMarketPayload = (
  payload: Pick<
    CreatePredictionMarketRequest,
    'slug' | 'roundKey' | 'title' | 'description' | 'outcomes'
  >,
): CreatePredictionMarketRequest => ({
  ...payload,
  resolutionRules:
    'Resolve using the final published outcome from the named source, with voided events refunded.',
  sourceOfTruth: 'Official event close report',
  category: 'other',
  tags: ['integration'],
  invalidPolicy: 'refund_all',
  locksAt: new Date(Date.now() + 3_600_000).toISOString(),
});

const lockPredictionMarketForSettlement = async (marketId: number) => {
  await getDb()
    .update(predictionMarkets)
    .set({
      locksAt: new Date(Date.now() - 1_000),
      updatedAt: new Date(),
    })
    .where(eq(predictionMarkets.id, marketId));
};

const findMarketSummary = (
  markets: PredictionMarketSummary[],
  marketId: number,
) => {
  const market = markets.find((candidate) => candidate.id === marketId);
  expect(market).toBeDefined();
  if (!market) {
    throw new Error(`Prediction market ${marketId} missing from user list.`);
  }
  return market;
};

const getWalletSnapshot = async (userId: number) => {
  const [wallet] = await getDb()
    .select({
      userId: userWallets.userId,
      withdrawableBalance: userWallets.withdrawableBalance,
      lockedBalance: userWallets.lockedBalance,
    })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));

  expect(wallet).toBeDefined();
  if (!wallet) {
    throw new Error(`Wallet missing for user ${userId}.`);
  }

  return wallet;
};

const listMarketLedgerEntries = async (marketId: number) =>
  getDb()
    .select({
      userId: ledgerEntries.userId,
      entryType: ledgerEntries.entryType,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.referenceType, 'prediction_market'),
        eq(ledgerEntries.referenceId, marketId),
      ),
    )
    .orderBy(asc(ledgerEntries.id));

const listMarketPositions = async (marketId: number) =>
  getDb()
    .select({
      userId: predictionPositions.userId,
      outcomeKey: predictionPositions.outcomeKey,
      stakeAmount: predictionPositions.stakeAmount,
      payoutAmount: predictionPositions.payoutAmount,
      status: predictionPositions.status,
    })
    .from(predictionPositions)
    .where(eq(predictionPositions.marketId, marketId))
    .orderBy(asc(predictionPositions.id));

describeIntegrationSuite('backend prediction market integration', () => {
  it('covers the HTTP lifecycle for resolved payout settlement', async () => {
    const adminHeaders = await seedMarketAdmin('prediction-admin@example.com');
    const alice = await seedMarketUser({ email: 'prediction-alice@example.com' });
    const bob = await seedMarketUser({ email: 'prediction-bob@example.com' });
    const carol = await seedMarketUser({ email: 'prediction-carol@example.com' });

    const market = await createPredictionMarketViaAdmin(adminHeaders, buildCreateMarketPayload({
      slug: 'btc-above-100k-2026-04-29',
      roundKey: 'btc-2026-04-29-close',
      title: 'BTC closes above 100k on 2026-04-29 UTC',
      description: 'Integration payout lifecycle market',
      outcomes: [
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ],
    }));

    expect(market).toMatchObject({
      slug: 'btc-above-100k-2026-04-29',
      status: 'open',
      totalPoolAmount: '0.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
      userPositions: [],
    });

    const listedBefore = await listPredictionMarketsViaUser(alice.token);
    const listedBeforeMarket = findMarketSummary(listedBefore, market.id);
    expect(listedBeforeMarket).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '0.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
      outcomePools: [
        {
          outcomeKey: 'yes',
          totalStakeAmount: '0.00',
          positionCount: 0,
        },
        {
          outcomeKey: 'no',
          totalStakeAmount: '0.00',
          positionCount: 0,
        },
      ],
    });
    expect(listedBeforeMarket).not.toHaveProperty('userPositions');

    const detailBefore = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailBefore).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '0.00',
      userPositions: [],
    });

    const alicePlacement = await placePredictionPositionViaUser(alice.token, market.id, {
      outcomeKey: 'yes',
      stakeAmount: '30.00',
    });
    expect(alicePlacement).toMatchObject({
      position: {
        userId: alice.user.id,
        outcomeKey: 'yes',
        stakeAmount: '30.00',
        payoutAmount: '0.00',
        status: 'open',
      },
      market: {
        id: market.id,
        totalPoolAmount: '30.00',
        userPositions: [
          expect.objectContaining({
            userId: alice.user.id,
            outcomeKey: 'yes',
            stakeAmount: '30.00',
            payoutAmount: '0.00',
            status: 'open',
          }),
        ],
      },
    });

    await placePredictionPositionViaUser(bob.token, market.id, {
      outcomeKey: 'yes',
      stakeAmount: '10.00',
    });
    await placePredictionPositionViaUser(carol.token, market.id, {
      outcomeKey: 'no',
      stakeAmount: '10.00',
    });

    const detailAfterPlace = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailAfterPlace).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '50.00',
      outcomePools: [
        {
          outcomeKey: 'yes',
          totalStakeAmount: '40.00',
          positionCount: 2,
        },
        {
          outcomeKey: 'no',
          totalStakeAmount: '10.00',
          positionCount: 1,
        },
      ],
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'yes',
          stakeAmount: '30.00',
          payoutAmount: '0.00',
          status: 'open',
        }),
      ],
    });

    await lockPredictionMarketForSettlement(market.id);

    const settledMarket = await settlePredictionMarketViaAdmin(
      adminHeaders,
      market.id,
      {
        winningOutcomeKey: 'yes',
        oracle: {
          source: 'manual_oracle',
          externalRef: 'oracle-yes-001',
        },
      },
    );

    expect(settledMarket).toMatchObject({
      id: market.id,
      status: 'resolved',
      winningOutcomeKey: 'yes',
      totalPoolAmount: '50.00',
      winningPoolAmount: '40.00',
    });

    const listedAfter = await listPredictionMarketsViaUser(alice.token);
    expect(findMarketSummary(listedAfter, market.id)).toMatchObject({
      id: market.id,
      status: 'resolved',
      totalPoolAmount: '50.00',
      winningOutcomeKey: 'yes',
      winningPoolAmount: '40.00',
    });

    const detailAfterSettlement = await getPredictionMarketViaUser(
      alice.token,
      market.id,
    );
    expect(detailAfterSettlement).toMatchObject({
      id: market.id,
      status: 'resolved',
      winningOutcomeKey: 'yes',
      winningPoolAmount: '40.00',
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'yes',
          stakeAmount: '30.00',
          payoutAmount: '37.50',
          status: 'won',
        }),
      ],
    });

    expect(await getWalletSnapshot(alice.user.id)).toEqual({
      userId: alice.user.id,
      withdrawableBalance: '107.50',
      lockedBalance: '0.00',
    });
    expect(await getWalletSnapshot(bob.user.id)).toEqual({
      userId: bob.user.id,
      withdrawableBalance: '102.50',
      lockedBalance: '0.00',
    });
    expect(await getWalletSnapshot(carol.user.id)).toEqual({
      userId: carol.user.id,
      withdrawableBalance: '90.00',
      lockedBalance: '0.00',
    });

    expect(await listMarketLedgerEntries(market.id)).toEqual([
      {
        userId: alice.user.id,
        entryType: 'prediction_market_stake',
        amount: '-30.00',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_stake',
        amount: '-10.00',
      },
      {
        userId: carol.user.id,
        entryType: 'prediction_market_stake',
        amount: '-10.00',
      },
      {
        userId: alice.user.id,
        entryType: 'prediction_market_payout',
        amount: '37.50',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_payout',
        amount: '12.50',
      },
    ]);

    expect(await listMarketPositions(market.id)).toEqual([
      {
        userId: alice.user.id,
        outcomeKey: 'yes',
        stakeAmount: '30.00',
        payoutAmount: '37.50',
        status: 'won',
      },
      {
        userId: bob.user.id,
        outcomeKey: 'yes',
        stakeAmount: '10.00',
        payoutAmount: '12.50',
        status: 'won',
      },
      {
        userId: carol.user.id,
        outcomeKey: 'no',
        stakeAmount: '10.00',
        payoutAmount: '0.00',
        status: 'lost',
      },
    ]);
  });

  it('covers the HTTP lifecycle for refund_no_winners settlement', async () => {
    const adminHeaders = await seedMarketAdmin('prediction-refund-admin@example.com');
    const alice = await seedMarketUser({ email: 'prediction-refund-alice@example.com' });
    const bob = await seedMarketUser({ email: 'prediction-refund-bob@example.com' });

    const market = await createPredictionMarketViaAdmin(adminHeaders, buildCreateMarketPayload({
      slug: 'match-draw-refund-2026-04-29',
      roundKey: 'match-2026-04-29',
      title: 'Match result settles to draw',
      description: 'Integration refund-no-winners lifecycle market',
      outcomes: [
        { key: 'home', label: 'Home' },
        { key: 'away', label: 'Away' },
        { key: 'draw', label: 'Draw' },
      ],
    }));

    const listedBefore = await listPredictionMarketsViaUser(alice.token);
    expect(findMarketSummary(listedBefore, market.id)).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '0.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
    });

    const detailBefore = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailBefore.userPositions).toEqual([]);

    await placePredictionPositionViaUser(alice.token, market.id, {
      outcomeKey: 'home',
      stakeAmount: '12.50',
    });
    await placePredictionPositionViaUser(bob.token, market.id, {
      outcomeKey: 'away',
      stakeAmount: '7.50',
    });

    const detailAfterPlace = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailAfterPlace).toMatchObject({
      id: market.id,
      totalPoolAmount: '20.00',
      outcomePools: [
        {
          outcomeKey: 'home',
          totalStakeAmount: '12.50',
          positionCount: 1,
        },
        {
          outcomeKey: 'away',
          totalStakeAmount: '7.50',
          positionCount: 1,
        },
        {
          outcomeKey: 'draw',
          totalStakeAmount: '0.00',
          positionCount: 0,
        },
      ],
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'home',
          stakeAmount: '12.50',
          payoutAmount: '0.00',
          status: 'open',
        }),
      ],
    });

    await lockPredictionMarketForSettlement(market.id);

    const settledMarket = await settlePredictionMarketViaAdmin(
      adminHeaders,
      market.id,
      {
        winningOutcomeKey: 'draw',
        oracle: {
          source: 'manual_oracle',
          externalRef: 'oracle-draw-001',
        },
      },
    );

    expect(settledMarket).toMatchObject({
      id: market.id,
      status: 'resolved',
      winningOutcomeKey: 'draw',
      totalPoolAmount: '20.00',
      winningPoolAmount: '0.00',
    });

    const listedAfter = await listPredictionMarketsViaUser(alice.token);
    expect(findMarketSummary(listedAfter, market.id)).toMatchObject({
      id: market.id,
      status: 'resolved',
      totalPoolAmount: '20.00',
      winningOutcomeKey: 'draw',
      winningPoolAmount: '0.00',
    });

    const detailAfterSettlement = await getPredictionMarketViaUser(
      alice.token,
      market.id,
    );
    expect(detailAfterSettlement).toMatchObject({
      id: market.id,
      status: 'resolved',
      winningOutcomeKey: 'draw',
      winningPoolAmount: '0.00',
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'home',
          stakeAmount: '12.50',
          payoutAmount: '12.50',
          status: 'refunded',
        }),
      ],
    });

    expect(await getWalletSnapshot(alice.user.id)).toEqual({
      userId: alice.user.id,
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });
    expect(await getWalletSnapshot(bob.user.id)).toEqual({
      userId: bob.user.id,
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });

    expect(await listMarketLedgerEntries(market.id)).toEqual([
      {
        userId: alice.user.id,
        entryType: 'prediction_market_stake',
        amount: '-12.50',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_stake',
        amount: '-7.50',
      },
      {
        userId: alice.user.id,
        entryType: 'prediction_market_refund',
        amount: '12.50',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_refund',
        amount: '7.50',
      },
    ]);

    expect(await listMarketPositions(market.id)).toEqual([
      {
        userId: alice.user.id,
        outcomeKey: 'home',
        stakeAmount: '12.50',
        payoutAmount: '12.50',
        status: 'refunded',
      },
      {
        userId: bob.user.id,
        outcomeKey: 'away',
        stakeAmount: '7.50',
        payoutAmount: '7.50',
        status: 'refunded',
      },
    ]);
  });

  it('covers the HTTP lifecycle for admin cancellation refunds', async () => {
    const adminHeaders = await seedMarketAdmin('prediction-cancel-admin@example.com');
    const alice = await seedMarketUser({ email: 'prediction-cancel-alice@example.com' });
    const bob = await seedMarketUser({ email: 'prediction-cancel-bob@example.com' });

    const market = await createPredictionMarketViaAdmin(adminHeaders, buildCreateMarketPayload({
      slug: 'event-voided-2026-04-29',
      roundKey: 'event-voided-2026-04-29',
      title: 'Event voided before resolution',
      description: 'Integration cancel lifecycle market',
      outcomes: [
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ],
    }));

    const listedBefore = await listPredictionMarketsViaUser(alice.token);
    expect(findMarketSummary(listedBefore, market.id)).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '0.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
    });

    const detailBefore = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailBefore.userPositions).toEqual([]);

    await placePredictionPositionViaUser(alice.token, market.id, {
      outcomeKey: 'yes',
      stakeAmount: '9.00',
    });
    await placePredictionPositionViaUser(bob.token, market.id, {
      outcomeKey: 'no',
      stakeAmount: '11.00',
    });

    const detailAfterPlace = await getPredictionMarketViaUser(alice.token, market.id);
    expect(detailAfterPlace).toMatchObject({
      id: market.id,
      status: 'open',
      totalPoolAmount: '20.00',
      outcomePools: [
        {
          outcomeKey: 'yes',
          totalStakeAmount: '9.00',
          positionCount: 1,
        },
        {
          outcomeKey: 'no',
          totalStakeAmount: '11.00',
          positionCount: 1,
        },
      ],
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'yes',
          stakeAmount: '9.00',
          payoutAmount: '0.00',
          status: 'open',
        }),
      ],
    });

    const cancelledMarket = await cancelPredictionMarketViaAdmin(
      adminHeaders,
      market.id,
      {
        reason: 'event_voided',
        metadata: {
          source: 'manual_review',
        },
      },
    );

    expect(cancelledMarket).toMatchObject({
      id: market.id,
      status: 'cancelled',
      totalPoolAmount: '20.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
    });

    const listedAfter = await listPredictionMarketsViaUser(alice.token);
    expect(findMarketSummary(listedAfter, market.id)).toMatchObject({
      id: market.id,
      status: 'cancelled',
      totalPoolAmount: '20.00',
      winningOutcomeKey: null,
      winningPoolAmount: null,
    });

    const detailAfterCancellation = await getPredictionMarketViaUser(
      alice.token,
      market.id,
    );
    expect(detailAfterCancellation).toMatchObject({
      id: market.id,
      status: 'cancelled',
      winningOutcomeKey: null,
      winningPoolAmount: null,
      userPositions: [
        expect.objectContaining({
          userId: alice.user.id,
          outcomeKey: 'yes',
          stakeAmount: '9.00',
          payoutAmount: '9.00',
          status: 'refunded',
        }),
      ],
    });

    expect(await getWalletSnapshot(alice.user.id)).toEqual({
      userId: alice.user.id,
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });
    expect(await getWalletSnapshot(bob.user.id)).toEqual({
      userId: bob.user.id,
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });

    expect(await listMarketLedgerEntries(market.id)).toEqual([
      {
        userId: alice.user.id,
        entryType: 'prediction_market_stake',
        amount: '-9.00',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_stake',
        amount: '-11.00',
      },
      {
        userId: alice.user.id,
        entryType: 'prediction_market_refund',
        amount: '9.00',
      },
      {
        userId: bob.user.id,
        entryType: 'prediction_market_refund',
        amount: '11.00',
      },
    ]);

    expect(await listMarketPositions(market.id)).toEqual([
      {
        userId: alice.user.id,
        outcomeKey: 'yes',
        stakeAmount: '9.00',
        payoutAmount: '9.00',
        status: 'refunded',
      },
      {
        userId: bob.user.id,
        outcomeKey: 'no',
        stakeAmount: '11.00',
        payoutAmount: '11.00',
        status: 'refunded',
      },
    ]);

    const [auditRecord] = await getDb()
      .select({
        action: adminActions.action,
        targetId: adminActions.targetId,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.action, 'prediction_market_cancel'),
          eq(adminActions.targetId, market.id),
        ),
      )
      .limit(1);

    expect(auditRecord).toMatchObject({
      action: 'prediction_market_cancel',
      targetId: market.id,
      metadata: expect.objectContaining({
        slug: market.slug,
        roundKey: market.roundKey,
        finalStatus: 'cancelled',
        reason: 'event_voided',
      }),
    });
  });

  it('allows admin cancellation for draft and locked markets', async () => {
    const adminHeaders = await seedMarketAdmin('prediction-cancel-status-admin@example.com');
    const draftMarket = await createPredictionMarketViaAdmin(adminHeaders, {
      ...buildCreateMarketPayload({
        slug: 'draft-market-2026-04-29',
        roundKey: 'draft-market-2026-04-29',
        title: 'Draft market can be cancelled',
        description: 'Integration draft cancellation market',
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      }),
      opensAt: new Date(Date.now() + 3_600_000).toISOString(),
      locksAt: new Date(Date.now() + 7_200_000).toISOString(),
    });

    const cancelledDraftMarket = await cancelPredictionMarketViaAdmin(
      adminHeaders,
      draftMarket.id,
      {
        reason: 'draft_market_withdrawn',
      },
    );

    expect(cancelledDraftMarket).toMatchObject({
      id: draftMarket.id,
      status: 'cancelled',
      totalPoolAmount: '0.00',
    });
    expect(await listMarketLedgerEntries(draftMarket.id)).toEqual([]);
    expect(await listMarketPositions(draftMarket.id)).toEqual([]);

    const lockedUser = await seedMarketUser({
      email: 'prediction-cancel-locked-user@example.com',
    });
    const lockedMarket = await createPredictionMarketViaAdmin(
      adminHeaders,
      buildCreateMarketPayload({
        slug: 'locked-market-2026-04-29',
        roundKey: 'locked-market-2026-04-29',
        title: 'Locked market can be cancelled',
        description: 'Integration locked cancellation market',
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      }),
    );

    await placePredictionPositionViaUser(lockedUser.token, lockedMarket.id, {
      outcomeKey: 'yes',
      stakeAmount: '15.00',
    });
    await lockPredictionMarketForSettlement(lockedMarket.id);

    const cancelledLockedMarket = await cancelPredictionMarketViaAdmin(
      adminHeaders,
      lockedMarket.id,
      {
        reason: 'locked_market_voided',
      },
    );

    expect(cancelledLockedMarket).toMatchObject({
      id: lockedMarket.id,
      status: 'cancelled',
      totalPoolAmount: '15.00',
    });
    expect(await getWalletSnapshot(lockedUser.user.id)).toEqual({
      userId: lockedUser.user.id,
      withdrawableBalance: '100.00',
      lockedBalance: '0.00',
    });
    expect(await listMarketPositions(lockedMarket.id)).toEqual([
      {
        userId: lockedUser.user.id,
        outcomeKey: 'yes',
        stakeAmount: '15.00',
        payoutAmount: '15.00',
        status: 'refunded',
      },
    ]);
  });

  it('returns conflict when cancelling an already cancelled or resolved market', async () => {
    const adminHeaders = await seedMarketAdmin(
      'prediction-cancel-conflict-admin@example.com',
    );
    const user = await seedMarketUser({
      email: 'prediction-cancel-conflict-user@example.com',
    });
    const cancelledMarket = await createPredictionMarketViaAdmin(
      adminHeaders,
      buildCreateMarketPayload({
        slug: 'cancel-conflict-2026-04-29',
        roundKey: 'cancel-conflict-2026-04-29',
        title: 'Duplicate cancellation conflict',
        description: 'Integration duplicate cancellation conflict market',
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      }),
    );

    await placePredictionPositionViaUser(user.token, cancelledMarket.id, {
      outcomeKey: 'yes',
      stakeAmount: '5.00',
    });
    await cancelPredictionMarketViaAdmin(adminHeaders, cancelledMarket.id, {
      reason: 'duplicate_cancel_check',
    });

    const duplicateCancelResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/markets/${cancelledMarket.id}/cancel`,
      headers: adminHeaders,
      payload: {
        reason: 'duplicate_cancel_check_again',
      },
    });
    expect(duplicateCancelResponse.statusCode).toBe(409);

    const resolvedMarket = await createPredictionMarketViaAdmin(
      adminHeaders,
      buildCreateMarketPayload({
        slug: 'resolved-conflict-2026-04-29',
        roundKey: 'resolved-conflict-2026-04-29',
        title: 'Resolved market conflict',
        description: 'Integration resolved cancellation conflict market',
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      }),
    );

    await placePredictionPositionViaUser(user.token, resolvedMarket.id, {
      outcomeKey: 'yes',
      stakeAmount: '6.00',
    });
    await lockPredictionMarketForSettlement(resolvedMarket.id);
    await settlePredictionMarketViaAdmin(adminHeaders, resolvedMarket.id, {
      winningOutcomeKey: 'yes',
      oracle: {
        source: 'integration_oracle',
      },
    });

    const resolvedCancelResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/markets/${resolvedMarket.id}/cancel`,
      headers: adminHeaders,
      payload: {
        reason: 'resolved_cancel_check',
      },
    });
    expect(resolvedCancelResponse.statusCode).toBe(409);
  });
});
