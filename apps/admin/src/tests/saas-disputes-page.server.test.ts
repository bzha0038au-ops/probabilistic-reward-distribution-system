import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions } from "../routes/(admin)/(b)/saas/disputes/+page.server"

const makeRequest = (entries: Record<string, string> = {}) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }

  return new Request("http://localhost/saas/disputes", {
    method: "POST",
    body: formData,
  })
}

describe("saas disputes page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects reviewDispute when break-glass code is missing", async () => {
    const result = await actions.reviewDispute({
      request: makeRequest({
        billingDisputeId: "9",
        totpCode: "123456",
        resolutionType: "partial_refund",
        approvedRefundAmount: "2.50",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Admin break-glass code is required." },
    })
  })

  it("forwards reviewDispute with MFA and break-glass", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 9, status: "resolved" },
    })

    const result = await actions.reviewDispute({
      request: makeRequest({
        billingDisputeId: "9",
        totpCode: "123456",
        breakGlassCode: "break-glass-secret",
        resolutionType: "partial_refund",
        approvedRefundAmount: "2.50",
        resolutionNotes: "reverse one mis-billed line item",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/disputes/9/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          breakGlassCode: "break-glass-secret",
          resolutionType: "partial_refund",
          approvedRefundAmount: "2.50",
          resolutionNotes: "reverse one mis-billed line item",
        }),
      },
    )
    expect(result).toEqual({ disputeReviewed: true })
  })
})
