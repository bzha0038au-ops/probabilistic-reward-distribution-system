import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(engine)/reconciliation/+page.server"

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

describe("reconciliation page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads reconciliation alerts from the backend API", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 1,
          userId: 42,
          userEmail: "alert@example.com",
          status: "open",
          deltaAmount: "12.50",
          ledgerSnapshot: {
            withdrawableBalance: "10.00",
            bonusBalance: "2.50",
            lockedBalance: "0.00",
            wageredAmount: "0.00",
            totalBalance: "12.50",
            latestLedgerEntryId: 88,
            metadata: {},
          },
          walletSnapshot: {
            withdrawableBalance: "0.00",
            bonusBalance: "0.00",
            lockedBalance: "0.00",
            wageredAmount: "0.00",
            totalBalance: "0.00",
            metadata: {},
          },
        },
      ],
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/engine/reconciliation-alerts",
    )
    expect(result).toEqual({
      alerts: [
        {
          id: 1,
          userId: 42,
          userEmail: "alert@example.com",
          status: "open",
          deltaAmount: "12.50",
          ledgerSnapshot: {
            withdrawableBalance: "10.00",
            bonusBalance: "2.50",
            lockedBalance: "0.00",
            wageredAmount: "0.00",
            totalBalance: "12.50",
            latestLedgerEntryId: 88,
            metadata: {},
          },
          walletSnapshot: {
            withdrawableBalance: "0.00",
            bonusBalance: "0.00",
            lockedBalance: "0.00",
            wageredAmount: "0.00",
            totalBalance: "0.00",
            metadata: {},
          },
        },
      ],
      error: null,
    })
  })

  it("updates alert status through the backend API", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 7, status: "resolved" },
    })

    const result = await actions.updateStatus({
      request: makeRequest({
        alertId: "7",
        status: "resolved",
        totpCode: "123456",
        operatorNote: "ledger backfill completed",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/engine/reconciliation-alerts/7/status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          totpCode: "123456",
          operatorNote: "ledger backfill completed",
        }),
      },
    )
    expect(result).toEqual({ success: true })
  })
})
