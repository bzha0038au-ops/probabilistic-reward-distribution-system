import { createHash } from 'node:crypto';

import {
  freezeRecords,
  handHistories,
  holdemTableMessages,
  ledgerEntries,
  playModeSessions,
  holdemTableSeats,
  holdemTables,
  riskTableInteractionEvents,
  riskTableInteractionPairs,
  roundEvents,
  suspiciousAccounts,
  systemConfig,
  tableEvents,
  userPlayModes,
  userWallets,
} from '@reward/database';
import { and, asc, desc, eq } from '@reward/database/orm';
import { API_ERROR_CODES } from '@reward/shared-types/api';

import {
  buildUserAuthHeaders,
  describeIntegrationSuite,
  expect,
  expectPresent,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import { verifyHoldemSignedEvidenceBundle } from '../modules/hand-history/evidence-bundle';
import {
  ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY,
  ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY,
} from '../modules/system/keys';

const issueUserHeaders = async (
  user: { id: number; email: string },
  options?: {
    ip?: string | null;
    userAgent?: string | null;
  },
) => {
  const { token } = await getCreateUserSessionToken()({
    userId: user.id,
    email: user.email,
    role: 'user',
  }, options);

  return buildUserAuthHeaders(token);
};

const setNumericSystemConfig = async (configKey: string, value: number) => {
  await getDb()
    .insert(systemConfig)
    .values({
      configKey,
      configNumber: String(value),
    })
    .onConflictDoUpdate({
      target: systemConfig.configKey,
      set: {
        configNumber: String(value),
        updatedAt: new Date(),
      },
    });
};

const setBooleanSystemConfig = async (configKey: string, value: boolean) => {
  await getDb()
    .insert(systemConfig)
    .values({
      configKey,
      configNumber: value ? '1.00' : '0.00',
      configValue: null,
    })
    .onConflictDoUpdate({
      target: systemConfig.configKey,
      set: {
        configNumber: value ? '1.00' : '0.00',
        configValue: null,
        updatedAt: new Date(),
      },
    });
};

const setupHoldemHand = async (options?: {
  userOneSession?: {
    ip?: string | null;
    userAgent?: string | null;
  };
  userTwoSession?: {
    ip?: string | null;
    userAgent?: string | null;
  };
}) => {
  const userOne = await seedUserWithWallet({
    email: 'holdem-user-one@example.com',
    withdrawableBalance: '500.00',
  });
  const userTwo = await seedUserWithWallet({
    email: 'holdem-user-two@example.com',
    withdrawableBalance: '500.00',
  });

  await verifyUserContacts(userOne.id, { email: true, phone: true });
  await verifyUserContacts(userTwo.id, { email: true, phone: true });

  const userOneHeaders = await issueUserHeaders(userOne, options?.userOneSession);
  const userTwoHeaders = await issueUserHeaders(userTwo, options?.userTwoSession);

  const createResponse = await getApp().inject({
    method: 'POST',
    url: '/holdem/tables',
    headers: userOneHeaders,
    payload: {
      tableName: 'Integration Holdem',
      buyInAmount: '100.00',
    },
  });
  expect(createResponse.statusCode).toBe(201);

  const createPayload = createResponse.json();
  const tableId = createPayload.data.table.id as number;

  const joinResponse = await getApp().inject({
    method: 'POST',
    url: `/holdem/tables/${tableId}/join`,
    headers: userTwoHeaders,
    payload: {
      buyInAmount: '100.00',
    },
  });
  expect(joinResponse.statusCode).toBe(200);

  const startResponse = await getApp().inject({
    method: 'POST',
    url: `/holdem/tables/${tableId}/start`,
    headers: userOneHeaders,
    payload: {},
  });
  expect(startResponse.statusCode).toBe(200);

  return {
    tableId,
    userOne,
    userTwo,
    userOneHeaders,
    userTwoHeaders,
    table: startResponse.json().data.table as {
      pendingActorSeatIndex: number | null;
      pendingActorDeadlineAt: string | null;
      pendingActorTimeBankStartsAt: string | null;
      pendingActorTimeoutAction: string | null;
      seats: Array<{
        seatIndex: number;
        userId: number | null;
        turnDeadlineAt: string | null;
        timeBankRemainingMs: number;
        lastAction: string | null;
      }>;
      recentHands: Array<unknown>;
      status: string;
    },
  };
};

const setHoldemTurnWindow = async (params: {
  tableId: number;
  seatIndex: number;
  turnDeadlineAt: Date;
  turnTimeBankStartsAt: Date;
  turnTimeBankAllocatedMs?: number;
}) => {
  const [tableRow] = await getDb()
    .select({
      metadata: holdemTables.metadata,
    })
    .from(holdemTables)
    .where(eq(holdemTables.id, params.tableId))
    .limit(1);
  const metadata =
    tableRow?.metadata && typeof tableRow.metadata === 'object'
      ? (tableRow.metadata as Record<string, unknown>)
      : {};
  const turnTimeBankAllocatedMs = params.turnTimeBankAllocatedMs ?? 30_000;
  const turnStartedAt = new Date(
    params.turnTimeBankStartsAt.getTime() - 30_000,
  );

  await getDb()
    .update(holdemTableSeats)
    .set({
      turnDeadlineAt: params.turnDeadlineAt,
    })
    .where(
      and(
        eq(holdemTableSeats.tableId, params.tableId),
        eq(holdemTableSeats.seatIndex, params.seatIndex),
      ),
    );

  await getDb()
    .update(holdemTables)
    .set({
      metadata: {
        ...metadata,
        turnStartedAt,
        turnTimeBankStartsAt: params.turnTimeBankStartsAt,
        turnTimeBankAllocatedMs,
      },
    })
    .where(eq(holdemTables.id, params.tableId));
};

const resolveHeadersForUserId = (
  userId: number,
  setup: Awaited<ReturnType<typeof setupHoldemHand>>,
) =>
  userId === setup.userOne.id ? setup.userOneHeaders : setup.userTwoHeaders;

const setupSingleSeatHoldemTable = async () => {
  const user = await seedUserWithWallet({
    email: 'holdem-single-seat@example.com',
    withdrawableBalance: '500.00',
  });
  await verifyUserContacts(user.id, { email: true, phone: true });
  const headers = await issueUserHeaders(user);

  const createResponse = await getApp().inject({
    method: 'POST',
    url: '/holdem/tables',
    headers,
    payload: {
      tableName: 'Single Seat Holdem',
      buyInAmount: '100.00',
    },
  });
  expect(createResponse.statusCode).toBe(201);

  return {
    user,
    headers,
    tableId: createResponse.json().data.table.id as number,
  };
};

const seedVerifiedHoldemUserSession = async (params: {
  email: string;
  withdrawableBalance?: string;
  bonusBalance?: string;
}) => {
  const user = await seedUserWithWallet({
    email: params.email,
    withdrawableBalance: params.withdrawableBalance ?? '500.00',
    bonusBalance: params.bonusBalance ?? '0.00',
  });
  await verifyUserContacts(user.id, { email: true, phone: true });
  const headers = await issueUserHeaders(user);

  return {
    user,
    headers,
  };
};

const rigStartedHoldemCards = async (params: {
  tableId: number;
  boardCards: Array<{ rank: string; suit: string }>;
  holeCardsBySeatIndex: Record<number, Array<{ rank: string; suit: string }>>;
}) => {
  const [tableRow] = await getDb()
    .select({
      metadata: holdemTables.metadata,
    })
    .from(holdemTables)
    .where(eq(holdemTables.id, params.tableId))
    .limit(1);
  const metadata =
    tableRow?.metadata && typeof tableRow.metadata === 'object'
      ? structuredClone(tableRow.metadata as Record<string, unknown>)
      : {};
  const nextCardIndex =
    typeof metadata.nextCardIndex === 'number'
      ? metadata.nextCardIndex
      : Number(metadata.nextCardIndex ?? 0);
  const deck = Array.isArray(metadata.deck) ? [...metadata.deck] : [];

  params.boardCards.forEach((card, index) => {
    deck[nextCardIndex + index] = card;
  });

  await getDb()
    .update(holdemTables)
    .set({
      metadata: {
        ...metadata,
        deck,
      },
    })
    .where(eq(holdemTables.id, params.tableId));

  for (const [seatIndex, holeCards] of Object.entries(params.holeCardsBySeatIndex)) {
    await getDb()
      .update(holdemTableSeats)
      .set({
        holeCards,
      })
      .where(
        and(
          eq(holdemTableSeats.tableId, params.tableId),
          eq(holdemTableSeats.seatIndex, Number(seatIndex)),
        ),
      );
  }
};

describeIntegrationSuite('backend holdem integration', () => {
  it('requires tier 2 KYC before a user can create a cash holdem table', async () => {
    const user = await seedUserWithWallet({
      email: 'holdem-tier-one@example.com',
      withdrawableBalance: '500.00',
    });
    await verifyUserContacts(user.id, { email: true });
    const headers = await issueUserHeaders(user);

    const response = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Blocked Holdem',
        buyInAmount: '100.00',
        tableType: 'cash',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(API_ERROR_CODES.KYC_TIER_REQUIRED);
  });

  it('creates a two-player casual holdem table without KYC against bonus balance with no rake', async () => {
    const user = await seedUserWithWallet({
      email: 'holdem-casual@example.com',
      withdrawableBalance: '0.00',
      bonusBalance: '250.00',
    });
    await verifyUserContacts(user.id, { email: true });
    const headers = await issueUserHeaders(user);

    const response = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Casual Heads Up',
        buyInAmount: '50.00',
        tableType: 'casual',
        maxSeats: 2,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          name: 'Casual Heads Up',
          tableType: 'casual',
          maxSeats: 2,
          rakePolicy: null,
        },
      },
    });

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        bonusBalance: userWallets.bonusBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet).toMatchObject({
      withdrawableBalance: '0.00',
      bonusBalance: '200.00',
      lockedBalance: '50.00',
    });

    const [entry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        metadata: ledgerEntries.metadata,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.entryType, 'holdem_buy_in'),
        ),
      )
      .orderBy(desc(ledgerEntries.id))
      .limit(1);
    expect(entry).toMatchObject({
      entryType: 'holdem_buy_in',
      metadata: expect.objectContaining({
        balanceType: 'bonus',
        tableType: 'casual',
      }),
    });
  });

  it('allows non-KYC users to join and start a casual holdem table', async () => {
    const userOne = await seedUserWithWallet({
      email: 'holdem-casual-one@example.com',
      withdrawableBalance: '0.00',
      bonusBalance: '250.00',
    });
    const userTwo = await seedUserWithWallet({
      email: 'holdem-casual-two@example.com',
      withdrawableBalance: '0.00',
      bonusBalance: '250.00',
    });
    await verifyUserContacts(userOne.id, { email: true });
    await verifyUserContacts(userTwo.id, { email: true });

    const userOneHeaders = await issueUserHeaders(userOne);
    const userTwoHeaders = await issueUserHeaders(userTwo);

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers: userOneHeaders,
      payload: {
        tableName: 'Casual No KYC Table',
        buyInAmount: '50.00',
        tableType: 'casual',
        maxSeats: 2,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    const joinResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/join`,
      headers: userTwoHeaders,
      payload: {
        buyInAmount: '50.00',
      },
    });

    expect(joinResponse.statusCode).toBe(200);
    expect(joinResponse.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          id: tableId,
          tableType: 'casual',
          maxSeats: 2,
        },
      },
    });

    const startResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/start`,
      headers: userOneHeaders,
    });

    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          id: tableId,
          tableType: 'casual',
          status: 'active',
        },
      },
    });
  });

  it('creates a holdem tournament with pooled prize metadata and withdrawable buy-ins', async () => {
    const { user, headers } = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-create@example.com',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Sunday Sprint',
        buyInAmount: '100.00',
        tableType: 'tournament',
        maxSeats: 3,
        tournament: {
          startingStackAmount: '1500.00',
          payoutPlaces: 2,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          name: 'Sunday Sprint',
          tableType: 'tournament',
          minimumBuyIn: '100.00',
          maximumBuyIn: '100.00',
          rakePolicy: null,
          tournament: {
            status: 'registering',
            buyInAmount: '100.00',
            startingStackAmount: '1500.00',
            prizePoolAmount: '100.00',
            registeredCount: 1,
            standings: [
              expect.objectContaining({
                userId: user.id,
                stackAmount: '1500.00',
                active: true,
              }),
            ],
          },
        },
      },
    });

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet).toMatchObject({
      withdrawableBalance: '400.00',
      lockedBalance: '0.00',
    });

    const [entry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        metadata: ledgerEntries.metadata,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.entryType, 'holdem_tournament_buy_in'),
        ),
      )
      .orderBy(desc(ledgerEntries.id))
      .limit(1);
    expect(entry).toMatchObject({
      entryType: 'holdem_tournament_buy_in',
      metadata: expect.objectContaining({
        balanceType: 'withdrawable',
      }),
    });
  });

  it('refunds a registering holdem tournament seat before the event starts', async () => {
    const { user, headers } = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-refund@example.com',
    });

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Refundable Turbo',
        buyInAmount: '100.00',
        tableType: 'tournament',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    const leaveResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/leave`,
      headers,
    });

    expect(leaveResponse.statusCode).toBe(200);
    expect(leaveResponse.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          tableType: 'tournament',
          tournament: {
            status: 'registering',
            registeredCount: 0,
            prizePoolAmount: '0.00',
          },
        },
      },
    });

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet).toMatchObject({
      withdrawableBalance: '500.00',
      lockedBalance: '0.00',
    });

    const [refundEntry] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.entryType, 'holdem_tournament_refund'),
        ),
      )
      .orderBy(desc(ledgerEntries.id))
      .limit(1);
    expect(refundEntry?.entryType).toBe('holdem_tournament_refund');

    const [session] = await getDb()
      .select({
        status: playModeSessions.status,
        outcome: playModeSessions.outcome,
      })
      .from(playModeSessions)
      .where(eq(playModeSessions.userId, user.id))
      .orderBy(desc(playModeSessions.id))
      .limit(1);
    expect(session).toMatchObject({
      status: 'settled',
      outcome: 'push',
    });
  });

  it('closes tournament registration after the first hand starts and blocks leave or late join requests', async () => {
    const creator = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-creator@example.com',
    });
    const joiner = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-joiner@example.com',
    });
    const observer = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-observer@example.com',
    });

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers: creator.headers,
      payload: {
        tableName: 'Freezeout',
        buyInAmount: '100.00',
        tableType: 'tournament',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    const joinResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/join`,
      headers: joiner.headers,
      payload: {
        buyInAmount: '100.00',
      },
    });
    expect(joinResponse.statusCode).toBe(200);

    const startResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/start`,
      headers: creator.headers,
      payload: {},
    });
    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json().data.table.tournament.status).toBe('running');

    const leaveResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/leave`,
      headers: joiner.headers,
    });
    expect(leaveResponse.statusCode).toBe(409);
    expect(leaveResponse.json().error.message).toBe(
      'You cannot leave a running holdem tournament.',
    );

    const lateJoinResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/join`,
      headers: observer.headers,
      payload: {
        buyInAmount: '100.00',
      },
    });
    expect(lateJoinResponse.statusCode).toBe(409);
    expect(lateJoinResponse.json().error.message).toBe(
      'Registration for this holdem tournament is closed.',
    );
  });

  it('keeps tournament seats enrolled when presence leases expire mid-event', async () => {
    const creator = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-presence-a@example.com',
    });
    const joiner = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-presence-b@example.com',
    });

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers: creator.headers,
      payload: {
        tableName: 'Presence Freezeout',
        buyInAmount: '100.00',
        tableType: 'tournament',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    const joinResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/join`,
      headers: joiner.headers,
      payload: {
        buyInAmount: '100.00',
      },
    });
    expect(joinResponse.statusCode).toBe(200);

    const startResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/start`,
      headers: creator.headers,
      payload: {},
    });
    expect(startResponse.statusCode).toBe(200);

    await getDb()
      .update(holdemTableSeats)
      .set({
        disconnectGraceExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
        seatLeaseExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .where(
        and(
          eq(holdemTableSeats.tableId, tableId),
          eq(holdemTableSeats.userId, creator.user.id),
        ),
      );

    const { runHoldemTimeoutCycle } = await import('../modules/holdem/service');
    const summary = await runHoldemTimeoutCycle();
    expect(summary.scanned).toBeGreaterThanOrEqual(1);
    expect(summary.presenceUpdated).toBeGreaterThan(0);

    const tableResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${tableId}`,
      headers: creator.headers,
    });
    expect(tableResponse.statusCode).toBe(200);
    const heroSeat = expectPresent(
      tableResponse
        .json()
        .data.table.seats.find((seat: { userId: number | null }) => seat.userId === creator.user.id),
    );
    expect(heroSeat).toMatchObject({
      userId: creator.user.id,
      sittingOut: true,
      autoCashOutPending: false,
    });

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, creator.user.id))
      .limit(1);
    expect(wallet).toMatchObject({
      withdrawableBalance: '400.00',
      lockedBalance: '0.00',
    });
  });

  it('completes a heads-up holdem tournament, records standings, and pays the prize pool', async () => {
    const creator = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-winner-a@example.com',
    });
    const joiner = await seedVerifiedHoldemUserSession({
      email: 'holdem-tournament-winner-b@example.com',
    });

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers: creator.headers,
      payload: {
        tableName: 'Heads Up Final',
        buyInAmount: '100.00',
        tableType: 'tournament',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    const joinResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/join`,
      headers: joiner.headers,
      payload: {
        buyInAmount: '100.00',
      },
    });
    expect(joinResponse.statusCode).toBe(200);

    const startResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/start`,
      headers: creator.headers,
      payload: {},
    });
    expect(startResponse.statusCode).toBe(200);
    const startedTable = startResponse.json().data.table as {
      pendingActorSeatIndex: number | null;
      seats: Array<{
        seatIndex: number;
        userId: number | null;
      }>;
    };
    const creatorSeat = expectPresent(
      startedTable.seats.find((seat) => seat.userId === creator.user.id),
    );
    const joinerSeat = expectPresent(
      startedTable.seats.find((seat) => seat.userId === joiner.user.id),
    );

    await rigStartedHoldemCards({
      tableId,
      boardCards: [
        { rank: '2', suit: 'clubs' },
        { rank: '7', suit: 'diamonds' },
        { rank: '9', suit: 'hearts' },
        { rank: 'J', suit: 'spades' },
        { rank: '3', suit: 'clubs' },
      ],
      holeCardsBySeatIndex: {
        [creatorSeat.seatIndex]: [
          { rank: 'A', suit: 'spades' },
          { rank: 'A', suit: 'hearts' },
        ],
        [joinerSeat.seatIndex]: [
          { rank: 'K', suit: 'clubs' },
          { rank: 'K', suit: 'diamonds' },
        ],
      },
    });

    const actingUserId = expectPresent(
      startedTable.seats.find(
        (seat) => seat.seatIndex === startedTable.pendingActorSeatIndex,
      )?.userId,
    );
    const actorHeaders =
      actingUserId === creator.user.id ? creator.headers : joiner.headers;
    const responderHeaders =
      actingUserId === creator.user.id ? joiner.headers : creator.headers;

    const shoveResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/action`,
      headers: actorHeaders,
      payload: {
        action: 'all_in',
      },
    });
    expect(shoveResponse.statusCode).toBe(200);

    const callResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/action`,
      headers: responderHeaders,
      payload: {
        action: 'call',
      },
    });
    expect(callResponse.statusCode).toBe(200);
    expect(callResponse.json()).toMatchObject({
      ok: true,
      data: {
        table: {
          tableType: 'tournament',
          tournament: {
            status: 'completed',
            prizePoolAmount: '200.00',
            registeredCount: 2,
            payouts: [
              expect.objectContaining({
                amount: '200.00',
              }),
            ],
          },
        },
      },
    });

    const finalTable = callResponse.json().data.table as {
      seats: Array<{ userId: number | null }>;
      tournament: {
        payouts: Array<{ userId: number | null; amount: string }>;
        standings: Array<{
          userId: number | null;
          finishingPlace: number | null;
          prizeAmount: string | null;
        }>;
      };
    };
    expect(finalTable.seats.filter((seat) => seat.userId !== null)).toHaveLength(0);
    expect(finalTable.tournament.standings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: creator.user.id,
          finishingPlace: expect.any(Number),
        }),
        expect.objectContaining({
          userId: joiner.user.id,
          finishingPlace: expect.any(Number),
        }),
      ]),
    );

    const payoutWinnerId = finalTable.tournament.payouts[0]?.userId;
    expect([creator.user.id, joiner.user.id]).toContain(payoutWinnerId);

    const creatorWallet = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, creator.user.id))
      .limit(1);
    const joinerWallet = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, joiner.user.id))
      .limit(1);
    expect([
      creatorWallet[0]?.withdrawableBalance,
      joinerWallet[0]?.withdrawableBalance,
    ].sort()).toEqual(['400.00', '600.00']);

    const payoutEntries = await getDb()
      .select({
        userId: ledgerEntries.userId,
        amount: ledgerEntries.amount,
        entryType: ledgerEntries.entryType,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.referenceId, tableId),
          eq(ledgerEntries.entryType, 'holdem_tournament_payout'),
        ),
      )
      .orderBy(asc(ledgerEntries.id));
    expect(payoutEntries).toHaveLength(1);
    expect(payoutEntries[0]).toMatchObject({
      userId: payoutWinnerId,
      amount: '200.00',
      entryType: 'holdem_tournament_payout',
    });
  });

  it('applies holdem dual_bet as a buy-in wrapper without changing the table engine', async () => {
    const user = await seedUserWithWallet({
      email: 'holdem-dual-bet@example.com',
      withdrawableBalance: '500.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const headers = await issueUserHeaders(user);

    const modeResponse = await getApp().inject({
      method: 'POST',
      url: '/play-modes/holdem',
      headers,
      payload: {
        type: 'dual_bet',
      },
    });

    expect(modeResponse.statusCode).toBe(200);
    expect(modeResponse.json()).toMatchObject({
      ok: true,
      data: {
        gameKey: 'holdem',
        snapshot: {
          type: 'dual_bet',
          appliedMultiplier: 2,
          nextMultiplier: 2,
        },
      },
    });

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Dual Bet Holdem',
        buyInAmount: '100.00',
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    expect(wallet).toMatchObject({
      withdrawableBalance: '300.00',
      lockedBalance: '200.00',
    });

    const [session] = await getDb()
      .select({
        status: playModeSessions.status,
        mode: playModeSessions.mode,
        metadata: playModeSessions.metadata,
      })
      .from(playModeSessions)
      .where(eq(playModeSessions.userId, user.id))
      .orderBy(asc(playModeSessions.id))
      .limit(1);
    expect(session).toMatchObject({
      status: 'active',
      mode: 'dual_bet',
      metadata: expect.objectContaining({
        baseBuyInAmount: '100.00',
        effectiveBuyInAmount: '200.00',
      }),
    });
  });

  it('settles holdem deferred_double sessions on cash-out and arms the next multiplier after a loss', async () => {
    const user = await seedUserWithWallet({
      email: 'holdem-deferred-double@example.com',
      withdrawableBalance: '500.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const headers = await issueUserHeaders(user);

    const modeResponse = await getApp().inject({
      method: 'POST',
      url: '/play-modes/holdem',
      headers,
      payload: {
        type: 'deferred_double',
      },
    });
    expect(modeResponse.statusCode).toBe(200);

    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/holdem/tables',
      headers,
      payload: {
        tableName: 'Deferred Double Holdem',
        buyInAmount: '100.00',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const tableId = createResponse.json().data.table.id as number;

    await getDb()
      .update(holdemTableSeats)
      .set({
        stackAmount: '40.00',
      })
      .where(
        and(
          eq(holdemTableSeats.tableId, tableId),
          eq(holdemTableSeats.userId, user.id),
        ),
      );
    await getDb()
      .update(userWallets)
      .set({
        lockedBalance: '40.00',
      })
      .where(eq(userWallets.userId, user.id));

    const leaveResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${tableId}/leave`,
      headers,
    });

    expect(leaveResponse.statusCode).toBe(200);

    const [session] = await getDb()
      .select({
        status: playModeSessions.status,
        outcome: playModeSessions.outcome,
        snapshot: playModeSessions.snapshot,
      })
      .from(playModeSessions)
      .where(eq(playModeSessions.userId, user.id))
      .orderBy(asc(playModeSessions.id))
      .limit(1);
    expect(session).toMatchObject({
      status: 'settled',
      outcome: 'lose',
      snapshot: expect.objectContaining({
        type: 'deferred_double',
        nextMultiplier: 2,
        lastOutcome: 'lose',
        carryActive: true,
      }),
    });

    const [storedMode] = await getDb()
      .select({
        mode: userPlayModes.mode,
        state: userPlayModes.state,
      })
      .from(userPlayModes)
      .where(eq(userPlayModes.userId, user.id))
      .limit(1);
    expect(storedMode).toMatchObject({
      mode: 'deferred_double',
      state: expect.objectContaining({
        nextMultiplier: 2,
        lastOutcome: 'lose',
      }),
    });
  });

  it('only the current turn seat can act and only that seat gets a deadline', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }

    expect(setup.table.pendingActorDeadlineAt).toBeTruthy();
    expect(setup.table.pendingActorTimeBankStartsAt).toBeTruthy();

    const seatsWithDeadlines = setup.table.seats.filter(
      (seat) => seat.turnDeadlineAt !== null,
    );
    expect(seatsWithDeadlines).toHaveLength(1);
    expect(seatsWithDeadlines[0]?.seatIndex).toBe(pendingActorSeatIndex);

    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );
    expect(actorSeat.timeBankRemainingMs).toBe(30000);
    const nonActorHeaders =
      actorSeat.userId === setup.userOne.id
        ? setup.userTwoHeaders
        : setup.userOneHeaders;

    const actionResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: nonActorHeaders,
      payload: {
        action: 'fold',
      },
    });

    expect(actionResponse.statusCode).toBe(409);
    expect(actionResponse.json().error.message).toBe('It is not your turn to act.');
  });

  it('expires a late player action on the server and applies the timeout default action', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }
    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );

    await setHoldemTurnWindow({
      tableId: setup.tableId,
      seatIndex: pendingActorSeatIndex,
      turnDeadlineAt: new Date('2026-01-01T00:00:00.000Z'),
      turnTimeBankStartsAt: new Date('2025-12-31T23:59:30.000Z'),
    });

    const actorHeaders = resolveHeadersForUserId(
      expectPresent(actorSeat.userId),
      setup,
    );
    const actionResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: actorHeaders,
      payload: {
        action: 'call',
      },
    });

    expect(actionResponse.statusCode).toBe(409);
    expect(actionResponse.json().error.code).toBe(
      API_ERROR_CODES.HOLDEM_TURN_EXPIRED,
    );

    const tableResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}`,
      headers: actorHeaders,
    });

    expect(tableResponse.statusCode).toBe(200);
    const table = tableResponse.json().data.table;
    const settledActorSeat = expectPresent(
      table.seats.find(
        (seat: { seatIndex: number }) => seat.seatIndex === pendingActorSeatIndex,
      ),
    );

    expect(table.status).toBe('waiting');
    expect(table.pendingActorSeatIndex).toBeNull();
    expect(table.pendingActorDeadlineAt).toBeNull();
    expect(table.pendingActorTimeoutAction).toBeNull();
    expect(table.recentHands).toHaveLength(1);
    expect(settledActorSeat.lastAction).toBe('Fold');
    expect(settledActorSeat.turnDeadlineAt).toBeNull();
    expect(settledActorSeat.timeBankRemainingMs).toBe(0);
  });

  it('processes overdue seats through the holdem timeout cycle worker', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }

    await setHoldemTurnWindow({
      tableId: setup.tableId,
      seatIndex: pendingActorSeatIndex,
      turnDeadlineAt: new Date('2026-01-01T00:00:00.000Z'),
      turnTimeBankStartsAt: new Date('2025-12-31T23:59:30.000Z'),
    });

    const { runHoldemTimeoutCycle } = await import('../modules/holdem/service');
    const summary = await runHoldemTimeoutCycle();

    expect(summary).toEqual({
      scanned: 1,
      timedOut: 1,
      presenceUpdated: 0,
    });

    const tableResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}`,
      headers: setup.userOneHeaders,
    });

    expect(tableResponse.statusCode).toBe(200);
    const table = tableResponse.json().data.table;
    expect(table.status).toBe('waiting');
    expect(table.pendingActorSeatIndex).toBeNull();
    expect(table.recentHands).toHaveLength(1);
  });

  it('preserves the active turn clock during presence heartbeats', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }
    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );
    const actorHeaders = resolveHeadersForUserId(
      expectPresent(actorSeat.userId),
      setup,
    );

    expect(setup.table.pendingActorDeadlineAt).toBeTruthy();
    expect(setup.table.pendingActorTimeBankStartsAt).toBeTruthy();

    const presenceResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/presence`,
      headers: actorHeaders,
      payload: {},
    });
    expect(presenceResponse.statusCode).toBe(200);

    const tableResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}`,
      headers: actorHeaders,
    });
    expect(tableResponse.statusCode).toBe(200);

    const table = tableResponse.json().data.table;
    const refreshedActorSeat = expectPresent(
      table.seats.find(
        (seat: { seatIndex: number }) => seat.seatIndex === pendingActorSeatIndex,
      ),
    );
    expect(table.pendingActorDeadlineAt).toBe(setup.table.pendingActorDeadlineAt);
    expect(table.pendingActorTimeBankStartsAt).toBe(
      setup.table.pendingActorTimeBankStartsAt,
    );
    expect(refreshedActorSeat.timeBankRemainingMs).toBe(
      actorSeat.timeBankRemainingMs,
    );
  });

  it('consumes time bank when a player acts after the base turn window', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }
    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );
    const actorHeaders = resolveHeadersForUserId(
      expectPresent(actorSeat.userId),
      setup,
    );

    const now = Date.now();
    await setHoldemTurnWindow({
      tableId: setup.tableId,
      seatIndex: pendingActorSeatIndex,
      turnDeadlineAt: new Date(now + 25_000),
      turnTimeBankStartsAt: new Date(now - 5_000),
    });

    const actionResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: actorHeaders,
      payload: {
        action: 'call',
      },
    });
    expect(actionResponse.statusCode).toBe(200);

    const table = actionResponse.json().data.table;
    const actedSeat = expectPresent(
      table.seats.find(
        (seat: { seatIndex: number }) => seat.seatIndex === pendingActorSeatIndex,
      ),
    );
    expect(actedSeat.timeBankRemainingMs).toBeLessThan(30000);
    expect(actedSeat.timeBankRemainingMs).toBeGreaterThanOrEqual(24000);
  });

  it('records capped rake in both user and house ledgers after an all-in showdown', async () => {
    const setup = await setupHoldemHand();
    expect(setup.table.pendingActorSeatIndex).not.toBeNull();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected pending actor seat index');
    }
    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );
    const actorHeaders = resolveHeadersForUserId(
      expectPresent(actorSeat.userId),
      setup,
    );
    const responderHeaders =
      expectPresent(actorSeat.userId) === setup.userOne.id
        ? setup.userTwoHeaders
        : setup.userOneHeaders;

    const shoveResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: actorHeaders,
      payload: {
        action: 'all_in',
      },
    });
    expect(shoveResponse.statusCode).toBe(200);

    const callResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: responderHeaders,
      payload: {
        action: 'call',
      },
    });
    expect(callResponse.statusCode).toBe(200);

    const rakeEntries = await getDb()
      .select({
        userId: ledgerEntries.userId,
        houseAccountId: ledgerEntries.houseAccountId,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.entryType, 'holdem_rake'),
          eq(ledgerEntries.referenceType, 'holdem_table'),
          eq(ledgerEntries.referenceId, setup.tableId),
        ),
      )
      .orderBy(asc(ledgerEntries.id));

    const userRakeTotal = rakeEntries
      .filter((entry) => entry.userId !== null)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const houseRakeTotal = rakeEntries
      .filter((entry) => entry.houseAccountId !== null)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);

    expect(userRakeTotal).toBe(-8);
    expect(houseRakeTotal).toBe(8);
  });

  it('marks disconnected seats sitting out after grace expiry and restores them on heartbeat', async () => {
    const setup = await setupHoldemHand();
    const [heroSeat] = await getDb()
      .select({
        seatIndex: holdemTableSeats.seatIndex,
      })
      .from(holdemTableSeats)
      .where(
        and(
          eq(holdemTableSeats.tableId, setup.tableId),
          eq(holdemTableSeats.userId, setup.userOne.id),
        ),
      )
      .limit(1);
    expect(heroSeat?.seatIndex).toBeDefined();

    await getDb()
      .update(holdemTableSeats)
      .set({
        disconnectGraceExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
        seatLeaseExpiresAt: new Date('2026-12-31T00:00:00.000Z'),
      })
      .where(
        and(
          eq(holdemTableSeats.tableId, setup.tableId),
          eq(holdemTableSeats.userId, setup.userOne.id),
        ),
      );

    const { runHoldemTimeoutCycle } = await import('../modules/holdem/service');
    const summary = await runHoldemTimeoutCycle();
    expect(summary.scanned).toBeGreaterThanOrEqual(1);
    expect(summary.presenceUpdated).toBeGreaterThan(0);

    const disconnectedTableResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}`,
      headers: setup.userOneHeaders,
    });
    expect(disconnectedTableResponse.statusCode).toBe(200);
    const disconnectedHeroSeat = expectPresent(
      disconnectedTableResponse
        .json()
        .data.table.seats.find((seat: { userId: number | null }) => seat.userId === setup.userOne.id),
    );
    expect(disconnectedHeroSeat.sittingOut).toBe(true);
    expect(disconnectedHeroSeat.connectionState).toBe('disconnected');

    const presenceResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/presence`,
      headers: setup.userOneHeaders,
      payload: {},
    });
    expect(presenceResponse.statusCode).toBe(200);
    expect(presenceResponse.json().data).toMatchObject({
      tableId: setup.tableId,
      sittingOut: false,
      connectionState: 'connected',
      autoCashOutPending: false,
    });
  });

  it('lets a seated user explicitly sit out and sit back in', async () => {
    const setup = await setupSingleSeatHoldemTable();

    const sitOutResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/seat-mode`,
      headers: setup.headers,
      payload: {
        sittingOut: true,
      },
    });
    expect(sitOutResponse.statusCode).toBe(200);
    expect(sitOutResponse.json().data.table.seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: setup.user.id,
          sittingOut: true,
        }),
      ]),
    );

    const heartbeatWhileSittingOutResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/presence`,
      headers: setup.headers,
      payload: {},
    });
    expect(heartbeatWhileSittingOutResponse.statusCode).toBe(200);
    expect(heartbeatWhileSittingOutResponse.json().data).toMatchObject({
      tableId: setup.tableId,
      sittingOut: true,
    });

    const sitInResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/seat-mode`,
      headers: setup.headers,
      payload: {
        sittingOut: false,
      },
    });
    expect(sitInResponse.statusCode).toBe(200);
    expect(sitInResponse.json().data.table.seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: setup.user.id,
          sittingOut: false,
        }),
      ]),
    );
  });

  it('persists holdem table chat and emoji messages in table order', async () => {
    const setup = await setupHoldemHand();

    const emptyMessagesResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}/messages`,
      headers: setup.userOneHeaders,
    });
    expect(emptyMessagesResponse.statusCode).toBe(200);
    expect(emptyMessagesResponse.json().data).toEqual({
      tableId: setup.tableId,
      messages: [],
    });

    const chatResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/messages`,
      headers: setup.userOneHeaders,
      payload: {
        kind: 'chat',
        text: 'nh',
      },
    });
    expect(chatResponse.statusCode).toBe(201);
    expect(chatResponse.json().data).toMatchObject({
      tableId: setup.tableId,
      userId: setup.userOne.id,
      kind: 'chat',
      text: 'nh',
      emoji: null,
    });

    const emojiResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/messages`,
      headers: setup.userTwoHeaders,
      payload: {
        kind: 'emoji',
        emoji: '🔥',
      },
    });
    expect(emojiResponse.statusCode).toBe(201);
    expect(emojiResponse.json().data).toMatchObject({
      tableId: setup.tableId,
      userId: setup.userTwo.id,
      kind: 'emoji',
      text: null,
      emoji: '🔥',
    });

    const messageRows = await getDb()
      .select({
        userId: holdemTableMessages.userId,
        seatIndex: holdemTableMessages.seatIndex,
        kind: holdemTableMessages.kind,
        text: holdemTableMessages.text,
        emoji: holdemTableMessages.emoji,
      })
      .from(holdemTableMessages)
      .where(eq(holdemTableMessages.tableId, setup.tableId))
      .orderBy(asc(holdemTableMessages.id));

    expect(messageRows).toEqual([
      {
        userId: setup.userOne.id,
        seatIndex: 0,
        kind: 'chat',
        text: 'nh',
        emoji: null,
      },
      {
        userId: setup.userTwo.id,
        seatIndex: 1,
        kind: 'emoji',
        text: null,
        emoji: '🔥',
      },
    ]);

    const listResponse = await getApp().inject({
      method: 'GET',
      url: `/holdem/tables/${setup.tableId}/messages`,
      headers: setup.userOneHeaders,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.messages).toEqual([
      expect.objectContaining({
        userId: setup.userOne.id,
        kind: 'chat',
        text: 'nh',
      }),
      expect.objectContaining({
        userId: setup.userTwo.id,
        kind: 'emoji',
        emoji: '🔥',
      }),
    ]);
  });

  it('rejects holdem table chat from users who are not seated', async () => {
    const setup = await setupHoldemHand();
    const outsider = await seedUserWithWallet({
      email: 'holdem-chat-outsider@example.com',
      withdrawableBalance: '100.00',
    });
    await verifyUserContacts(outsider.id, { email: true, phone: true });
    const outsiderHeaders = await issueUserHeaders(outsider);

    const response = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/messages`,
      headers: outsiderHeaders,
      payload: {
        kind: 'chat',
        text: 'railbird',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toBe(
      'You must be seated to send table chat.',
    );
  });

  it('auto cashes out seats whose lease has expired', async () => {
    const setup = await setupSingleSeatHoldemTable();

    await getDb()
      .update(holdemTableSeats)
      .set({
        disconnectGraceExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
        seatLeaseExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .where(
        and(
          eq(holdemTableSeats.tableId, setup.tableId),
          eq(holdemTableSeats.userId, setup.user.id),
        ),
      );

    const { runHoldemTimeoutCycle } = await import('../modules/holdem/service');
    const summary = await runHoldemTimeoutCycle();
    expect(summary.scanned).toBeGreaterThanOrEqual(1);
    expect(summary.presenceUpdated).toBeGreaterThan(0);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, setup.user.id))
      .limit(1);

    expect(wallet).toMatchObject({
      withdrawableBalance: '500.00',
      lockedBalance: '0.00',
    });

    const tablesResponse = await getApp().inject({
      method: 'GET',
      url: '/holdem/tables',
      headers: setup.headers,
    });
    expect(tablesResponse.statusCode).toBe(200);
    expect(tablesResponse.json().data.currentTableId).toBeNull();
  });

  it('persists holdem hand history, round events, and table events for settled hands', async () => {
    const setup = await setupHoldemHand();
    const pendingActorSeatIndex = setup.table.pendingActorSeatIndex;
    expect(pendingActorSeatIndex).not.toBeNull();
    if (pendingActorSeatIndex === null) {
      throw new Error('Expected a pending actor seat.');
    }

    const actorSeat = expectPresent(
      setup.table.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
    );
    const actorHeaders = resolveHeadersForUserId(
      expectPresent(actorSeat.userId),
      setup,
    );

    const actionResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/action`,
      headers: actorHeaders,
      payload: {
        action: 'fold',
      },
    });

    expect(actionResponse.statusCode).toBe(200);
    const actionPayload = actionResponse.json();
    const table = actionPayload.data.table as {
      status: string;
      recentHands: Array<{
        handNumber: number;
        roundId: string | null;
        winnerSeatIndexes: number[];
      }>;
    };
    expect(table.status).toBe('waiting');
    expect(table.recentHands).toHaveLength(1);

    const recentHand = expectPresent(table.recentHands[0]);
    expect(recentHand.roundId).toMatch(/^holdem:\d+$/);

    const handHistoryId = Number(recentHand.roundId?.split(':')[1] ?? 0);
    expect(handHistoryId).toBeGreaterThan(0);

    const [storedHandHistory] = await getDb()
      .select({
        id: handHistories.id,
        tableId: handHistories.tableId,
        referenceId: handHistories.referenceId,
        handNumber: handHistories.handNumber,
        status: handHistories.status,
      })
      .from(handHistories)
      .where(eq(handHistories.id, handHistoryId))
      .limit(1);

    expect(storedHandHistory).toEqual({
      id: handHistoryId,
      tableId: setup.tableId,
      referenceId: setup.tableId,
      handNumber: recentHand.handNumber,
      status: 'settled',
    });

    const storedRoundEvents = await getDb()
      .select({
        eventType: roundEvents.eventType,
      })
      .from(roundEvents)
      .where(
        and(
          eq(roundEvents.roundType, 'holdem'),
          eq(roundEvents.roundEntityId, handHistoryId),
        ),
      )
      .orderBy(asc(roundEvents.eventIndex));

    expect(storedRoundEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'hand_started',
        'hole_cards_dealt',
        'player_acted',
        'fairness_revealed',
        'hand_settled',
      ]),
    );

    const storedTableEvents = await getDb()
      .select({
        eventType: tableEvents.eventType,
      })
      .from(tableEvents)
      .where(
        and(
          eq(tableEvents.tableType, 'holdem'),
          eq(tableEvents.tableId, setup.tableId),
        ),
      )
      .orderBy(asc(tableEvents.eventIndex));

    expect(storedTableEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'table_created',
        'seat_joined',
        'hand_started',
        'fairness_revealed',
        'hand_settled',
      ]),
    );

    const historyResponse = await getApp().inject({
      method: 'GET',
      url: `/hand-history/${encodeURIComponent(expectPresent(recentHand.roundId))}`,
      headers: setup.userOneHeaders,
    });

    expect(historyResponse.statusCode).toBe(200);
    const historyPayload = historyResponse.json();
    expect(historyPayload.ok).toBe(true);
    expect(historyPayload.data).toMatchObject({
      roundId: recentHand.roundId,
      roundType: 'holdem',
      referenceId: setup.tableId,
      status: 'settled',
    });
    expect(historyPayload.data.fairness).toMatchObject({
      sourceCommitHash: expect.any(String),
      revealSeed: expect.any(String),
      revealedAt: expect.any(String),
    });
    expect(
      createHash('sha256')
        .update(String(historyPayload.data.fairness?.revealSeed), 'utf8')
        .digest('hex'),
    ).toBe(historyPayload.data.fairness?.commitHash);
    expect(historyPayload.data.summary).toMatchObject({
      tableId: setup.tableId,
      handNumber: recentHand.handNumber,
    });
    expect(
      historyPayload.data.tableEvents.map((event: { type: string }) => event.type),
    ).toEqual(
      expect.arrayContaining([
        'hand_started',
        'fairness_revealed',
        'hand_settled',
      ]),
    );
    expect(
      historyPayload.data.events.map((event: { type: string }) => event.type),
    ).toEqual(
      expect.arrayContaining([
        'hand_started',
        'hole_cards_dealt',
        'player_acted',
        'fairness_revealed',
        'hand_settled',
      ]),
    );

    const evidenceBundleResponse = await getApp().inject({
      method: 'GET',
      url: `/hand-history/${encodeURIComponent(expectPresent(recentHand.roundId))}/evidence-bundle`,
      headers: setup.userOneHeaders,
    });

    expect(evidenceBundleResponse.statusCode).toBe(200);
    const evidenceBundlePayload = evidenceBundleResponse.json();
    expect(evidenceBundlePayload.ok).toBe(true);
    expect(evidenceBundlePayload.data).toMatchObject({
      schemaVersion: 'holdem_signed_evidence_bundle_v1',
      roundId: recentHand.roundId,
      referenceId: setup.tableId,
      summaryPage: {
        title: "Hold'em Evidence Summary",
      },
      disputePayload: {
        roundId: recentHand.roundId,
        tableEventCount: expect.any(Number),
      },
      evidence: {
        history: {
          roundId: recentHand.roundId,
        },
      },
    });
    expect(
      evidenceBundlePayload.data.evidence.history.tableEvents.map(
        (event: { type: string }) => event.type,
      ),
    ).toEqual(
      expect.arrayContaining([
        'hand_started',
        'fairness_revealed',
        'hand_settled',
      ]),
    );
    expect(verifyHoldemSignedEvidenceBundle(evidenceBundlePayload.data)).toBe(true);

    const outsider = await seedUserWithWallet({
      email: 'holdem-history-outsider@example.com',
      withdrawableBalance: '50.00',
    });
    await verifyUserContacts(outsider.id, { email: true, phone: true });
    const outsiderHeaders = await issueUserHeaders(outsider);
    const outsiderResponse = await getApp().inject({
      method: 'GET',
      url: `/hand-history/${encodeURIComponent(expectPresent(recentHand.roundId))}/evidence-bundle`,
      headers: outsiderHeaders,
    });
    expect(outsiderResponse.statusCode).toBe(404);
  });

  it('records holdem collusion signals for repeated shared-device tables', async () => {
    await setBooleanSystemConfig(ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY, false);
    const setup = await setupHoldemHand({
      userOneSession: {
        ip: '203.0.113.88',
        userAgent: 'HoldemRiskDevice/1.0',
      },
      userTwoSession: {
        ip: '203.0.113.88',
        userAgent: 'HoldemRiskDevice/1.0',
      },
    });

    let currentTable = setup.table;
    for (let handIndex = 0; handIndex < 4; handIndex += 1) {
      const pendingActorSeatIndex = currentTable.pendingActorSeatIndex;
      expect(pendingActorSeatIndex).not.toBeNull();
      if (pendingActorSeatIndex === null) {
        throw new Error('Expected a pending actor seat.');
      }
      const actingSeat = expectPresent(
        currentTable.seats.find((seat) => seat.seatIndex === pendingActorSeatIndex),
      );
      const actingHeaders = resolveHeadersForUserId(
        expectPresent(actingSeat.userId),
        setup,
      );
      const foldedHand = await getApp().inject({
        method: 'POST',
        url: `/holdem/tables/${setup.tableId}/action`,
        headers: actingHeaders,
        payload: {
          action: 'fold',
        },
      });
      expect(foldedHand.statusCode).toBe(200);

      const restart = await getApp().inject({
        method: 'POST',
        url: `/holdem/tables/${setup.tableId}/start`,
        headers: setup.userOneHeaders,
        payload: {},
      });
      expect(restart.statusCode).toBe(200);
      currentTable = restart.json().data.table as typeof setup.table;
    }

    const pairRows = await getDb()
      .select({
        tableId: riskTableInteractionPairs.tableId,
        interactionCount: riskTableInteractionPairs.interactionCount,
        sharedIpCount: riskTableInteractionPairs.sharedIpCount,
        sharedDeviceCount: riskTableInteractionPairs.sharedDeviceCount,
        suspicionScore: riskTableInteractionPairs.suspicionScore,
      })
      .from(riskTableInteractionPairs)
      .where(eq(riskTableInteractionPairs.tableId, `holdem:${setup.tableId}`));

    expect(pairRows).toEqual([
      {
        tableId: `holdem:${setup.tableId}`,
        interactionCount: 5,
        sharedIpCount: 5,
        sharedDeviceCount: 5,
        suspicionScore: 16,
      },
    ]);

    const eventRows = await getDb()
      .select({
        pairCount: riskTableInteractionEvents.pairCount,
        metadata: riskTableInteractionEvents.metadata,
      })
      .from(riskTableInteractionEvents)
      .where(eq(riskTableInteractionEvents.tableId, `holdem:${setup.tableId}`))
      .orderBy(asc(riskTableInteractionEvents.id));

    expect(eventRows).toHaveLength(5);
    expect(eventRows.at(-1)?.metadata).toMatchObject({
      pairSignals: [
        expect.objectContaining({
          sharedIp: true,
          sharedDevice: true,
          repeatedTable: true,
        }),
      ],
    });

    const suspiciousRows = await getDb()
      .select({
        userId: suspiciousAccounts.userId,
        reason: suspiciousAccounts.reason,
        metadata: suspiciousAccounts.metadata,
      })
      .from(suspiciousAccounts)
      .orderBy(asc(suspiciousAccounts.userId));

    expect(suspiciousRows).toHaveLength(2);
    expect(suspiciousRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: setup.userOne.id,
          reason: 'holdem_collusion_signal',
          metadata: expect.objectContaining({
            score: 16,
            gameType: 'holdem',
            tableId: setup.tableId,
            riskTableId: `holdem:${setup.tableId}`,
          }),
        }),
        expect.objectContaining({
          userId: setup.userTwo.id,
          reason: 'holdem_collusion_signal',
          metadata: expect.objectContaining({
            score: 16,
            gameType: 'holdem',
            tableId: setup.tableId,
            riskTableId: `holdem:${setup.tableId}`,
          }),
        }),
      ]),
    );
  });

  it('can gameplay-freeze suspicious holdem seats from collusion signals', async () => {
    await setBooleanSystemConfig(ANTI_ABUSE_AUTO_FREEZE_ENABLED_KEY, true);
    await setNumericSystemConfig(ANTI_ABUSE_SUSPICIOUS_THRESHOLD_KEY, 3);
    const setup = await setupHoldemHand({
      userOneSession: {
        ip: '198.51.100.55',
        userAgent: 'HoldemFreezeDevice/1.0',
      },
      userTwoSession: {
        ip: '198.51.100.55',
        userAgent: 'HoldemFreezeDevice/1.0',
      },
    });

    const freezeRows = await getDb()
      .select({
        userId: freezeRecords.userId,
        scope: freezeRecords.scope,
        reason: freezeRecords.reason,
        status: freezeRecords.status,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.status, 'active'))
      .orderBy(asc(freezeRecords.userId));

    expect(freezeRows).toEqual([
      {
        userId: setup.userOne.id,
        scope: 'gameplay_lock',
        reason: 'gameplay_lock',
        status: 'active',
      },
      {
        userId: setup.userTwo.id,
        scope: 'gameplay_lock',
        reason: 'gameplay_lock',
        status: 'active',
      },
    ]);

    const blockedResponse = await getApp().inject({
      method: 'POST',
      url: `/holdem/tables/${setup.tableId}/start`,
      headers: setup.userOneHeaders,
      payload: {},
    });

    expect(blockedResponse.statusCode).toBe(423);
    expect(blockedResponse.json().error.code).toBe('GAMEPLAY_LOCKED');
  });
});
