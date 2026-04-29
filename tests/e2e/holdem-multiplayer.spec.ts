import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const appBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

const waitForNotificationPayload = async (payload: {
  kind: string;
  recipient: string;
  timeoutMs?: number;
}) => {
  const deadline = Date.now() + (payload.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const rows = await sql<Array<{ payload: Record<string, unknown> | string }>>`
      select payload
      from notification_deliveries
      where kind = ${payload.kind}
        and recipient = ${payload.recipient}
      order by id desc
      limit 1
    `;

    const value = rows[0]?.payload;
    if (typeof value === 'string') {
      return JSON.parse(value) as Record<string, unknown>;
    }

    if (value && typeof value === 'object') {
      return value;
    }

    await delay(200);
  }

  throw new Error(
    `Timed out waiting for ${payload.kind} notification for ${payload.recipient}.`,
  );
};

const waitForRecord = async <T>(
  query: () => Promise<T | null | undefined>,
  label: string,
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const record = await query();
    if (record) {
      return record;
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${label}.`);
};

const registerAndSignInVerifiedUser = async (
  page: Page,
  payload: { email: string; password: string },
) => {
  await page.goto(`${appBaseUrl}/register`);
  await page.getByLabel('Email Address').fill(payload.email);
  await page.getByLabel('Password').fill(payload.password);
  await page.getByLabel('Birth Date').fill(TEST_BIRTH_DATE);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);

  const verification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: payload.email,
  });
  const verificationUrl = String(verification.verificationUrl ?? '');

  await page.goto(verificationUrl);
  await page.getByRole('button', { name: 'Verify Email' }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);

  await page.getByLabel('Email Address').fill(payload.email);
  await page.getByLabel('Password').fill(payload.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/app$/);
};

const lookupUserId = async (email: string) => {
  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing user for ${email}.`);
  }

  return user.id;
};

const seedWalletBalance = async (
  userId: number,
  balances: {
    withdrawableBalance: string;
    bonusBalance: string;
  },
) => {
  await sql`
    insert into user_wallets (
      user_id,
      withdrawable_balance,
      bonus_balance,
      locked_balance,
      wagered_amount
    )
    values (
      ${userId},
      ${balances.withdrawableBalance},
      ${balances.bonusBalance},
      '0.00',
      '0.00'
    )
    on conflict (user_id)
    do update
    set
      withdrawable_balance = excluded.withdrawable_balance,
      bonus_balance = excluded.bonus_balance,
      locked_balance = excluded.locked_balance,
      wagered_amount = excluded.wagered_amount,
      updated_at = now()
  `;
};

const waitForTableId = async (tableName: string) =>
  waitForRecord(
    async () => {
      const [table] = await sql<Array<{ id: number }>>`
        select id
        from holdem_tables
        where name = ${tableName}
        order by id desc
        limit 1
      `;

      return table?.id ?? null;
    },
    `holdem table ${tableName}`,
  );

const waitForTableType = async (
  tableId: number,
  tableType: 'cash' | 'casual' | 'tournament',
) =>
  waitForRecord(
    async () => {
      const [table] = await sql<Array<{ metadata: Record<string, unknown> | string | null }>>`
        select metadata
        from holdem_tables
        where id = ${tableId}
        limit 1
      `;
      const metadata = readJsonObject(table?.metadata ?? null);
      return metadata.tableType === tableType ? metadata : null;
    },
    `${tableType} holdem table ${tableId}`,
  );

const waitForActiveTurn = async (tableId: number) =>
  waitForRecord(
    async () => {
      const [seat] = await sql<Array<{ seatIndex: number; userId: number }>>`
        select
          seat_index as "seatIndex",
          user_id as "userId"
        from holdem_table_seats
        where table_id = ${tableId}
          and status = 'active'
          and turn_deadline_at is not null
        order by seat_index asc
        limit 1
      `;

      return seat ?? null;
    },
    `active holdem turn for table ${tableId}`,
  );

