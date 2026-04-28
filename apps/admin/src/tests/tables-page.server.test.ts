import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", async () => {
  const actual = await vi.importActual<typeof import("$lib/server/api")>(
    "$lib/server/api",
  )

  return {
    ...actual,
    apiRequest,
  }
})

import { actions, load } from "../routes/(admin)/(c)/tables/+page.server"

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

describe("tables page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the initial table snapshot and websocket url", async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: {
          generatedAt: "2026-04-28T00:00:00.000Z",
          tables: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          token: "ws-access-token",
          expiresAt: "2026-04-28T00:01:30.000Z",
        },
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {},
      "/admin/table-monitoring",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      "/admin/table-monitoring/ws-token",
    )
    expect(result).toMatchObject({
      snapshot: {
        tables: [],
      },
      wsUrl:
        "ws://localhost:4000/admin/ws/table-monitoring?accessToken=ws-access-token",
      error: null,
    })
  })

  it("falls back to a direct websocket url when the ws token cannot be issued", async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: {
          generatedAt: "2026-04-28T00:00:00.000Z",
          tables: [],
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          message: "stream auth unavailable",
        },
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(result).toMatchObject({
      snapshot: {
        tables: [],
      },
      wsUrl: "ws://localhost:4000/admin/ws/table-monitoring",
      error: "stream auth unavailable",
    })
  })

  it("requires a reason before closing a table", async () => {
    const result = await actions.closeTable({
      request: makeRequest({
        sourceKind: "blackjack",
        tableId: "bj-1",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Reason is required." },
    })
  })

  it("calls the force-timeout endpoint", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        sourceKind: "blackjack",
        tableId: "bj-1",
        action: "force_timeout",
        seatIndex: 1,
        removed: false,
      },
    })

    const result = await actions.forceTimeout({
      request: makeRequest({
        sourceKind: "blackjack",
        tableId: "bj-1",
        totpCode: "123456",
        reason: "seat overdue",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/table-monitoring/blackjack/bj-1/force-timeout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          reason: "seat overdue",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })

  it("calls the kick-seat endpoint", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        sourceKind: "blackjack",
        tableId: "bj-1",
        action: "kick_seat",
        seatIndex: 1,
        removed: true,
      },
    })

    const result = await actions.kickSeat({
      request: makeRequest({
        sourceKind: "blackjack",
        tableId: "bj-1",
        seatIndex: "1",
        totpCode: "123456",
        reason: "manual removal",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/table-monitoring/blackjack/bj-1/seats/1/kick",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          reason: "manual removal",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })
})
