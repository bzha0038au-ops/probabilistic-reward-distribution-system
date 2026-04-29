// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HOLDEM_CONFIG,
  type HoldemAction,
  type HoldemTableResponse,
  type HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { HoldemPanel } from "./holdem-panel";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getHoldemTables: vi.fn(),
  getHoldemTable: vi.fn(),
  getHoldemTableMessages: vi.fn(),
  reportHoldemRealtimeObservations: vi.fn(),
  touchHoldemTablePresence: vi.fn(),
  createHoldemTable: vi.fn(),
  joinHoldemTable: vi.fn(),
  leaveHoldemTable: vi.fn(),
  setHoldemSeatMode: vi.fn(),
  startHoldemTable: vi.fn(),
  actOnHoldemTable: vi.fn(),
  postHoldemTableMessage: vi.fn(),
  getUserRealtimeToken: vi.fn(),
  getPlayMode: vi.fn(),
  setPlayMode: vi.fn(),
  getHandHistory: vi.fn(),
}));

const holdemRealtimeClientMock = vi.hoisted(() => ({
  syncTopics: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  markSynchronized: vi.fn(),
}));

const createHoldemRealtimeClientMock = vi.hoisted(() =>
  vi.fn(() => holdemRealtimeClientMock),
);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

vi.mock("@reward/user-core", async () => {
  const actual = await vi.importActual<typeof import("@reward/user-core")>(
    "@reward/user-core",
  );

  return {
    ...actual,
    createHoldemRealtimeClient: createHoldemRealtimeClientMock,
  };
});

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const playModeSnapshot = {
  type: "standard" as const,
  appliedMultiplier: 1,
  nextMultiplier: 1,
  streak: 0,
  lastOutcome: null,
  carryActive: false,
};

const baseSeatPresence = {
  connectionState: "connected" as const,
  disconnectGraceExpiresAt: null,
  seatLeaseExpiresAt: null,
  autoCashOutPending: false,
  turnDeadlineAt: null,
  timeBankRemainingMs: 0,
} as const;

const baseFairness = {
  epoch: 12,
  epochSeconds: 30,
  commitHash: "commit-hash-123456",
  sourceCommitHash: null,
  deckDigest: "deck-digest-123456",
  rngDigest: "rng-digest-123456",
  revealSeed: null,
  revealedAt: null,
  algorithm: "sha256",
} as const;

const buildLobby = (): HoldemTablesResponse => ({
  currentTableId: 7,
  tables: [
    {
      id: 7,
      name: "Alpha Table",
      tableType: "cash",
      status: "active",
      rakePolicy: null,
      tournament: null,
      smallBlind: "1.00",
      bigBlind: "2.00",
      minimumBuyIn: "40.00",
      maximumBuyIn: "200.00",
      maxSeats: 6,
      occupiedSeats: 2,
      heroSeatIndex: 0,
      canStart: false,
      updatedAt: "2026-04-28T09:01:00.000Z",
    },
  ],
});

const buildTableResponse = (
  actions: HoldemAction[],
  overrides?: Partial<HoldemTableResponse["table"]>,
): HoldemTableResponse => ({
  table: {
    id: 7,
    name: "Alpha Table",
    tableType: "cash",
    status: "active",
    rakePolicy: null,
    tournament: null,
    handNumber: 4,
    stage: "turn",
    smallBlind: "1.00",
    bigBlind: "2.00",
    minimumBuyIn: "40.00",
    maximumBuyIn: "200.00",
    maxSeats: 6,
    communityCards: [
      { rank: "A", suit: "spades", hidden: false },
      { rank: "K", suit: "hearts", hidden: false },
      { rank: "Q", suit: "clubs", hidden: false },
      { rank: "2", suit: "diamonds", hidden: false },
    ],
    pots: [],
    seats: [
      {
        ...baseSeatPresence,
        seatIndex: 0,
        userId: 42,
        displayName: "Hero",
        stackAmount: "96.00",
        committedAmount: "4.00",
        totalCommittedAmount: "4.00",
        status: "active",
        cards: [
          { rank: "9", suit: "clubs", hidden: false },
          { rank: "9", suit: "diamonds", hidden: false },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isCurrentTurn: true,
        winner: false,
        bestHand: null,
        lastAction: "Call",
      },
      {
        ...baseSeatPresence,
        seatIndex: 1,
        userId: 52,
        displayName: "Villain",
        stackAmount: "96.00",
        committedAmount: "4.00",
        totalCommittedAmount: "4.00",
        status: "active",
        cards: [
          { rank: null, suit: null, hidden: true },
          { rank: null, suit: null, hidden: true },
        ],
        inHand: true,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: "Raise",
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        ...baseSeatPresence,
        seatIndex: index + 2,
        userId: null,
        displayName: null,
        stackAmount: "0.00",
        committedAmount: "0.00",
        totalCommittedAmount: "0.00",
        status: null,
        cards: [],
        inHand: false,
        sittingOut: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isCurrentTurn: false,
        winner: false,
        bestHand: null,
        lastAction: null,
      })),
    ],
    heroSeatIndex: 0,
    pendingActorSeatIndex: 0,
    pendingActorDeadlineAt: null,
    pendingActorTimeBankStartsAt: null,
    pendingActorTimeoutAction: "fold",
    availableActions: {
      actions,
      toCall: actions.includes("bet") ? "0.00" : "2.00",
      currentBet: actions.includes("bet") ? "0.00" : "4.00",
      minimumRaiseTo: actions.includes("raise") ? "6.00" : null,
      maximumRaiseTo: "100.00",
      minimumBetTo: "2.00",
    },
    fairness: baseFairness,
    dealerEvents: [],
    recentHands: [],
    createdAt: "2026-04-28T09:00:00.000Z",
    updatedAt: "2026-04-28T09:01:00.000Z",
    ...overrides,
  },
});

