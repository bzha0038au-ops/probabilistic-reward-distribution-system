import { createHash } from 'node:crypto';

import {
  freezeRecords,
  handHistories,
  holdemTableMessages,
  ledgerEntries,
  holdemTableSeats,
  holdemTables,
  riskTableInteractionEvents,
  riskTableInteractionPairs,
  roundEvents,
  suspiciousAccounts,
  systemConfig,
  tableEvents,
  userWallets,
} from '@reward/database';
import { and, asc, eq } from '@reward/database/orm';
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

describeIntegrationSuite('backend holdem integration', () => {
  it('requires tier 2 KYC before a user can create a holdem table', async () => {
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
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(API_ERROR_CODES.KYC_TIER_REQUIRED);
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
