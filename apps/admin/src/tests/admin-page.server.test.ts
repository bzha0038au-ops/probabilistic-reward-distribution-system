import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(engine)/config/+page.server"

const makeRequest = (entries: Record<string, string> = {}) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }

  return new Request("http://localhost/actions", {
    method: "POST",
    body: formData,
  })
}

describe("admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads MFA status with the rest of the admin dashboard data", async () => {
    apiRequest
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          systemConfig: null,
          providers: [],
          changeRequests: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          mfaEnabled: true,
          recoveryCodesRemaining: 8,
          recoveryCodesGeneratedAt: "2026-04-26T00:00:00.000Z",
          breakGlassConfigured: true,
        },
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { admin: null },
    } as never)

    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      {},
      "/admin/control-center",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      4,
      expect.any(Function),
      {},
      "/admin/mfa/status",
    )
    expect(result).toMatchObject({
      error: null,
      mfaStatus: {
        mfaEnabled: true,
        recoveryCodesRemaining: 8,
        breakGlassConfigured: true,
      },
    })
  })

  it("creates a system config draft instead of patching production directly", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { id: 12 } })

    const result = await actions.configDraft({
      request: makeRequest({
        poolBalance: "1000",
        drawCost: "10",
        weightJitterPct: "0.05",
        bonusUnlockWagerRatio: "1",
        authFailureWindowMinutes: "15",
        authFailureFreezeThreshold: "8",
        adminFailureFreezeThreshold: "5",
        changeReason: "tighten payout controls",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/control-center/system-config/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolBalance: "1000",
          drawCost: "10",
          maintenanceMode: false,
          registrationEnabled: false,
          loginEnabled: false,
          drawEnabled: false,
          paymentDepositEnabled: false,
          paymentWithdrawEnabled: false,
          antiAbuseAutoFreezeEnabled: false,
          withdrawRiskNewCardFirstWithdrawalReviewEnabled: false,
          weightJitterEnabled: false,
          weightJitterPct: "0.05",
          bonusAutoReleaseEnabled: false,
          bonusUnlockWagerRatio: "1",
          authFailureWindowMinutes: "15",
          authFailureFreezeThreshold: "8",
          adminFailureFreezeThreshold: "5",
          blackjackMinStake: "1",
          blackjackMaxStake: "100",
          blackjackWinPayoutMultiplier: "2",
          blackjackPushPayoutMultiplier: "1",
          blackjackNaturalPayoutMultiplier: "2.5",
          blackjackDealerHitsSoft17: false,
          blackjackDoubleDownAllowed: false,
          blackjackSplitAcesAllowed: false,
          blackjackHitSplitAcesAllowed: false,
          blackjackResplitAllowed: false,
          blackjackMaxSplitHands: 4,
          blackjackSplitTenValueCardsAllowed: false,
          reason: "tighten payout controls",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })

  it("publishes an approved change request with MFA step-up", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { id: 18, status: "published" } })

    const result = await actions.publishChangeRequest({
      request: makeRequest({
        requestId: "18",
        totpCode: "123456",
        confirmationText: "PUBLISH 18",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/control-center/change-requests/18/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          confirmationText: "PUBLISH 18",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })

  it("stores the refreshed session and returns recovery codes after MFA enrollment", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        token: "updated-admin-token",
        mfaEnabled: true,
        recoveryCodes: ["ABCD-EFGH-IJKL"],
        recoveryCodesRemaining: 8,
      },
    })

    const cookies = { set: vi.fn() }
    const result = await actions.confirmMfaEnrollment({
      request: makeRequest({
        enrollmentToken: "enrollment-token",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies,
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      cookies,
      "/admin/mfa/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentToken: "enrollment-token",
          totpCode: "123456",
        }),
      },
    )
    expect(cookies.set).toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      mfaEnabled: true,
      recoveryCodes: ["ABCD-EFGH-IJKL"],
      recoveryCodesRemaining: 8,
    })
  })

  it("accepts a recovery-mode disable flow and replaces the session cookie", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        token: "recovered-admin-token",
        mfaEnabled: false,
      },
    })

    const cookies = { set: vi.fn() }
    const result = await actions.disableMfa({
      request: makeRequest(),
      fetch: vi.fn(),
      cookies,
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      cookies,
      "/admin/mfa/disable",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    expect(cookies.set).toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      mfaEnabled: false,
      recoveryCodesRemaining: 0,
    })
  })
})