const waitForTableEvent = async (tableId: number, eventType: string) =>
  waitForRecord(
    async () => {
      const [event] = await sql<Array<{ id: number }>>`
        select id
        from table_events
        where table_type = 'holdem'
          and table_id = ${tableId}
          and event_type = ${eventType}
        order by id desc
        limit 1
      `;

      return event ?? null;
    },
    `${eventType} table event for holdem table ${tableId}`,
  );

const waitForOccupiedSeatCount = async (
  tableId: number,
  occupiedSeatCount: number,
) =>
  waitForRecord(
    async () => {
      const [table] = await sql<Array<{ occupiedSeatCount: number }>>`
        select count(*)::int as "occupiedSeatCount"
        from holdem_table_seats
        where table_id = ${tableId}
          and user_id is not null
      `;

      return table?.occupiedSeatCount === occupiedSeatCount ? table : null;
    },
    `${occupiedSeatCount} occupied seats for holdem table ${tableId}`,
  );

type HoldemTestUser = {
  email: string;
  password: string;
  label: string;
  userId: number;
};

type HoldemMultiplayerSetup = {
  page: Page;
  userOne: HoldemTestUser;
  userTwo: HoldemTestUser;
  userTwoContext: BrowserContext;
  userTwoPage: Page;
  tableId: number;
  tableName: string;
};

type HoldemTurnAssignment = {
  activeTurn: {
    seatIndex: number;
    userId: number;
  };
  actor: HoldemTestUser;
  actorPage: Page;
  observer: HoldemTestUser;
  observerPage: Page;
  winnerLabel: string;
};

const readJsonObject = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLobbyTableButton = (page: Page, tableName: string) =>
  page
    .getByRole('button', {
      name: new RegExp(escapeRegExp(tableName)),
    })
    .first();

const syncPageToHoldemTable = async (params: {
  page: Page;
  tableName: string;
  expectedOccupiedSeats?: number;
  expectedTableTypeLabel?: string;
  refreshLobby?: boolean;
}) => {
  if (params.refreshLobby) {
    await params.page.getByRole('button', { name: 'Refresh' }).first().click();
  }

  const lobbyTableButton = getLobbyTableButton(params.page, params.tableName);
  await expect(lobbyTableButton).toBeVisible();

  if (params.expectedOccupiedSeats !== undefined) {
    await expect(lobbyTableButton).toContainText(
      new RegExp(`Players:\\s*${params.expectedOccupiedSeats}/`),
    );
  }
  if (params.expectedTableTypeLabel) {
    await expect(lobbyTableButton).toContainText(
      new RegExp(`Table type:\\s*${escapeRegExp(params.expectedTableTypeLabel)}`),
    );
  }

  await lobbyTableButton.click();
};

const forceExpiredHoldemTurn = async (params: {
  tableId: number;
  seatIndex: number;
}) => {
  const [table] = await sql<Array<{ metadata: Record<string, unknown> | string | null }>>`
    select metadata
    from holdem_tables
    where id = ${params.tableId}
    limit 1
  `;
  const metadata = readJsonObject(table?.metadata ?? null);
  const now = Date.now();
  const turnTimeBankStartsAt = new Date(now - 35_000).toISOString();
  const turnStartedAt = new Date(now - 65_000).toISOString();

  await sql`
    update holdem_table_seats
    set
      turn_deadline_at = ${new Date(now - 5_000)},
      updated_at = now()
    where table_id = ${params.tableId}
      and seat_index = ${params.seatIndex}
  `;

  await sql`
    update holdem_tables
    set
      metadata = ${sql.json({
        ...metadata,
        turnStartedAt,
        turnTimeBankStartsAt,
        turnTimeBankAllocatedMs: 30_000,
      })},
      updated_at = now()
    where id = ${params.tableId}
  `;
};

