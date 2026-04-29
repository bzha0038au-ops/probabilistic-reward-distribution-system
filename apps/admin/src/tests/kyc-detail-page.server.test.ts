import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/kyc/[profileId]/+page.server"

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

describe("kyc detail page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the selected KYC profile detail", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        id: 12,
        userId: 7,
        userEmail: "kyc@example.com",
        currentTier: "tier_1",
        requestedTier: "tier_2",
        status: "pending",
        submissionVersion: 1,
        legalName: "Alex Example",
        documentType: "passport",
        documentNumberLast4: "1234",
        countryCode: "US",
        notes: null,
        rejectionReason: null,
        submittedData: { occupation: "tester" },
        riskFlags: [],
        freezeRecordId: null,
        reviewedByAdminId: null,
        submittedAt: "2026-04-28T01:00:00.000Z",
        reviewedAt: null,
        createdAt: "2026-04-28T01:00:00.000Z",
        updatedAt: "2026-04-28T01:00:00.000Z",
        hasActiveFreeze: false,
        documents: [],
        reviewEvents: [],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
      params: { profileId: "12" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/kyc-profiles/12",
    )
    expect(result).toMatchObject({
      detail: expect.objectContaining({
        id: 12,
        userId: 7,
        status: "pending",
      }),
      error: null,
    })
  })

  it("rejects the reject action when the reason is missing", async () => {
    const result = await actions.reject({
      request: makeRequest({ totpCode: "123456" }),
      fetch: vi.fn(),
      cookies: {},
      params: { profileId: "12" },
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Reject reason is required.", action: "reject" },
    })
  })

  it("calls the approve endpoint from the detail action", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 12, status: "approved" },
    })

    const result = await actions.approve({
      request: makeRequest({
        reason: "document set verified",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
      params: { profileId: "12" },
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/kyc-profiles/12/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "document set verified",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      action: "approve",
      message: "KYC profile approved.",
    })
  })

  it("calls the request-more-info endpoint from the detail action", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 12, status: "more_info_required" },
    })

    const result = await actions.requestMoreInfo({
      request: makeRequest({
        reason: "Need a clearer proof of address.",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
      params: { profileId: "12" },
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/kyc-profiles/12/request-more-info",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Need a clearer proof of address.",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      action: "requestMoreInfo",
      message: "KYC profile moved to more-info-required.",
    })
  })

  it("calls the request-reverification endpoint from the detail action", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 12, status: "more_info_required", currentTier: "tier_0" },
    })

    const result = await actions.requestReverification({
      request: makeRequest({
        reason: "Policy updated for expired identity documents.",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
      params: { profileId: "12" },
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/kyc-profiles/12/request-reverification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Policy updated for expired identity documents.",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      action: "requestReverification",
      message: "KYC reverification requested.",
    })
  })
})
