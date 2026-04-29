import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(engine)/legal/+page.server"

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

describe("legal admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads legal overview, change requests, MFA status, and deletion queue", async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: { documents: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { changeRequests: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { mfaEnabled: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          pendingCount: 1,
          overdueCount: 0,
          completedCount: 2,
          items: [],
        },
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { admin: null },
    } as never)

    expect(apiRequest).toHaveBeenNthCalledWith(
      4,
      expect.any(Function),
      {},
      "/admin/legal/data-deletion-requests",
    )
    expect(result).toMatchObject({
      error: null,
      dataDeletionQueue: {
        pendingCount: 1,
        completedCount: 2,
      },
    })
  })

  it("posts approve payload with review notes and MFA", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 14, status: "completed" },
    })

    const result = await actions.approveDataDeletionRequest({
      request: makeRequest({
        requestId: "14",
        reviewNotes: "ledger retained, PII removed",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/legal/data-deletion-requests/14/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          breakGlassCode: null,
          reviewNotes: "ledger retained, PII removed",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })

  it("requires review notes when rejecting a deletion request", async () => {
    const result = await actions.rejectDataDeletionRequest({
      request: makeRequest({
        requestId: "14",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "Review notes are required when rejecting a request.",
      },
    })
  })
})