function renderHoldemPanel() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <HoldemPanel />
    </I18nProvider>,
  );
}

describe("HoldemPanel", () => {
  beforeEach(() => {
    browserUserApiClientMock.getHoldemTables.mockResolvedValue(ok(buildLobby()));
    browserUserApiClientMock.getHoldemTable.mockResolvedValue(
      ok(buildTableResponse(["fold", "call", "raise"])),
    );
    browserUserApiClientMock.getHoldemTableMessages.mockResolvedValue(
      ok({
        tableId: 7,
        messages: [],
      }),
    );
    browserUserApiClientMock.touchHoldemTablePresence.mockResolvedValue(
      ok({
        tableId: 7,
        seatIndex: 0,
        sittingOut: false,
        connectionState: "connected",
        disconnectGraceExpiresAt: null,
        seatLeaseExpiresAt: null,
        autoCashOutPending: false,
      }),
    );
    browserUserApiClientMock.reportHoldemRealtimeObservations.mockResolvedValue(
      ok({ accepted: true }),
    );
    browserUserApiClientMock.actOnHoldemTable.mockResolvedValue(
      ok(buildTableResponse(["fold", "call", "raise"])),
    );
    browserUserApiClientMock.createHoldemTable.mockResolvedValue(
      ok(
        buildTableResponse(["fold", "check"], {
          id: 11,
          name: "Casual Table",
          tableType: "casual",
          status: "waiting",
          rakePolicy: null,
          maxSeats: 2,
          heroSeatIndex: 0,
        }),
      ),
    );
    browserUserApiClientMock.getPlayMode.mockResolvedValue(
      ok({
        gameKey: "holdem",
        snapshot: playModeSnapshot,
      }),
    );
    browserUserApiClientMock.setPlayMode.mockResolvedValue(
      ok({
        gameKey: "holdem",
        snapshot: playModeSnapshot,
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits a raise with the edited action amount", async () => {
    const user = userEvent.setup();
    renderHoldemPanel();

    await screen.findByText("Alpha Table");

    const amountInput = await screen.findByTestId("holdem-action-amount-input");
    await user.clear(amountInput);
    await user.type(amountInput, "12.00");
    await user.click(screen.getByTestId("holdem-action-button-raise"));

    await waitFor(() => {
      expect(browserUserApiClientMock.actOnHoldemTable).toHaveBeenCalledWith(7, {
        action: "raise",
        amount: "12.00",
      });
    });
  });

  it("submits tournament-specific create fields when opening a tournament table", async () => {
    const user = userEvent.setup();
    renderHoldemPanel();

    await screen.findByText("Alpha Table");

    await user.click(screen.getByTestId("holdem-create-table-type-tournament"));

    const startingStackInput = screen.getByTestId(
      "holdem-create-tournament-starting-stack",
    );
    const payoutPlacesInput = screen.getByTestId(
      "holdem-create-tournament-payout-places",
    );
    const buyInInput = screen.getByTestId("holdem-create-buy-in-input");

    await user.clear(startingStackInput);
    await user.type(startingStackInput, "1500.00");
    await user.clear(payoutPlacesInput);
    await user.type(payoutPlacesInput, "2");
    await user.clear(buyInInput);
    await user.type(buyInInput, "100.00");
    await user.click(screen.getByRole("button", { name: "Create and sit" }));

    await waitFor(() => {
      expect(browserUserApiClientMock.createHoldemTable).toHaveBeenCalledWith({
        tableName: undefined,
        buyInAmount: "100.00",
        tableType: "tournament",
        maxSeats: 2,
        tournament: {
          startingStackAmount: "1500.00",
          payoutPlaces: 2,
        },
      });
    });
  });

  it("submits fold without an action amount", async () => {
    const user = userEvent.setup();
    renderHoldemPanel();

    const foldButton = await screen.findByTestId("holdem-action-button-fold");
    await user.click(foldButton);

    await waitFor(() => {
      expect(browserUserApiClientMock.actOnHoldemTable).toHaveBeenCalledWith(7, {
        action: "fold",
        amount: undefined,
      });
    });
  });

  it("switches to bet mode when the table exposes bet instead of raise", async () => {
    browserUserApiClientMock.getHoldemTable.mockResolvedValue(
      ok(
        buildTableResponse(["check", "bet"], {
          stage: "preflop",
        }),
      ),
    );

    renderHoldemPanel();

    expect(await screen.findByTestId("holdem-action-button-bet")).toBeInTheDocument();
    expect(
      screen.queryByTestId("holdem-action-button-raise"),
    ).not.toBeInTheDocument();
  });

  it("creates a casual two-seat table by default", async () => {
    const user = userEvent.setup();
    renderHoldemPanel();

    const createButton = await screen.findByRole("button", {
      name: "Create and sit",
    });
    await user.click(createButton);

    await waitFor(() => {
      expect(browserUserApiClientMock.createHoldemTable).toHaveBeenCalledWith({
        tableName: undefined,
        buyInAmount: "40.00",
        tableType: "casual",
        maxSeats: 2,
      });
    });
  });
});
