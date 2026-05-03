// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { CurrentSessionProvider } from "./current-session-provider";
import { PaymentsOperationsPage } from "./payments-operations-page";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getWalletBalance: vi.fn(),
  listBankCards: vi.fn(),
  listCryptoDepositChannels: vi.fn(),
  listCryptoWithdrawAddresses: vi.fn(),
  listTopUps: vi.fn(),
  listWithdrawals: vi.fn(),
  createTopUp: vi.fn(),
  createCryptoDeposit: vi.fn(),
  createBankCard: vi.fn(),
  setDefaultBankCard: vi.fn(),
  createWithdrawal: vi.fn(),
  createCryptoWithdrawAddress: vi.fn(),
  setDefaultCryptoWithdrawAddress: vi.fn(),
  createCryptoWithdrawal: vi.fn(),
}));

const showToastMock = vi.fn();

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

vi.mock("@/components/ui/toast-provider", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui/toast-provider")>(
    "@/components/ui/toast-provider",
  );

  return {
    ...actual,
    useToast: () => ({
      showToast: showToastMock,
    }),
  };
});

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 42,
    email: "player@example.com",
    role: "user",
    emailVerifiedAt: "2026-05-01T00:00:00.000Z",
    phoneVerifiedAt: "2026-05-02T00:00:00.000Z",
  },
  session: {
    sessionId: "session-42",
    kind: "user",
    role: "user",
    ip: null,
    userAgent: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    lastSeenAt: "2026-05-03T00:00:00.000Z",
    expiresAt: "2026-06-03T00:00:00.000Z",
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

function renderPaymentsPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <CurrentSessionProvider value={currentSession}>
        <PaymentsOperationsPage />
      </CurrentSessionProvider>
    </I18nProvider>,
  );
}

describe("PaymentsOperationsPage", () => {
  beforeEach(() => {
    browserUserApiClientMock.getWalletBalance.mockResolvedValue(
      ok({
        balance: {
          withdrawableBalance: "120.00",
          bonusBalance: "5.00",
          lockedBalance: "30.00",
          totalBalance: "155.00",
        },
        assets: [],
        legacy: {
          withdrawableBalance: "120.00",
          bonusBalance: "5.00",
          lockedBalance: "30.00",
          totalBalance: "155.00",
        },
      }),
    );
    browserUserApiClientMock.listBankCards.mockResolvedValue(
      ok([
        {
          id: 9,
          userId: 42,
          methodType: "bank_account",
          channelType: "fiat",
          assetType: "fiat",
          assetCode: null,
          network: null,
          displayName: null,
          isDefault: true,
          status: "active",
          metadata: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          cardholderName: "Avery Stone",
          bankName: "Harbor Bank",
          brand: "Visa",
          last4: "4242",
        },
      ]),
    );
    browserUserApiClientMock.listCryptoDepositChannels.mockResolvedValue(
      ok([
        {
          id: 11,
          providerId: 2,
          chain: "Ethereum",
          network: "ERC20",
          token: "USDT",
          receiveAddress: "0xfeedface",
          qrCodeUrl: null,
          memoRequired: false,
          memoValue: null,
          minConfirmations: 12,
          isActive: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ]),
    );
    browserUserApiClientMock.listCryptoWithdrawAddresses.mockResolvedValue(
      ok([
        {
          id: 21,
          userId: 42,
          methodType: "crypto_address",
          channelType: "crypto",
          assetType: "token",
          assetCode: "USDT",
          network: "ERC20",
          displayName: null,
          isDefault: true,
          status: "active",
          metadata: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          payoutMethodId: 21,
          chain: "Ethereum",
          token: "USDT",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          label: "Main safe",
        },
      ]),
    );
    browserUserApiClientMock.listTopUps.mockResolvedValue(
      ok([
        {
          id: 31,
          userId: 42,
          amount: "50.00",
          providerId: null,
          channelType: "fiat",
          assetType: "fiat",
          assetCode: null,
          network: null,
          status: "requested",
          referenceId: "WIRE-1001",
          providerOrderId: null,
          submittedTxHash: null,
          metadata: null,
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ]),
    );
    browserUserApiClientMock.listWithdrawals.mockResolvedValue(
      ok([
        {
          id: 41,
          userId: 42,
          providerId: null,
          payoutMethodId: 9,
          bankCardId: 9,
          amount: "25.00",
          channelType: "fiat",
          assetType: "fiat",
          assetCode: null,
          network: null,
          status: "approved",
          providerOrderId: null,
          submittedTxHash: null,
          metadata: null,
          createdAt: "2026-05-02T03:00:00.000Z",
          updatedAt: "2026-05-02T03:00:00.000Z",
        },
      ]),
    );
    browserUserApiClientMock.createTopUp.mockResolvedValue(ok({}));
    browserUserApiClientMock.createCryptoDeposit.mockResolvedValue(ok({}));
    browserUserApiClientMock.createBankCard.mockResolvedValue(ok({}));
    browserUserApiClientMock.setDefaultBankCard.mockResolvedValue(ok({}));
    browserUserApiClientMock.createWithdrawal.mockResolvedValue(
      ok({
        id: 55,
      }),
    );
    browserUserApiClientMock.createCryptoWithdrawAddress.mockResolvedValue(ok({}));
    browserUserApiClientMock.setDefaultCryptoWithdrawAddress.mockResolvedValue(ok({}));
    browserUserApiClientMock.createCryptoWithdrawal.mockResolvedValue(ok({}));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the cashier desk with payout methods and recent payment activity", async () => {
    renderPaymentsPage();

    await waitFor(() => {
      expect(screen.getByTestId("payments-hero").textContent).toContain(
        "Payout operations",
      );
    });

    expect(screen.getAllByText("Harbor Bank · Visa · •••• 4242").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recent withdrawals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recent deposits").length).toBeGreaterThan(0);
  });

  it("submits a fiat withdrawal against the selected default bank card", async () => {
    const user = userEvent.setup();

    renderPaymentsPage();

    await waitFor(() => {
      expect(screen.queryByTestId("payments-withdraw-amount")).not.toBeNull();
    });

    await user.type(screen.getByTestId("payments-withdraw-amount"), "120.00");
    await user.click(screen.getByTestId("payments-withdraw-submit"));

    await waitFor(() => {
      expect(browserUserApiClientMock.createWithdrawal).toHaveBeenCalledWith({
        amount: "120.00",
        payoutMethodId: 9,
        bankCardId: 9,
      });
    });
  });
});