const installRealtimeDisconnectHarness = async (page: Page) => {
  await page.addInitScript(() => {
    const windowWithHarness = window as typeof window & {
      __rewardRealtimeHarness?: {
        disconnect: () => void;
        reconnect: () => void;
      };
    };

    if (windowWithHarness.__rewardRealtimeHarness) {
      return;
    }

    const NativeWebSocket = window.WebSocket;
    const realtimeSockets = new Set<WebSocket>();
    let blocked = false;

    const emitClose = (socket: {
      readyState: number;
      onclose: ((event: CloseEvent) => void) | null;
      dispatchEvent: (event: Event) => boolean;
    }) => {
      if (socket.readyState === NativeWebSocket.CLOSED) {
        return;
      }

      const event = new CloseEvent('close', {
        code: 1006,
        reason: 'test_realtime_disconnect',
        wasClean: false,
      });
      socket.readyState = NativeWebSocket.CLOSED;
      socket.onclose?.(event);
      socket.dispatchEvent(event);
    };

    class BlockedRealtimeSocket extends EventTarget {
      static readonly CONNECTING = NativeWebSocket.CONNECTING;
      static readonly OPEN = NativeWebSocket.OPEN;
      static readonly CLOSING = NativeWebSocket.CLOSING;
      static readonly CLOSED = NativeWebSocket.CLOSED;

      binaryType: BinaryType = 'blob';
      bufferedAmount = 0;
      extensions = '';
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      protocol = '';
      readyState = NativeWebSocket.CONNECTING;
      readonly url: string;

      constructor(url: string) {
        super();
        this.url = url;

        window.setTimeout(() => {
          emitClose(this);
        }, 0);
      }

      close() {
        emitClose(this);
      }

      send() {
        return undefined;
      }
    }

    const isRealtimeUrl = (value: string | URL) =>
      String(value).includes('/realtime');

    const WrappedWebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const [url] = args as [string | URL, string | string[] | undefined];
        if (isRealtimeUrl(url) && blocked) {
          return new BlockedRealtimeSocket(String(url)) as unknown as WebSocket;
        }

        const socket = Reflect.construct(target, args) as WebSocket;
        if (isRealtimeUrl(url)) {
          realtimeSockets.add(socket);
          socket.addEventListener(
            'close',
            () => {
              realtimeSockets.delete(socket);
            },
            { once: true },
          );
        }
        return socket;
      },
    });

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: WrappedWebSocket,
    });

    windowWithHarness.__rewardRealtimeHarness = {
      disconnect() {
        blocked = true;
        for (const socket of realtimeSockets) {
          try {
            socket.close();
          } catch {
            // Ignore test-only socket teardown failures.
          }
        }
      },
      reconnect() {
        blocked = false;
      },
    };
  });
};

const createRealtimeDisconnectHelper = (page: Page) => ({
  async disconnect() {
    await page.evaluate(() => {
      const windowWithHarness = window as typeof window & {
        __rewardRealtimeHarness?: {
          disconnect: () => void;
        };
      };
      windowWithHarness.__rewardRealtimeHarness?.disconnect();
    });
  },
  async reconnect() {
    await page.evaluate(() => {
      const windowWithHarness = window as typeof window & {
        __rewardRealtimeHarness?: {
          reconnect: () => void;
        };
      };
      windowWithHarness.__rewardRealtimeHarness?.reconnect();
    });
  },
});

