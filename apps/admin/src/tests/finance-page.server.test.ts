import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/finance/+page.server"

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

describe("finance admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads deposits and withdrawals from the backend API", async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: [
          {
            id: 1,
            userId: 10,
            amount: "25.00",
            channelType: "fiat",
            assetType: "fiat",
            status: "requested",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          {
            id: 2,
            userId: 11,
            amount: "40.00",
            channelType: "fiat",
            assetType: "fiat",
            status: "approved",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          operatingMode: "manual_review",
          automatedExecutionEnabled: false,
          automatedExecutionReady: false,
          activeProviderCount: 1,
          configuredProviderAdapters: ["stripe"],
          registeredAdapterKeys: ["manual_review"],
          implementedAutomatedAdapters: [],
          missingCapabilities: ["outbound_gateway_execution"],
          activeProviderFlows: {
            deposit: true,
            withdrawal: true,
          },
          providerConfigGovernance: {
            adminEditableFields: ["isActive", "priority"],
            secretReferenceContainer: "secretRefs",
            secretReferenceFields: ["apiKey", "privateKey"],
            secretStorageRequirement: "secret_manager_or_kms",
            plaintextSecretStorageForbidden: true,
          },
          providerConfigIssues: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          {
            id: 12,
            providerId: 4,
            chain: "Ethereum",
            network: "ERC20",
            token: "USDT",
            receiveAddress: "0xabc123",
            qrCodeUrl: null,
            memoRequired: false,
            memoValue: null,
            minConfirmations: 12,
            isActive: true,
          },
        ],
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {},
      "/admin/deposits",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      "/admin/withdrawals",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      {},
      "/admin/payment-capabilities",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      4,
      expect.any(Function),
      {},
      "/admin/crypto-deposit-channels",
    )
    expect(result).toEqual({
      deposits: [
        {
          id: 1,
          userId: 10,
          amount: "25.00",
          channelType: "fiat",
          assetType: "fiat",
          status: "requested",
        },
      ],
      withdrawals: [
        {
          id: 2,
          userId: 11,
          amount: "40.00",
          channelType: "fiat",
          assetType: "fiat",
          status: "approved",
        },
      ],
      cryptoDepositChannels: [
        {
          id: 12,
          providerId: 4,
          chain: "Ethereum",
          network: "ERC20",
          token: "USDT",
          receiveAddress: "0xabc123",
          qrCodeUrl: null,
          memoRequired: false,
          memoValue: null,
          minConfirmations: 12,
          isActive: true,
        },
      ],
      paymentCapabilities: {
        operatingMode: "manual_review",
        automatedExecutionEnabled: false,
        automatedExecutionReady: false,
        activeProviderCount: 1,
        configuredProviderAdapters: ["stripe"],
        registeredAdapterKeys: ["manual_review"],
        implementedAutomatedAdapters: [],
        missingCapabilities: ["outbound_gateway_execution"],
        activeProviderFlows: {
          deposit: true,
          withdrawal: true,
        },
        providerConfigGovernance: {
          adminEditableFields: ["isActive", "priority"],
          secretReferenceContainer: "secretRefs",
          secretReferenceFields: ["apiKey", "privateKey"],
          secretStorageRequirement: "secret_manager_or_kms",
          plaintextSecretStorageForbidden: true,
        },
        providerConfigIssues: [],
      },
      error: null,
    })
  })

  it("creates a crypto deposit channel from the admin finance form", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 18, token: "USDT" },
    })

    const result = await actions.createCryptoDepositChannel({
      request: makeRequest({
        providerId: "7",
        chain: "Ethereum",
        network: "ERC20",
        token: "USDT",
        receiveAddress: "0xabc123",
        qrCodeUrl: "https://cdn.example.com/usdt.png",
        memoRequired: "on",
        memoValue: "92811",
        minConfirmations: "12",
        isActive: "on",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledTimes(1)
    const [, , path, init] = apiRequest.mock.calls[0]
    expect(path).toBe("/admin/crypto-deposit-channels")
    expect(JSON.parse(String(init?.body))).toEqual({
      providerId: 7,
      chain: "Ethereum",
      network: "ERC20",
      token: "USDT",
      receiveAddress: "0xabc123",
      qrCodeUrl: "https://cdn.example.com/usdt.png",
      memoRequired: true,
      memoValue: "92811",
      minConfirmations: 12,
      isActive: true,
    })
    expect(result).toEqual({ success: true, financeChannelTab: "crypto" })
  })

  it("returns an action failure when the deposit id is missing", async () => {
    const result = await actions.markDepositProviderPending({
      request: makeRequest(),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Missing deposit id." },
    })
  })

  it("calls the backend approval endpoint for a valid deposit id", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 5, status: "provider_pending" },
    })

    const result = await actions.markDepositProviderPending({
      request: makeRequest({
        id: "5",
        totpCode: "123456",
        processingChannel: "manual_bank",
        settlementReference: "dep-001",
        operatorNote: "receipt matched",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledTimes(1)
    const [, , path, init] = apiRequest.mock.calls[0]
    expect(path).toBe("/admin/deposits/5/provider-pending")
    expect(init).toMatchObject({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      confirmations: null,
      totpCode: "123456",
      processingChannel: "manual_bank",
      settlementReference: "dep-001",
      operatorNote: "receipt matched",
    })
    expect(result).toEqual({ success: true })
  })

  it("rejects withdrawal approval when the operator note is missing", async () => {
    const result = await actions.approveWithdrawal({
      request: makeRequest({
        id: "7",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Operator note is required." },
    })
  })

  it("rejects withdrawal provider submission when the settlement reference is missing", async () => {
    const result = await actions.markWithdrawalProviderSubmitted({
      request: makeRequest({
        id: "8",
        totpCode: "123456",
        operatorNote: "manual handoff started",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Settlement reference is required." },
    })
  })

  it("rejects withdrawal payout when the processing channel is missing", async () => {
    const result = await actions.payWithdrawal({
      request: makeRequest({
        id: "9",
        totpCode: "123456",
        settlementReference: "wd-001",
        operatorNote: "manual payout confirmed",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: { error: "Processing channel is required." },
    })
  })

  it("calls the backend payout endpoint when the withdrawal payload is complete", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 9, status: "paid" },
    })

    const result = await actions.payWithdrawal({
      request: makeRequest({
        id: "9",
        totpCode: "123456",
        processingChannel: "manual_bank",
        settlementReference: "wd-001",
        operatorNote: "manual payout confirmed",
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledTimes(1)
    const [, , path, init] = apiRequest.mock.calls[0]
    expect(path).toBe("/admin/withdrawals/9/pay")
    expect(JSON.parse(String(init?.body))).toEqual({
      confirmations: null,
      totpCode: "123456",
      processingChannel: "manual_bank",
      settlementReference: "wd-001",
      operatorNote: "manual payout confirmed",
    })
    expect(result).toEqual({ success: true })
  })
})
