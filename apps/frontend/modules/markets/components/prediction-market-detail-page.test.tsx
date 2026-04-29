// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";
import type { PredictionMarketDetail } from "@reward/shared-types/prediction-market";
import React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { CurrentSessionProvider } from "@/modules/app/components/current-session-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { PredictionMarketDetailPage } from "./prediction-market-detail-page";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getPredictionMarket: vi.fn(),
  getWalletBalance: vi.fn(),
  placePredictionPosition: vi.fn(),
  sellPredictionPosition: vi.fn(),
}));

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

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 42,
    email: "user@example.com",
    role: "user",
    emailVerifiedAt: "2026-04-01T00:00:00.000Z",
    phoneVerifiedAt: null,
  },
  session: {
    sessionId: "session-42",
    kind: "user",
    role: "user",
    ip: null,
    userAgent: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    lastSeenAt: "2026-04-28T00:00:00.000Z",
    expiresAt: "2026-05-28T00:00:00.000Z",
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

const buildMarket = (
  overrides?: Partial<PredictionMarketDetail>,
): PredictionMarketDetail => ({
  id: 11,
  slug: "btc-above-100k",
  roundKey: "CRYPTO-001",
  title: "BTC above 100k by June",
  description: "Will BTC close above 100k before June ends?",
  resolutionRules:
    "Resolves to yes if BTC closes above 100k on the selected venue before the deadline.",
  sourceOfTruth: "Coinbase BTC-USD closing price",
  category: "crypto",
  tags: ["btc", "macro"],
  invalidPolicy: "refund_all",
  mechanism: "pari_mutuel",
  vigBps: 250,
  status: "open",
  outcomes: [
    { key: "yes", label: "Yes" },
    { key: "no", label: "No" },
  ],
  outcomePools: [
    {
      outcomeKey: "yes",
      label: "Yes",
      totalStakeAmount: "90.00",
      positionCount: 3,
    },
    {
      outcomeKey: "no",
      label: "No",
      totalStakeAmount: "60.00",
      positionCount: 2,
    },
  ],
  totalPoolAmount: "150.00",
  winningOutcomeKey: null,
  winningPoolAmount: null,
  oracle: null,
  opensAt: "2026-04-20T00:00:00.000Z",
  locksAt: "2026-05-20T00:00:00.000Z",
  resolvesAt: "2026-06-01T00:00:00.000Z",
  resolvedAt: null,
  createdAt: "2026-04-19T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:00.000Z",
  userPositions: [],
  ...overrides,
});

function renderPredictionMarketDetailPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <ToastProvider>
        <CurrentSessionProvider value={currentSession}>
          <PredictionMarketDetailPage marketId={11} />
        </CurrentSessionProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("PredictionMarketDetailPage", () => {
  beforeEach(() => {
    browserUserApiClientMock.getPredictionMarket.mockResolvedValue(
      ok(buildMarket()),
    );
    browserUserApiClientMock.getWalletBalance.mockResolvedValue(
      ok({
        balance: "50.00",
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("blocks a buy when the entered stake exceeds wallet balance", async () => {
    const user = userEvent.setup();
    renderPredictionMarketDetailPage();

    await screen.findByText("BTC above 100k by June");
    await user.click(screen.getByTestId("market-outcome-option-yes"));
    await user.type(screen.getByLabelText("Stake amount"), "75");
    await user.click(screen.getByTestId("market-place-button"));

    await waitFor(() => {
      expect(
        browserUserApiClientMock.placePredictionPosition,
      ).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("market-form-error")).toHaveTextContent(
      messages.markets.validationStakeBalance,
    );
  });

  it("places a position, clears the form, and renders the updated position list", async () => {
    const user = userEvent.setup();
    const updatedMarket = buildMarket({
      totalPoolAmount: "165.00",
      userPositions: [
        {
          id: 101,
          marketId: 11,
          userId: 42,
          outcomeKey: "yes",
          stakeAmount: "15.00",
          payoutAmount: "0.00",
          status: "open",
          createdAt: "2026-04-28T12:00:00.000Z",
          settledAt: null,
        },
      ],
    });

    browserUserApiClientMock.getWalletBalance
      .mockResolvedValueOnce(
        ok({
          balance: "50.00",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          balance: "35.00",
        }),
      );
    browserUserApiClientMock.placePredictionPosition.mockResolvedValue(
      ok({
        market: updatedMarket,
        position: updatedMarket.userPositions[0],
      }),
    );

    renderPredictionMarketDetailPage();

    await screen.findByText("BTC above 100k by June");
    await user.click(screen.getByTestId("market-outcome-option-yes"));
    await user.type(screen.getByLabelText("Stake amount"), "15.00");
    await user.click(screen.getByTestId("market-place-button"));

    await waitFor(() => {
      expect(
        browserUserApiClientMock.placePredictionPosition,
      ).toHaveBeenCalledWith(11, {
        outcomeKey: "yes",
        stakeAmount: "15.00",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("market-position-101")).toBeInTheDocument();
    });

    expect(screen.getByTestId("market-notice")).toHaveTextContent(
      messages.markets.positionPlaced,
    );
    expect(screen.getByLabelText("Stake amount")).toHaveValue("");
  });

  it("sells an open position, refreshes the balance, and removes the sell action", async () => {
    const user = userEvent.setup();
    const initialMarket = buildMarket({
      totalPoolAmount: "165.00",
      userPositions: [
        {
          id: 101,
          marketId: 11,
          userId: 42,
          outcomeKey: "yes",
          stakeAmount: "15.00",
          payoutAmount: "0.00",
          status: "open",
          createdAt: "2026-04-28T12:00:00.000Z",
          settledAt: null,
        },
      ],
    });
    const updatedMarket = buildMarket({
      totalPoolAmount: "150.00",
      userPositions: [
        {
          ...initialMarket.userPositions[0],
          payoutAmount: "15.00",
          status: "sold",
          settledAt: "2026-04-28T12:30:00.000Z",
        },
      ],
    });

    browserUserApiClientMock.getPredictionMarket.mockResolvedValue(
      ok(initialMarket),
    );
    browserUserApiClientMock.getWalletBalance
      .mockResolvedValueOnce(
        ok({
          balance: "50.00",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          balance: "65.00",
        }),
      );
    browserUserApiClientMock.sellPredictionPosition.mockResolvedValue(
      ok({
        market: updatedMarket,
        position: updatedMarket.userPositions[0],
      }),
    );

    renderPredictionMarketDetailPage();

    await screen.findByText("BTC above 100k by June");
    await user.click(screen.getByTestId("market-sell-position-button-101"));

    await waitFor(() => {
      expect(
        browserUserApiClientMock.sellPredictionPosition,
      ).toHaveBeenCalledWith(11, 101);
    });

    await waitFor(() => {
      expect(screen.getByTestId("market-notice")).toHaveTextContent(
        messages.markets.positionSold,
      );
    });

    expect(screen.getByTestId("market-position-101")).toHaveTextContent("Sold");
    expect(
      screen.queryByTestId("market-sell-position-button-101"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("market-available-balance")).toHaveTextContent(
      "65.00",
    );
  });
});
