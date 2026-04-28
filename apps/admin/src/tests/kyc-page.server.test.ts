import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { load } from "../routes/(admin)/kyc/+page.server"

describe("kyc queue page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the KYC queue with filter query params", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: 91,
            userId: 17,
            userEmail: "kyc@example.com",
            currentTier: "tier_1",
            requestedTier: "tier_2",
            tier: "tier_2",
            status: "pending",
            submissionVersion: 3,
            legalName: "Alex Example",
            countryCode: "US",
            riskFlags: ["enhanced_tier_review"],
            submittedAt: "2026-04-28T01:00:00.000Z",
            hasActiveFreeze: true,
            documentCount: 3,
          },
        ],
        page: 2,
        limit: 25,
        hasNext: true,
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
      url: new URL(
        "http://localhost/kyc?tier=tier_2&from=2026-04-01&to=2026-04-30&riskFlag=enhanced_tier_review&limit=25&page=2",
      ),
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/kyc-profiles?tier=tier_2&from=2026-04-01&to=2026-04-30&riskFlag=enhanced_tier_review&limit=25&page=2",
    )
    expect(result).toMatchObject({
      filters: {
        tier: "tier_2",
        from: "2026-04-01",
        to: "2026-04-30",
        riskFlag: "enhanced_tier_review",
        limit: 25,
        page: 2,
      },
      queue: {
        items: [
          expect.objectContaining({
            id: 91,
            userId: 17,
            status: "pending",
          }),
        ],
        page: 2,
        limit: 25,
        hasNext: true,
      },
      error: null,
    })
  })
})