const setupTwoPlayerHoldemTable = async (params: {
  browser: Browser;
  page: Page;
  suffix: string;
}): Promise<HoldemMultiplayerSetup> => {
  const userOne: HoldemTestUser = {
    email: `h1${params.suffix}@example.com`,
    password: 'Password123!',
    label: `h1${params.suffix}`,
    userId: 0,
  };
  const userTwo: HoldemTestUser = {
    email: `h2${params.suffix}@example.com`,
    password: 'Password123!',
    label: `h2${params.suffix}`,
    userId: 0,
  };
  const tableName = `PW Holdem Casual ${params.suffix}`;
  const userTwoContext = await params.browser.newContext();
  const userTwoPage = await userTwoContext.newPage();

  await registerAndSignInVerifiedUser(params.page, userOne);
  await registerAndSignInVerifiedUser(userTwoPage, userTwo);

  userOne.userId = await lookupUserId(userOne.email);
  userTwo.userId = await lookupUserId(userTwo.email);

  await seedWalletBalance(userOne.userId, {
    withdrawableBalance: '0.00',
    bonusBalance: '500.00',
  });
  await seedWalletBalance(userTwo.userId, {
    withdrawableBalance: '0.00',
    bonusBalance: '500.00',
  });

  await installRealtimeDisconnectHarness(params.page);
  await installRealtimeDisconnectHarness(userTwoPage);

  await params.page.goto(`${appBaseUrl}/app/holdem`);
  await userTwoPage.goto(`${appBaseUrl}/app/holdem`);

  await expect(params.page.getByText("Texas Hold'em").first()).toBeVisible();
  await expect(userTwoPage.getByText("Texas Hold'em").first()).toBeVisible();
  await expect(params.page.getByText('Live table feed active.')).toBeVisible();
  await expect(userTwoPage.getByText('Live table feed active.')).toBeVisible();

  await params.page.getByTestId('holdem-create-table-type-casual').click();
  await params.page.getByTestId('holdem-create-max-seats-2').click();
  await params.page.getByPlaceholder('Optional public table name').fill(tableName);
  await params.page.getByRole('button', { name: 'Create and sit' }).click();

  const tableId = await waitForTableId(tableName);
  await waitForTableType(tableId, 'casual');
  await waitForOccupiedSeatCount(tableId, 1);
  await syncPageToHoldemTable({
    page: params.page,
    tableName,
    expectedOccupiedSeats: 1,
    expectedTableTypeLabel: 'Casual',
  });
  await expect(params.page.getByRole('button', { name: 'Leave table' })).toBeVisible();

  await expect(getLobbyTableButton(userTwoPage, tableName)).toBeVisible();
  await expect(getLobbyTableButton(userTwoPage, tableName)).toContainText(
    /Table type:\s*Casual/,
  );
  await getLobbyTableButton(userTwoPage, tableName).click();
  await expect(userTwoPage.getByRole('button', { name: 'Join table' })).toBeVisible();
  await userTwoPage.getByRole('button', { name: 'Join table' }).click();

  await waitForOccupiedSeatCount(tableId, 2);

  await syncPageToHoldemTable({
    page: params.page,
    tableName,
    expectedOccupiedSeats: 2,
    expectedTableTypeLabel: 'Casual',
    refreshLobby: true,
  });
  await syncPageToHoldemTable({
    page: userTwoPage,
    tableName,
    expectedOccupiedSeats: 2,
    expectedTableTypeLabel: 'Casual',
    refreshLobby: true,
  });
  await expect(params.page.getByRole('button', { name: 'Leave table' })).toBeVisible();
  await expect(userTwoPage.getByRole('button', { name: 'Leave table' })).toBeVisible();

  return {
    page: params.page,
    userOne,
    userTwo,
    userTwoContext,
    userTwoPage,
    tableId,
    tableName,
  };
};

