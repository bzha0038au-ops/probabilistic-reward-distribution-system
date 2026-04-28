import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(c)/markets/+page.server"

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

describe("markets admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads prediction markets from the backend API", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 9,
          slug: "btc-above-100k-2026-04-29",
          roundKey: "btc-2026-04-29-close",
          title: "BTC closes above 100k on 2026-04-29 UTC",
          description: "Daily close market",
          resolutionRules: "Use the official exchange close at 23:59:59 UTC.",
          sourceOfTruth: "Exchange settlement feed",
          category: "crypto",
          tags: ["btc", "daily-close"],
          invalidPolicy: "refund_all",
          mechanism: "pari_mutuel",
          status: "locked",
          outcomes: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
          outcomePools: [
            {
              outcomeKey: "yes",
              label: "Yes",
              totalStakeAmount: "50.00",
              positionCount: 3,
            },
            {
              outcomeKey: "no",
              label: "No",
              totalStakeAmount: "10.00",
              positionCount: 1,
            },
          ],
          totalPoolAmount: "60.00",
          winningOutcomeKey: null,
          winningPoolAmount: null,
          oracle: null,
          opensAt: "2026-04-28T00:00:00.000Z",
          locksAt: "2026-04-29T12:00:00.000Z",
          resolvesAt: "2026-04-29T12:30:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
      ],
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/markets",
    )
    expect(result).toEqual({
      markets: [
        expect.objectContaining({
          id: 9,
          slug: "btc-above-100k-2026-04-29",
          oracle: null,
          status: "locked",
        }),
      ],
      error: null,
    })
  })

  it("creates a market from the admin form", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 11, title: "BTC closes above 100k on 2026-04-29 UTC" },
    })

    const result = await actions.create({
      request: makeRequest({
        totpCode: "123456",
        slug: "btc-above-100k-2026-04-29",
        roundKey: "btc-2026-04-29-close",
        title: "BTC closes above 100k on 2026-04-29 UTC",
        description: "Daily close market",
        resolutionRules:
          "Use the official exchange close at 23:59:59 UTC and invalidate only if the source is unavailable.",
        sourceOfTruth: "Exchange settlement feed",
        category: "crypto",
        tags: "btc, daily-close",
        invalidPolicy: "refund_all",
        opensAt: "2026-04-28T00:00:00Z",
        locksAt: "2026-04-29T12:00:00Z",
        resolvesAt: "2026-04-29T12:30:00Z",
        outcomes: "yes|Yes\nno|No",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/markets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "btc-above-100k-2026-04-29",
          roundKey: "btc-2026-04-29-close",
          title: "BTC closes above 100k on 2026-04-29 UTC",
          description: "Daily close market",
          resolutionRules:
            "Use the official exchange close at 23:59:59 UTC and invalidate only if the source is unavailable.",
          sourceOfTruth: "Exchange settlement feed",
          category: "crypto",
          tags: ["btc", "daily-close"],
          invalidPolicy: "refund_all",
          outcomes: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
          opensAt: "2026-04-28T00:00:00Z",
          locksAt: "2026-04-29T12:00:00Z",
          resolvesAt: "2026-04-29T12:30:00Z",
          totpCode: "123456",
          breakGlassCode: null,
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      actionType: "create",
      marketTitle: "BTC closes above 100k on 2026-04-29 UTC",
    })
  })

  it("settles a market with oracle evidence", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 11, status: "resolved" },
    })

    const result = await actions.settle({
      request: makeRequest({
        marketId: "11",
        totpCode: "123456",
        winningOutcomeKey: "yes",
        oracleSource: "manual_oracle",
        oracleExternalRef: "oracle-001",
        oracleReportedAt: "2026-04-29T12:01:00Z",
        oraclePayloadHash: "sha256:abc",
        oraclePayload: '{"closingPrice":"100123.45"}',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/markets/11/settle",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winningOutcomeKey: "yes",
          oracle: {
            source: "manual_oracle",
            externalRef: "oracle-001",
            reportedAt: "2026-04-29T12:01:00Z",
            payloadHash: "sha256:abc",
            payload: {
              closingPrice: "100123.45",
            },
          },
          totpCode: "123456",
          breakGlassCode: null,
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      actionType: "settle",
      marketId: "11",
    })
  })

  it("rejects cancellation when the reason is missing", async () => {
    const result = await actions.cancel({
      request: makeRequest({
        marketId: "11",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "Cancellation reason is required.",
      },
    })
  })

  it("cancels a market with optional oracle and metadata payloads", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 11, status: "cancelled" },
    })

    const result = await actions.cancel({
      request: makeRequest({
        marketId: "11",
        totpCode: "123456",
        reason: "Underlying event was voided by the operator.",
        oracleSource: "incident_review",
        cancellationMetadata: '{"ticket":"INC-2041"}',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/markets/11/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Underlying event was voided by the operator.",
          oracle: {
            source: "incident_review",
          },
          metadata: {
            ticket: "INC-2041",
          },
          totpCode: "123456",
          breakGlassCode: null,
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      actionType: "cancel",
      marketId: "11",
    })
  })
})
