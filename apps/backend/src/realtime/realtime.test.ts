import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';

import type {
  RealtimeEventMessage,
  RealtimeHelloMessage,
  RealtimeServerMessage,
} from '@reward/shared-types/realtime';
import {
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
  buildHoldemRealtimeTableTopic,
} from '@reward/shared-types/holdem';
import {
  ACTIVE_REALTIME_TEST_USER as ACTIVE_USER,
  resetRealtimeTestEnvMocks,
  realtimeTestEnvMocks as mocks,
} from './test-support';
import { RequestContextPlugin } from '../shared/request-context';
import {
  publishHoldemRealtimeTableMessage,
  publishHoldemRealtimeUpdate,
} from '../modules/holdem/realtime';
import {
  publishRealtimeToSession,
  publishRealtimeToTopic,
  publishRealtimeToUser,
  registerRealtime,
} from './index';

type TestAppBundle = {
  app: import('fastify').FastifyInstance;
  wsUrl: string;
  publishRealtimeToSession: typeof import('./index').publishRealtimeToSession;
  publishRealtimeToTopic: typeof import('./index').publishRealtimeToTopic;
  publishRealtimeToUser: typeof import('./index').publishRealtimeToUser;
};

type SocketHarness = {
  socket: WebSocket;
  waitForOpen(): Promise<void>;
  nextMessage<T extends RealtimeServerMessage>(): Promise<T>;
  waitForClose(): Promise<{ code: number; reason: string }>;
  close(code?: number, reason?: string): Promise<{ code: number; reason: string }>;
};

const createSocketHarness = (url: string): SocketHarness => {
  const socket = new WebSocket(url);
  const bufferedMessages: RealtimeServerMessage[] = [];
  const messageWaiters: Array<(message: RealtimeServerMessage) => void> = [];
  const closeWaiters: Array<(payload: { code: number; reason: string }) => void> = [];
  let closeEvent: { code: number; reason: string } | null = null;

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as RealtimeServerMessage;
    const waiter = messageWaiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }

    bufferedMessages.push(message);
  });

  socket.on('close', (code, reason) => {
    closeEvent = { code, reason: reason.toString('utf8') };
    while (closeWaiters.length > 0) {
      closeWaiters.shift()?.(closeEvent);
    }
  });

  return {
    socket,
    waitForOpen: async () => {
      if (socket.readyState === WebSocket.OPEN) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
      });
    },
    nextMessage: async <T extends RealtimeServerMessage>() => {
      if (bufferedMessages.length > 0) {
        return bufferedMessages.shift() as T;
      }

      return new Promise<T>((resolve, reject) => {
        messageWaiters.push((message) => resolve(message as T));
        socket.once('error', reject);
      });
    },
    waitForClose: async () => {
      if (closeEvent) {
        return closeEvent;
      }

      return new Promise<{ code: number; reason: string }>((resolve) => {
        closeWaiters.push(resolve);
      });
    },
    close: async (code = 1000, reason = 'done') => {
      const closePromise = closeEvent
        ? Promise.resolve(closeEvent)
        : new Promise<{ code: number; reason: string }>((resolve) => {
            closeWaiters.push(resolve);
          });
      socket.close(code, reason);
      return closePromise;
    },
  };
};

const createRealtimeTestApp = async (
  options: import('./service').RealtimeTransportOptions = {}
): Promise<TestAppBundle> => {
  const app = fastify({ logger: false });
  await app.register(cookie);
  await app.register(RequestContextPlugin);
  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
    },
  });
  await registerRealtime(app as never, options);
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Realtime test server did not bind an address.');
  }

  return {
    app,
    wsUrl: `ws://127.0.0.1:${address.port}/realtime`,
    publishRealtimeToSession,
    publishRealtimeToTopic,
    publishRealtimeToUser,
  };
};