const startTwoPlayerHoldemHand = async (
  setup: HoldemMultiplayerSetup,
): Promise<HoldemTurnAssignment> => {
  await expect(setup.page.getByRole('button', { name: 'Start hand' })).toBeVisible();
  await setup.page.getByRole('button', { name: 'Start hand' }).click();

  await expect(setup.page.getByText('Hand in progress').first()).toBeVisible();
  await expect(setup.userTwoPage.getByText('Hand in progress').first()).toBeVisible();

  const activeTurn = await waitForActiveTurn(setup.tableId);
  const actorIsUserOne = activeTurn.userId === setup.userOne.userId;

  return {
    activeTurn,
    actor: actorIsUserOne ? setup.userOne : setup.userTwo,
    actorPage: actorIsUserOne ? setup.page : setup.userTwoPage,
    observer: actorIsUserOne ? setup.userTwo : setup.userOne,
    observerPage: actorIsUserOne ? setup.userTwoPage : setup.page,
    winnerLabel: actorIsUserOne ? setup.userTwo.label : setup.userOne.label,
  };
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('holdem timeout worker auto-folds an expired player and fans the settled hand to both seated clients in realtime on a two-player casual table without KYC', async ({
  browser,
  page,
}) => {
  test.slow();

  const now = Date.now().toString(36);
  const setup = await setupTwoPlayerHoldemTable({
    browser,
    page,
    suffix: now,
  });

  try {
    const { activeTurn, actorPage, observerPage, winnerLabel } =
      await startTwoPlayerHoldemHand(setup);

    await expect(
      actorPage.getByRole('button', { name: 'Fold' }),
    ).toBeVisible();

    await forceExpiredHoldemTurn({
      tableId: setup.tableId,
      seatIndex: activeTurn.seatIndex,
    });

    await waitForTableEvent(setup.tableId, 'turn_timed_out');

    await Promise.all([
      expect(actorPage.getByText('Waiting for players').first()).toBeVisible(),
      expect(observerPage.getByText('Waiting for players').first()).toBeVisible(),
      expect(actorPage.getByText('Hand #1').first()).toBeVisible(),
      expect(observerPage.getByText('Hand #1').first()).toBeVisible(),
      expect(
        actorPage.getByText(`Winners: ${winnerLabel}`).first(),
      ).toBeVisible(),
      expect(
        observerPage.getByText(`Winners: ${winnerLabel}`).first(),
      ).toBeVisible(),
      expect(actorPage.getByText('Time bank: 00:00').first()).toBeVisible(),
    ]);
  } finally {
    await setup.userTwoContext.close();
  }
});

test('holdem acting player reconnects to the same settled state after timing out offline on a two-player casual table without KYC', async ({
  browser,
  page,
}) => {
  test.slow();

  const now = `${Date.now().toString(36)}-reconnect`;
  const setup = await setupTwoPlayerHoldemTable({
    browser,
    page,
    suffix: now,
  });

  let disconnectHelper:
    | ReturnType<typeof createRealtimeDisconnectHelper>
    | null = null;

  try {
    const { activeTurn, actorPage, observerPage, winnerLabel } =
      await startTwoPlayerHoldemHand(setup);
    const winnerSeatNumber = activeTurn.seatIndex === 0 ? 2 : 1;
    const winnerCommentary = new RegExp(`Pot awarded to seat #${winnerSeatNumber}\\.`);

    disconnectHelper = createRealtimeDisconnectHelper(actorPage);

    await expect(actorPage.getByRole('button', { name: 'Fold' })).toBeVisible();
    await disconnectHelper.disconnect();
    await expect(
      actorPage.getByText('Reconnecting live table feed...').first(),
    ).toBeVisible();

    await forceExpiredHoldemTurn({
      tableId: setup.tableId,
      seatIndex: activeTurn.seatIndex,
    });
    await waitForTableEvent(setup.tableId, 'turn_timed_out');

    await Promise.all([
      expect(observerPage.getByText('Waiting for players').first()).toBeVisible(),
      expect(observerPage.getByText('Hand #1').first()).toBeVisible(),
      expect(
        observerPage.getByRole('button', { name: 'Start hand' }),
      ).toBeVisible(),
      expect(observerPage.getByText(winnerCommentary).last()).toBeVisible(),
    ]);

    await disconnectHelper.reconnect();
    await expect(actorPage.getByText('Live table feed active.').first()).toBeVisible();

    await Promise.all([
      expect(actorPage.getByText('Waiting for players').first()).toBeVisible(),
      expect(actorPage.getByText('Hand #1').first()).toBeVisible(),
      expect(actorPage.getByRole('button', { name: 'Start hand' })).toBeVisible(),
      expect(actorPage.getByText(winnerCommentary).last()).toBeVisible(),
      expect(actorPage.getByText('Time bank: 00:00').first()).toBeVisible(),
      expect(actorPage.getByRole('button', { name: 'Fold' })).toBeHidden(),
    ]);
  } finally {
    await disconnectHelper?.reconnect().catch(() => undefined);
    await setup.userTwoContext.close();
  }
});
