// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { WalletBalanceResponse } from "@reward/shared-types/user";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { QuickEightPanel } from "./quick-eight-panel";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getWalletBalance: vi.fn(),
  playQuickEight: vi.fn(),
}));

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const buildWalletResponse = ({
  totalBalance,
  legacyWithdrawableBalance,
}: {
  totalBalance: string;
  legacyWithdrawableBalance: string;
}): WalletBalanceResponse => ({
  balance: {
    withdrawableBalance: legacyWithdrawableBalance,
    bonusBalance: "5.00",
    lockedBalance: "10.00",
    totalBalance,
  },
  assets: [],
  legacy: {
    withdrawableBalance: legacyWithdrawableBalance,
    bonusBalance: "5.00",
    lockedBalance: "10.00",
    totalBalance,
  },
});

function renderQuickEightPanel(props?: Partial<React.ComponentProps<typeof QuickEightPanel>>) {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <QuickEightPanel {...props} />
    </I18nProvider>,
  );
}

describe("QuickEightPanel", () => {
  beforeEach(() => {
    browserUserApiClientMock.getWalletBalance.mockResolvedValue(
      ok(
        buildWalletResponse({
          totalBalance: "55.00",
          legacyWithdrawableBalance: "40.00",
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the total wallet balance instead of the legacy withdrawable balance", async () => {
    const onBalanceChange = vi.fn();

    renderQuickEightPanel({ onBalanceChange });

    await waitFor(() => {
      expect(screen.getByText("Current balance: 55.00")).toBeTruthy();
    });

    expect(onBalanceChange).toHaveBeenCalledWith("55.00");
    expect(onBalanceChange).not.toHaveBeenCalledWith("40.00");
  });
});