const waitForTimers = (ms = 10) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe('realtime transport', () => {
  let activeApp: import('fastify').FastifyInstance | null = null;

  beforeEach(() => {
    resetRealtimeTestEnvMocks();
  });

  afterEach(async () => {
    if (activeApp) {
      await activeApp.close();
      activeApp = null;
    }
  });

  it('rejects websocket upgrades without a valid user session', async () => {
    const { app } = await createRealtimeTestApp();
    activeApp = app;

    const response = await app.inject({
      method: 'GET',
      url: '/realtime?token=bad-token',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('delivers hello frames, targeted session broadcasts, and public topic broadcasts', async () => {
    const { app, wsUrl, publishRealtimeToSession, publishRealtimeToTopic, publishRealtimeToUser } =
      await createRealtimeTestApp();
    activeApp = app;

    const socket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await socket.waitForOpen();

    const hello = await socket.nextMessage<RealtimeHelloMessage>();
    expect(hello.type).toBe('transport.hello');
    expect(hello.userId).toBe(ACTIVE_USER.userId);
    expect(hello.sessionId).toBe(ACTIVE_USER.sessionId);

    expect(
      publishRealtimeToUser({
        userId: ACTIVE_USER.userId,
        event: 'wallet.updated',
        data: { balance: '25.00' },
      })
    ).toBe(1);
    const userEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(userEvent.topic).toBe(`user:${ACTIVE_USER.userId}`);
    expect(userEvent.event).toBe('wallet.updated');

    expect(
      publishRealtimeToSession({
        sessionId: ACTIVE_USER.sessionId,
        event: 'session.notice',
        data: { state: 'fresh' },
      })
    ).toBe(1);
    const sessionEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(sessionEvent.topic).toBe(`session:${ACTIVE_USER.sessionId}`);
    expect(sessionEvent.event).toBe('session.notice');

    socket.socket.send(
      JSON.stringify({
        type: 'transport.subscribe',
        topics: ['public:lobby'],
      })
    );
    const subscribed = await socket.nextMessage<RealtimeServerMessage>();
    expect(subscribed).toMatchObject({
      type: 'transport.subscribed',
      topics: ['public:lobby'],
    });

    expect(
      publishRealtimeToTopic({
        topic: 'public:lobby',
        event: 'turn.started',
        data: { turnId: 'turn-1' },
      })
    ).toBe(1);
    const topicEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(topicEvent.topic).toBe('public:lobby');
    expect(topicEvent.event).toBe('turn.started');

    await socket.close();
  });

  it('replays missed user and topic events through the reconnect window', async () => {
    const { app, wsUrl, publishRealtimeToTopic, publishRealtimeToUser } =
      await createRealtimeTestApp();
    activeApp = app;

    const firstSocket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await firstSocket.waitForOpen();
    const firstHello = await firstSocket.nextMessage<RealtimeHelloMessage>();

    firstSocket.socket.send(
      JSON.stringify({
        type: 'transport.subscribe',
        topics: ['public:table-7'],
      })
    );
    await firstSocket.nextMessage();
    await firstSocket.close();
    await waitForTimers();

    expect(
      publishRealtimeToUser({
        userId: ACTIVE_USER.userId,
        event: 'wallet.updated',
        data: { balance: '27.00' },
      })
    ).toBe(0);
    expect(
      publishRealtimeToTopic({
        topic: 'public:table-7',
        event: 'turn.resumed',
        data: { turnId: 'turn-2' },
      })
    ).toBe(0);

    const secondSocket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await secondSocket.waitForOpen();
    await secondSocket.nextMessage<RealtimeHelloMessage>();

    secondSocket.socket.send(
      JSON.stringify({
        type: 'transport.resume',
        resumeToken: firstHello.resumeToken,
      })
    );
    const resumed = await secondSocket.nextMessage<RealtimeServerMessage>();
    expect(resumed).toMatchObject({
      type: 'transport.resumed',
      previousConnectionId: firstHello.connectionId,
      subscriptions: ['public:table-7'],
    });

    const replayedUserEvent = await secondSocket.nextMessage<RealtimeEventMessage>();
    expect(replayedUserEvent.topic).toBe(`user:${ACTIVE_USER.userId}`);
    expect(replayedUserEvent.event).toBe('wallet.updated');

    const replayedTopicEvent = await secondSocket.nextMessage<RealtimeEventMessage>();
    expect(replayedTopicEvent.event).toBe('turn.resumed');
    expect(replayedTopicEvent.topic).toBe('public:table-7');

    expect(
      publishRealtimeToTopic({
        topic: 'public:table-7',
        event: 'turn.live',
        data: { turnId: 'turn-3' },
      })
    ).toBe(1);
    const resumedEvent = await secondSocket.nextMessage<RealtimeEventMessage>();
    expect(resumedEvent.event).toBe('turn.live');
    expect(resumedEvent.topic).toBe('public:table-7');

    await secondSocket.close();
  });

  it('stores oversized realtime bus payloads in redis before notifying postgres', async () => {
    const redisEntries = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => redisEntries.get(key) ?? null),
      set: vi.fn(
        async (
          key: string,
          value: string,
          mode: string,
          ttlSeconds: number
        ) => {
          expect(mode).toBe('EX');
          expect(ttlSeconds).toBeGreaterThan(0);
          redisEntries.set(key, value);
          return 'OK';
        }
      ),
    };
    mocks.getRedis.mockReturnValue(redis);

    const { app, publishRealtimeToTopic } = await createRealtimeTestApp();
    activeApp = app;

    expect(
      publishRealtimeToTopic({
        topic: 'public:oversized',
        event: 'turn.started',
        data: {
          body: 'x'.repeat(12_000),
        },
      })
    ).toBe(0);

    await waitForTimers();

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(mocks.dbNotify).toHaveBeenCalledTimes(1);
    const [channel, rawPayload] = mocks.dbNotify.mock.calls[0] as [
      string,
      string,
    ];
    expect(channel).toBe('reward_realtime_bus');

    const parsed = JSON.parse(rawPayload) as {
      originId: string;
      storage: string;
      redisKey: string;
    };
    expect(parsed.storage).toBe('redis');
    expect(parsed.redisKey).toContain('realtime:bus:payload:');

    const storedPayload = redisEntries.get(parsed.redisKey);
    expect(storedPayload).toBeTruthy();
    expect(JSON.parse(storedPayload ?? 'null')).toMatchObject({
      originId: parsed.originId,
      scope: 'topic',
      topic: 'public:oversized',
      event: 'turn.started',
    });
  });

  it('loads oversized realtime bus payload references from redis listeners', async () => {
    const redisEntries = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => redisEntries.get(key) ?? null),
      set: vi.fn(async () => 'OK'),
    };
    mocks.getRedis.mockReturnValue(redis);

    const { app, wsUrl } = await createRealtimeTestApp();
    activeApp = app;

    const listenHandler = mocks.dbListen.mock.calls[0]?.[1] as
      | ((rawPayload: string) => void)
      | undefined;
    expect(listenHandler).toBeTypeOf('function');

    const socket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await socket.waitForOpen();
    await socket.nextMessage<RealtimeHelloMessage>();

    socket.socket.send(
      JSON.stringify({
        type: 'transport.subscribe',
        topics: ['public:oversized'],
      })
    );
    await socket.nextMessage<RealtimeServerMessage>();

    redisEntries.set(
      'realtime:bus:payload:test',
      JSON.stringify({
        originId: 'other-process',
        scope: 'topic',
        topic: 'public:oversized',
        event: 'turn.started',
        data: {
          body: 'y'.repeat(12_000),
        },
      })
    );

    listenHandler?.(
      JSON.stringify({
        originId: 'other-process',
        storage: 'redis',
        redisKey: 'realtime:bus:payload:test',
      })
    );

    const topicEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(topicEvent.topic).toBe('public:oversized');
    expect(topicEvent.event).toBe('turn.started');
    expect((topicEvent.data as { body: string }).body).toHaveLength(12_000);

    await socket.close();
  });

  it('fans out holdem lobby and table updates through the realtime transport', async () => {
    const { app, wsUrl } = await createRealtimeTestApp();
    activeApp = app;

    const socket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await socket.waitForOpen();
    await socket.nextMessage<RealtimeHelloMessage>();

    socket.socket.send(
      JSON.stringify({
        type: 'transport.subscribe',
        topics: [
          HOLDEM_REALTIME_LOBBY_TOPIC,
          buildHoldemRealtimeTableTopic(7),
        ],
      })
    );
    const subscribed = await socket.nextMessage<RealtimeServerMessage>();
    expect(subscribed).toMatchObject({
      type: 'transport.subscribed',
      topics: [
        HOLDEM_REALTIME_LOBBY_TOPIC,
        buildHoldemRealtimeTableTopic(7),
      ],
    });

    publishHoldemRealtimeUpdate({
      publicUpdate: {
        table: {
          id: 7,
          name: 'Realtime Holdem',
          linkedGroup: null,
          tableType: 'cash',
          status: 'active',
          rakePolicy: null,
          tournament: null,
          handNumber: 4,
          stage: 'turn',
          smallBlind: '1.00',
          bigBlind: '2.00',
          minimumBuyIn: '40.00',
          maximumBuyIn: '200.00',
          maxSeats: 6,
          occupiedSeats: 2,
          canStart: false,
          communityCards: [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
            { rank: 'Q', suit: 'clubs' },
            { rank: '2', suit: 'diamonds' },
          ],
          pots: [
            {
              potIndex: 0,
              kind: 'main',
              amount: '12.00',
              rakeAmount: '0.00',
              eligibleSeatIndexes: [0, 1],
              winnerSeatIndexes: [],
            },
          ],
          seats: [
            {
              seatIndex: 0,
              userId: 42,
              displayName: 'player@example.com',
              isBot: false,
              connectionState: 'connected',
              disconnectGraceExpiresAt: null,
              seatLeaseExpiresAt: null,
              autoCashOutPending: false,
              turnDeadlineAt: null,
              timeBankRemainingMs: 0,
              stackAmount: '94.00',
              committedAmount: '6.00',
              totalCommittedAmount: '6.00',
              status: 'active',
              inHand: true,
              sittingOut: false,
              isDealer: false,
              isSmallBlind: true,
              isBigBlind: false,
              isCurrentTurn: false,
              winner: false,
              bestHand: null,
              lastAction: 'Call',
              revealedCards: [],
            },
            {
              seatIndex: 1,
              userId: 52,
              displayName: 'villain@example.com',
              isBot: false,
              connectionState: 'connected',
              disconnectGraceExpiresAt: null,
              seatLeaseExpiresAt: null,
              autoCashOutPending: false,
              turnDeadlineAt: new Date().toISOString(),
              timeBankRemainingMs: 30000,
              stackAmount: '88.00',
              committedAmount: '12.00',
              totalCommittedAmount: '12.00',
              status: 'active',
              inHand: true,
              sittingOut: false,
              isDealer: true,
              isSmallBlind: false,
              isBigBlind: true,
              isCurrentTurn: true,
              winner: false,
              bestHand: null,
              lastAction: 'Raise',
              revealedCards: [],
            },
          ],
          dealerSeatIndex: 1,
          smallBlindSeatIndex: 0,
          bigBlindSeatIndex: 1,
          pendingActorSeatIndex: 1,
          pendingActorDeadlineAt: new Date().toISOString(),
          pendingActorTimeBankStartsAt: new Date().toISOString(),
          pendingActorTimeoutAction: 'fold',
          fairness: null,
          revealedSeatIndexes: [],
          winnerSeatIndexes: [],
          recentHands: [],
          updatedAt: new Date().toISOString(),
        },
        handHistoryId: 12,
        roundId: 'holdem:12',
        actorSeatIndex: 0,
        action: 'raise',
        timedOut: false,
        eventTypes: ['player_acted', 'turn_started'],
      },
      privateUpdates: [{
        userId: 42,
        update: {
          table: {
            id: 7,
            name: 'Realtime Holdem',
            linkedGroup: null,
            tableType: 'cash',
            status: 'active',
            rakePolicy: null,
            tournament: null,
            handNumber: 4,
            stage: 'turn',
            smallBlind: '1.00',
            bigBlind: '2.00',
            minimumBuyIn: '40.00',
            maximumBuyIn: '200.00',
            maxSeats: 6,
            communityCards: [
              { rank: 'A', suit: 'spades', hidden: false },
              { rank: 'K', suit: 'hearts', hidden: false },
              { rank: 'Q', suit: 'clubs', hidden: false },
              { rank: '2', suit: 'diamonds', hidden: false },
            ],
            pots: [
              {
                potIndex: 0,
                kind: 'main',
                amount: '12.00',
                rakeAmount: '0.00',
                eligibleSeatIndexes: [0, 1],
                winnerSeatIndexes: [],
              },
            ],
            seats: [
              {
                seatIndex: 0,
                userId: 42,
                displayName: 'player@example.com',
                isBot: false,
                connectionState: 'connected',
                disconnectGraceExpiresAt: null,
                seatLeaseExpiresAt: null,
                autoCashOutPending: false,
                turnDeadlineAt: null,
                timeBankRemainingMs: 0,
                stackAmount: '94.00',
                committedAmount: '6.00',
                totalCommittedAmount: '6.00',
                status: 'active',
                cards: [
                  { rank: 'A', suit: 'spades', hidden: false },
                  { rank: 'A', suit: 'hearts', hidden: false },
                ],
                inHand: true,
                sittingOut: false,
                isDealer: false,
                isSmallBlind: true,
                isBigBlind: false,
                isCurrentTurn: false,
                winner: false,
                bestHand: null,
                lastAction: 'Call',
              },
              {
                seatIndex: 1,
                userId: 52,
                displayName: 'villain@example.com',
                isBot: false,
                connectionState: 'connected',
                disconnectGraceExpiresAt: null,
                seatLeaseExpiresAt: null,
                autoCashOutPending: false,
                turnDeadlineAt: new Date().toISOString(),
                timeBankRemainingMs: 30000,
                stackAmount: '88.00',
                committedAmount: '12.00',
                totalCommittedAmount: '12.00',
                status: 'active',
                cards: [
                  { rank: null, suit: null, hidden: true },
                  { rank: null, suit: null, hidden: true },
                ],
                inHand: true,
                sittingOut: false,
                isDealer: true,
                isSmallBlind: false,
                isBigBlind: true,
                isCurrentTurn: true,
                winner: false,
                bestHand: null,
                lastAction: 'Raise',
              },
            ],
            heroSeatIndex: 0,
            pendingActorSeatIndex: 1,
            pendingActorDeadlineAt: new Date().toISOString(),
            pendingActorTimeBankStartsAt: new Date().toISOString(),
            pendingActorTimeoutAction: 'fold',
            availableActions: null,
            fairness: null,
            dealerEvents: [],
            recentHands: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          handHistoryId: 12,
          roundId: 'holdem:12',
          actorSeatIndex: 0,
          action: 'raise',
          timedOut: false,
          eventTypes: ['player_acted', 'turn_started'],
        },
      }],
    });

    const lobbyEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(lobbyEvent.topic).toBe(HOLDEM_REALTIME_LOBBY_TOPIC);
    expect(lobbyEvent.event).toBe('holdem.lobby.updated');
    expect(lobbyEvent.data).toMatchObject({
      table: {
        id: 7,
        handNumber: 4,
      },
      action: 'raise',
    });

    const tableEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(tableEvent.topic).toBe(buildHoldemRealtimeTableTopic(7));
    expect(tableEvent.event).toBe('holdem.table.updated');
    expect(tableEvent.data).toMatchObject({
      table: {
        id: 7,
        stage: 'turn',
      },
      handHistoryId: 12,
    });

    const privateEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(privateEvent.topic).toBe(`user:${ACTIVE_USER.userId}`);
    expect(privateEvent.event).toBe(HOLDEM_REALTIME_PRIVATE_TABLE_EVENT);
    expect(privateEvent.data).toMatchObject({
      table: {
        id: 7,
        heroSeatIndex: 0,
      },
      handHistoryId: 12,
    });

    await socket.close();
  });

  it('fans out holdem table chat messages through the public table topic', async () => {
    const { app, wsUrl } = await createRealtimeTestApp();
    activeApp = app;

    const socket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await socket.waitForOpen();
    await socket.nextMessage<RealtimeHelloMessage>();

    socket.socket.send(
      JSON.stringify({
        type: 'transport.subscribe',
        topics: [buildHoldemRealtimeTableTopic(7)],
      }),
    );
    await socket.nextMessage<RealtimeServerMessage>();

    publishHoldemRealtimeTableMessage({
      id: 91,
      tableId: 7,
      userId: ACTIVE_USER.userId,
      seatIndex: 0,
      displayName: 'player',
      kind: 'emoji',
      text: null,
      emoji: '🔥',
      createdAt: new Date().toISOString(),
    });

    const messageEvent = await socket.nextMessage<RealtimeEventMessage>();
    expect(messageEvent.topic).toBe(buildHoldemRealtimeTableTopic(7));
    expect(messageEvent.event).toBe(HOLDEM_REALTIME_TABLE_MESSAGE_EVENT);
    expect(messageEvent.data).toMatchObject({
      id: 91,
      tableId: 7,
      kind: 'emoji',
      emoji: '🔥',
    });

    await socket.close();
  });

  it('closes idle sockets after heartbeat timeout', async () => {
    const { app, wsUrl } = await createRealtimeTestApp({
      heartbeatIntervalMs: 20,
      heartbeatTimeoutMs: 20,
      reconnectWindowMs: 100,
      sessionValidationIntervalMs: 1_000,
    });
    activeApp = app;

    const socket = createSocketHarness(`${wsUrl}?token=valid-token`);
    await socket.waitForOpen();
    await socket.nextMessage<RealtimeHelloMessage>();

    const ping = await socket.nextMessage<RealtimeServerMessage>();
    expect(ping).toMatchObject({ type: 'transport.ping' });

    const close = await socket.waitForClose();
    expect(close.code).toBe(4001);
    expect(close.reason).toBe('heartbeat_timeout');
  });
});
