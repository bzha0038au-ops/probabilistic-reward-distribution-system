import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/risk/collusion/+page.server"

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

describe("collusion admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the collusion dashboard with query params", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        windowDays: 30,
        seriesLimit: 8,
        topLimit: 10,
        generatedAt: new Date().toISOString(),
        userSeries: [],
        deviceSeries: [],
        sharedIpTop: [],
        sharedDeviceTop: [],
        frequentTablePairs: [],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      url: new URL("http://localhost/risk/collusion?days=30"),
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/risk/collusion?days=30",
    )
    expect(result).toMatchObject({
      error: null,
      dashboard: {
        windowDays: 30,
      },
    })
  })

  it("requires a user id before creating a manual flag", async () => {
    const result = await actions.createManualFlag({
      request: makeRequest({ reason: "suspicious ring", totpCode: "123456" }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Missing user id." },
    })
  })

  it("submits the clear flag endpoint with step-up code", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 19, userId: 42, status: "resolved" },
    })

    const result = await actions.clearManualFlag({
      request: makeRequest({
        userId: "42",
        reason: "review complete",
        totpCode: "654321",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/risk/collusion/manual-flags/42/clear",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "review complete",
          totpCode: "654321",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })

  it("freezes gameplay through the existing freeze endpoint", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 7, userId: 88, status: "active" },
    })

    const result = await actions.freezeUser({
      request: makeRequest({
        userId: "88",
        totpCode: "111222",
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 88,
          reason: "manual_admin",
          scope: "gameplay_lock",
          totpCode: "111222",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })
})
