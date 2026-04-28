import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions } from "../routes/(admin)/(b)/saas/+page.server"

const makeRequest = (
  entries: Record<string, string> = {},
  url = "http://localhost/saas",
) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }

  return new Request(url, {
    method: "POST",
    body: formData,
  })
}

describe("saas page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects saveBilling when the break-glass code is missing", async () => {
    const result = await actions.saveBilling({
      request: makeRequest({
        tenantId: "7",
        totpCode: "123456",
        planCode: "growth",
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

  it("forwards saveBilling with MFA and break-glass", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { tenantId: 7, planCode: "growth" },
    })

    const result = await actions.saveBilling({
      request: makeRequest({
        tenantId: "7",
        totpCode: "123456",
        breakGlassCode: "break-glass-secret",
        planCode: "growth",
        collectionMethod: "charge_automatically",
        baseMonthlyFee: "199.00",
        drawFee: "0.1000",
        currency: "USD",
        autoBillingEnabled: "on",
        isBillable: "on",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/7/billing",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          breakGlassCode: "break-glass-secret",
          planCode: "growth",
          stripeCustomerId: null,
          collectionMethod: "charge_automatically",
          autoBillingEnabled: true,
          portalConfigurationId: null,
          baseMonthlyFee: "199.00",
          drawFee: "0.1000",
          decisionPricing: {
            reject: "0.0000",
            mute: "0.0000",
            payout: "0.0000",
          },
          currency: "USD",
          isBillable: true,
        }),
      },
    )
    expect(result).toEqual({ billingSaved: true })
  })

  it("forwards createTopUp with MFA and break-glass", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 18, tenantId: 7, amount: "250.00" },
    })

    const result = await actions.createTopUp({
      request: makeRequest({
        tenantId: "7",
        totpCode: "123456",
        breakGlassCode: "break-glass-secret",
        amount: "250.00",
        currency: "USD",
        note: "manual credit",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/7/top-ups",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: "123456",
          breakGlassCode: "break-glass-secret",
          amount: "250.00",
          currency: "USD",
          note: "manual credit",
        }),
      },
    )
    expect(result).toEqual({ topUpCreated: true })
  })

  it("submits tenant risk-envelope changes as change-request drafts", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        id: 31,
        status: "draft",
        summary: "SaaS 租户风险包络 #7：single<=25.00 / stop=on",
      },
    })

    const result = await actions.saveRiskEnvelope({
      request: makeRequest({
        tenantId: "7",
        dailyBudgetCap: "100.00",
        maxSinglePayout: "25.00",
        varianceCap: "8.00",
        emergencyStop: "on",
        reason: "cap tenant payout risk",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/7/risk-envelope/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyBudgetCap: "100.00",
          maxSinglePayout: "25.00",
          varianceCap: "8.00",
          emergencyStop: true,
          reason: "cap tenant payout risk",
        }),
      },
    )
    expect(result).toEqual({
      riskEnvelopeDraft: {
        id: 31,
        status: "draft",
        summary: "SaaS 租户风险包络 #7：single<=25.00 / stop=on",
      },
    })
  })

  it("redirects saveAgentControl back to the canonical saas page", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        id: 14,
        tenantId: 7,
        agentId: "qa-d3-alpha",
        mode: "blocked",
      },
    })

    await expect(
      actions.saveAgentControl({
        request: makeRequest(
          {
            tenantId: "7",
            agentId: "qa-d3-alpha",
            mode: "blocked",
            reason: "manual ui qa blocked",
          },
          "http://localhost/saas?/saveAgentControl",
        ),
        fetch: vi.fn(),
        cookies: {},
      } as never),
    ).rejects.toMatchObject({ status: 303, location: "/saas" })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/7/agent-controls",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "qa-d3-alpha",
          mode: "blocked",
          reason: "manual ui qa blocked",
          budgetMultiplier: undefined,
        }),
      },
    )
  })

  it("redirects deleteAgentControl back to the canonical saas page", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 14, tenantId: 7 },
    })

    await expect(
      actions.deleteAgentControl({
        request: makeRequest(
          {
            tenantId: "7",
            controlId: "14",
          },
          "http://localhost/saas?/deleteAgentControl",
        ),
        fetch: vi.fn(),
        cookies: {},
      } as never),
    ).rejects.toMatchObject({ status: 303, location: "/saas" })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/saas/tenants/7/agent-controls/14",
      {
        method: "DELETE",
      },
    )
  })
})
