// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { PredictionMarketHistoryResponse } from "@reward/shared-types/prediction-market";
import React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { PredictionMarketPortfolioPage } from "./prediction-market-portfolio-page";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getPredictionMarketHistory: vi.fn(),
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

const buildHistory = (): PredictionMarketHistoryResponse => ({
  status: "all",
  page: 1,
  limit: 10,
  hasNext: false,
  summary: {
    marketCount: 1,
    positionCount: 1,
    totalStakeAmount: "6.00",
    openStakeAmount: "0.00",
    settledPayoutAmount: "0.00",
    refundedAmount: "6.00",
  },
  items: [
    {
      portfolioStatus: "refunded",
      positionCount: 1,
      totalStakeAmount: "6.00",
      openStakeAmount: "0.00",
      settledPayoutAmount: "0.00",
      refundedAmount: "6.00",
      lastActivityAt: "2026-04-28T12:30:00.000Z",
      market: {
        id: 71,
        slug: "btc-sold-portfolio-view",
        roundKey: "btc-sold-portfolio-view",
        title: "BTC exits before settlement",
        description: "Portfolio item with a sold position",
        resolutionRules: "Resolution uses the official close.",
        sourceOfTruth: "Official BTC/USD daily close",
        category: "crypto",
        tags: ["btc", "sold-view"],
        invalidPolicy: "refund_all",
        mechanism: "pari_mutuel",
        vigBps: 500,
        status: "open",
        outcomes: [
          { key: "yes", label: "Yes" },
          { key: "no", label: "No" },
        ],
        totalPoolAmount: "0.00",
        winningOutcomeKey: null,
        winningPoolAmount: null,
        oracleBinding: null,
        opensAt: "2026-04-28T00:00:00.000Z",
        locksAt: "2026-05-28T00:00:00.000Z",
        resolvesAt: null,
        resolvedAt: null,
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-28T12:30:00.000Z",
      },
      positions: [
        {
          id: 101,
          marketId: 71,
          userId: 42,
          outcomeKey: "yes",
          stakeAmount: "6.00",
          payoutAmount: "6.00",
          status: "sold",
          createdAt: "2026-04-28T12:00:00.000Z",
          settledAt: "2026-04-28T12:30:00.000Z",
        },
      ],
    },
  ],
});

function renderPredictionMarketPortfolioPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <PredictionMarketPortfolioPage />
    </I18nProvider>,
  );
}

describe("PredictionMarketPortfolioPage", () => {
  beforeEach(() => {
    browserUserApiClientMock.getPredictionMarketHistory.mockResolvedValue(
      ok(buildHistory()),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders sold positions with the sold status and sold timestamp label", async () => {
    renderPredictionMarketPortfolioPage();

    await waitFor(() => {
      expect(
        browserUserApiClientMock.getPredictionMarketHistory,
      ).toHaveBeenCalledWith({
        status: "all",
        page: 1,
        limit: 10,
      });
    });

    const item = await screen.findByTestId("markets-portfolio-item-71");
    expect(within(item).getByText("Sold")).toBeInTheDocument();
    expect(within(item).getByText(/^Sold:/)).toBeInTheDocument();
    expect(item).toHaveTextContent("6.00");
  });
});
