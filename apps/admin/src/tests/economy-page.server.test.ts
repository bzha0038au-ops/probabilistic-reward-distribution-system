import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(c)/economy/+page.server"

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

describe("economy admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the admin economy overview", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        assetTotals: [],
        giftSummary: {
          sentTodayCount: 0,
          sentTodayAmount: "0.00",
          sentLast24hCount: 0,
          sentLast24hAmount: "0.00",
        },
        energySummary: {
          exhaustedCount: 0,
          belowMaxCount: 0,
          accountCount: 0,
        },
        orderSummary: [],
        recentGifts: [],
        recentOrders: [],
        activeGiftLocks: [],
        riskSignals: [],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/economy/overview",
    )
    expect(result).toMatchObject({
      error: null,
      overview: expect.objectContaining({
        assetTotals: [],
        recentOrders: [],
      }),
    })
  })

  it("replays order fulfillment from the action", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { order: { id: 41, status: "fulfilled" } },
    })

    const result = await actions.replayFulfillment({
      request: makeRequest({ orderId: "41", totpCode: "123456" }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/economy/orders/41/replay-fulfillment",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: "Order #41 fulfillment replayed.",
    })
  })

  it("requires an admin MFA code before replaying fulfillment", async () => {
    const result = await actions.replayFulfillment({
      request: makeRequest({ orderId: "41" }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "Admin MFA code is required.",
      },
    })
  })

  it("reverses an order with refunded status", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { order: { id: 52, status: "refunded" } },
    })

    const result = await actions.reverseOrder({
      request: makeRequest({
        orderId: "52",
        targetStatus: "refunded",
        reason: "customer_refund",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/economy/orders/52/reverse",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          totpCode: "123456",
          targetStatus: "refunded",
          reason: "customer_refund",
        }),
      },
    )
    expect(result).toEqual({
      success: "Order #52 marked refunded.",
    })
  })

  it("creates a manual economy adjustment", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        assetCode: "B_LUCK",
        availableBalance: "17.50",
      },
    })

    const result = await actions.adjustAsset({
      request: makeRequest({
        userId: "88",
        assetCode: "B_LUCK",
        direction: "credit",
        amount: "7.50",
        reason: "manual_make_good",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/economy/adjustments",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: 88,
          assetCode: "B_LUCK",
          direction: "credit",
          amount: "7.50",
          reason: "manual_make_good",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: "Manual credit recorded for user #88.",
    })
  })

  it("freezes gift capability with gift_lock scope", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 91, status: "active" },
    })

    const result = await actions.freezeGift({
      request: makeRequest({
        userId: "73",
        reason: "mutual_gifting_review",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/freeze-records",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: 73,
          category: "operations",
          reason: "manual_admin",
          scope: "gift_lock",
          totpCode: "123456",
          metadata: {
            note: "mutual_gifting_review",
          },
        }),
      },
    )
    expect(result).toEqual({
      success: "Gift capability frozen for user #73.",
    })
  })

  it("releases a gift freeze record", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 44, status: "released" },
    })

    const result = await actions.releaseGiftFreeze({
      request: makeRequest({
        freezeRecordId: "44",
        reason: "review_cleared",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/freeze-records/44/release",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason: "review_cleared",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: "Gift freeze #44 released.",
    })
  })
})
