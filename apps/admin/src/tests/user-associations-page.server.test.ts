import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { load } from "../routes/(admin)/(c)/users/[userId]/associations/+page.server"

const graphFixture = {
  user: {
    userId: 42,
    email: "focus@example.com",
    isFrozen: false,
    freezeReason: null,
    hasOpenRiskFlag: true,
    manualFlagged: false,
    riskReason: "shared_device_fingerprint_login_cluster",
    riskScore: 2,
  },
  windowDays: 90,
  signalLimit: 12,
  generatedAt: "2026-04-29T00:00:00.000Z",
  summary: {
    deviceCount: 1,
    ipCount: 1,
    payoutCount: 1,
    relatedUserCount: 1,
    flaggedRelatedUserCount: 1,
  },
  deviceSignals: [
    {
      id: "device:abc",
      kind: "device",
      label: "Device abcdef123456",
      fingerprint: "abcdef123456",
      value: "abcdef123456",
      eventCount: 2,
      userCount: 2,
      lastSeenAt: "2026-04-29T00:00:00.000Z",
      activityTypes: ["user_login_success"],
      relatedUsers: [],
    },
  ],
  ipSignals: [],
  payoutSignals: [],
  relatedUsers: [
    {
      userId: 99,
      email: "related@example.com",
      isFrozen: false,
      freezeReason: null,
      hasOpenRiskFlag: true,
      manualFlagged: false,
      riskReason: "shared_device_fingerprint_login_cluster",
      riskScore: 2,
      relationTypes: ["device"],
      sharedDevices: ["Device abcdef123456"],
      sharedIps: [],
      sharedPayouts: [],
    },
  ],
  graph: {
    nodes: [
      {
        id: "user:42",
        type: "focus_user",
        label: "focus@example.com (#42)",
        subtitle: "Risk: shared_device_fingerprint_login_cluster",
      },
      {
        id: "device:abc",
        type: "device",
        label: "Device abcdef123456",
        subtitle: "2026-04-29T00:00:00.000Z",
      },
      {
        id: "user:99",
        type: "user",
        label: "related@example.com (#99)",
        subtitle: "shared_device_fingerprint_login_cluster",
      },
    ],
    edges: [
      {
        source: "user:42",
        target: "device:abc",
        type: "focus_device",
        label: "2 users",
      },
      {
        source: "device:abc",
        target: "user:99",
        type: "shared_device",
        label: "shared device",
      },
    ],
  },
}

describe("user associations page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an error when the route receives an invalid user id", async () => {
    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
      params: { userId: "bad" },
      url: new URL("http://localhost/users/bad/associations"),
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      graph: null,
      error: "Invalid user id.",
      userId: null,
      days: 90,
    })
  })

  it("loads association graph data from the backend", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: graphFixture,
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
      params: { userId: "42" },
      url: new URL("http://localhost/users/42/associations?days=30"),
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/users/42/associations?days=30",
    )
    expect(result).toMatchObject({
      graph: expect.objectContaining({
        summary: expect.objectContaining({
          relatedUserCount: 1,
        }),
        relatedUsers: [
          expect.objectContaining({
            userId: 99,
            relationTypes: ["device"],
          }),
        ],
      }),
      error: null,
      userId: 42,
      days: 30,
    })
  })
})
