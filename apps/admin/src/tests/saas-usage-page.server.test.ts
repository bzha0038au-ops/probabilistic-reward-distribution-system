import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import {
  actions,
  load,
} from "../routes/(admin)/(b)/saas/[tenant]/usage/+page.server"

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

describe("saas usage page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads tenant usage from the dedicated backend endpoint", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        tenant: {
          id: 7,
          slug: "acme",
          name: "Acme",
          billingEmail: null,
          status: "active",
          riskEnvelope: {
            dailyBudgetCap: null,
            maxSinglePayout: null,
            varianceCap: null,
            emergencyStop: false,
          },
          metadata: null,
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
        projects: [],
        windows: {
          realtimeMinutes: 60,
          payoutHistogramHours: 24,
        },
        summary: {
          totalRequests: 4,
          successfulRequests: 3,
          antiExploitBlockedRequests: 1,
          antiExploitRatePct: 25,
          totalPayoutAmount: "0.00",
          payoutCount: 0,
          maxMinuteQps: 0.07,
          maxSinglePayoutAmount: "0.00",
          lastRequestAt: "2026-04-28T00:05:00.000Z",
        },
        thresholds: {
          maxMinuteQps: 5,
          maxSinglePayoutAmount: "100.00",
          maxAntiExploitRatePct: 20,
        },
        alerts: {
          qps: { active: false, threshold: 5, current: 0.07 },
          payout: { active: false, threshold: "100.00", current: "0.00" },
          antiExploit: { active: true, threshold: 20, current: 25 },
        },
        minuteQps: [],
        payoutHistogram: [],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { admin: null },
      params: { tenant: "acme" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/by-slug/acme/usage",
    )
    expect(result).toMatchObject({
      error: null,
      usage: {
        tenant: {
          slug: "acme",
        },
      },
    })
  })

  it("submits alert thresholds through the control-center config draft flow", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { id: 14 } })

    const result = await actions.saveAlertThresholdDraft({
      request: makeRequest({
        saasUsageAlertMaxMinuteQps: "8",
        saasUsageAlertMaxSinglePayoutAmount: "250",
        saasUsageAlertMaxAntiExploitRatePct: "12.5",
        reason: "tighten tenant abuse tripwires",
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
          saasUsageAlertMaxMinuteQps: "8",
          saasUsageAlertMaxSinglePayoutAmount: "250",
          saasUsageAlertMaxAntiExploitRatePct: "12.5",
          reason: "tighten tenant abuse tripwires",
        }),
      },
    )
    expect(result).toEqual({ thresholdDraftCreated: true })
  })
})
