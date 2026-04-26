import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  CryptoDepositChannelRecordSchema,
  DepositRecordSchema,
  PaymentCapabilityOverviewSchema,
  WithdrawalRecordSchema,
} from "@reward/shared-types"

import { apiRequest } from "$lib/server/api"

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  try {
    const [
      depositsRes,
      withdrawalsRes,
      paymentCapabilitiesRes,
      cryptoDepositChannelsRes,
    ] = await Promise.all([
      apiRequest(fetch, cookies, "/admin/deposits"),
      apiRequest(fetch, cookies, "/admin/withdrawals"),
      apiRequest(fetch, cookies, "/admin/payment-capabilities"),
      apiRequest(fetch, cookies, "/admin/crypto-deposit-channels"),
    ])

    if (!depositsRes.ok || !withdrawalsRes.ok) {
      return {
        deposits: [],
        withdrawals: [],
        cryptoDepositChannels: [],
        paymentCapabilities: null,
        error: "Failed to load finance data.",
      }
    }

    const deposits = DepositRecordSchema.array().safeParse(depositsRes.data ?? [])
    const withdrawals = WithdrawalRecordSchema.array().safeParse(
      withdrawalsRes.data ?? [],
    )
    const paymentCapabilities = paymentCapabilitiesRes.ok
      ? PaymentCapabilityOverviewSchema.safeParse(
          paymentCapabilitiesRes.data ?? null,
        )
      : null
    const cryptoDepositChannels = cryptoDepositChannelsRes.ok
      ? CryptoDepositChannelRecordSchema.array().safeParse(
          cryptoDepositChannelsRes.data ?? [],
        )
      : null
    const hasUnexpectedResponse =
      !deposits.success ||
      !withdrawals.success ||
      !cryptoDepositChannelsRes.ok ||
      (cryptoDepositChannelsRes.ok && !cryptoDepositChannels?.success)

    return {
      deposits: deposits.success ? deposits.data : [],
      withdrawals: withdrawals.success ? withdrawals.data : [],
      cryptoDepositChannels: cryptoDepositChannels?.success
        ? cryptoDepositChannels.data
        : [],
      paymentCapabilities:
        paymentCapabilities?.success ? paymentCapabilities.data : null,
      error: hasUnexpectedResponse
        ? "Finance API returned an unexpected response."
        : null,
    }
  } catch (error) {
    return {
      deposits: [],
      withdrawals: [],
      cryptoDepositChannels: [],
      paymentCapabilities: null,
      error:
        error instanceof Error ? error.message : "Failed to load finance data.",
    }
  }
}

const parseId = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseRequiredText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalInteger = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
}

const parseCheckbox = (value: FormDataEntryValue | null) =>
  value === "on" || value === "true" || value === "1"

const buildFinanceMutationPayload = (formData: FormData) => ({
  totpCode: parseTotpCode(formData.get("totpCode")),
  operatorNote: parseOptionalText(formData.get("operatorNote")),
  settlementReference: parseOptionalText(formData.get("settlementReference")),
  processingChannel: parseOptionalText(formData.get("processingChannel")),
  confirmations: parseOptionalInteger(formData.get("confirmations")),
})

const ensureFinanceMutationFields = (
  payload: ReturnType<typeof buildFinanceMutationPayload>,
  options: {
    requireSettlementReference?: boolean
    requireProcessingChannel?: boolean
  } = {},
) => {
  if (!payload.totpCode) {
    return "Admin MFA code is required."
  }
  if (!payload.operatorNote) {
    return "Operator note is required."
  }
  if (options.requireSettlementReference && !payload.settlementReference) {
    return "Settlement reference is required."
  }
  if (options.requireProcessingChannel && !payload.processingChannel) {
    return "Processing channel is required."
  }
  return null
}

export const actions: Actions = {
  createCryptoDepositChannel: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const chain = parseRequiredText(formData.get("chain"))
    const network = parseRequiredText(formData.get("network"))
    const token = parseRequiredText(formData.get("token"))
    const receiveAddress = parseRequiredText(formData.get("receiveAddress"))

    if (!chain || !network || !token || !receiveAddress) {
      return fail(400, {
        error: "Chain, network, token, and receive address are required.",
        financeChannelTab: "crypto",
      })
    }

    const providerId = parseOptionalInteger(formData.get("providerId"))
    const payload = {
      providerId: providerId && providerId > 0 ? providerId : null,
      chain,
      network,
      token,
      receiveAddress,
      qrCodeUrl: parseOptionalText(formData.get("qrCodeUrl")),
      memoRequired: parseCheckbox(formData.get("memoRequired")),
      memoValue: parseOptionalText(formData.get("memoValue")),
      minConfirmations: parseOptionalInteger(formData.get("minConfirmations")),
      isActive: parseCheckbox(formData.get("isActive")),
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/crypto-deposit-channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? "Failed to create crypto deposit channel.",
        financeChannelTab: "crypto",
      })
    }

    return { success: true, financeChannelTab: "crypto" }
  },
  markDepositProviderPending: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/provider-pending`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to send deposit to provider.",
      })
    }

    return { success: true }
  },
  markDepositProviderSucceeded: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/provider-succeeded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? "Failed to mark deposit as provider succeeded.",
      })
    }

    return { success: true }
  },
  creditDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/credit`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to credit deposit.",
      })
    }

    return { success: true }
  },
  markDepositProviderFailed: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/provider-fail`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? "Failed to mark deposit as provider failed.",
      })
    }

    return { success: true }
  },
  reverseDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/reverse`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reverse deposit.",
      })
    }

    return { success: true }
  },
  confirmCryptoDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/crypto-confirm`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to confirm crypto deposit.",
      })
    }

    return { success: true }
  },
  rejectCryptoDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing deposit id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/crypto-reject`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reject crypto deposit.",
      })
    }

    return { success: true }
  },
  approveWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/approve`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to approve withdrawal.",
      })
    }

    return { success: true }
  },
  rejectWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload)
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/reject`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reject withdrawal.",
      })
    }

    return { success: true }
  },
  markWithdrawalProviderSubmitted: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/provider-submit`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to mark withdrawal as provider submitted.",
      })
    }

    return { success: true }
  },
  markWithdrawalProviderProcessing: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/provider-processing`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to mark withdrawal as provider processing.",
      })
    }

    return { success: true }
  },
  markWithdrawalProviderFailed: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/provider-fail`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to mark withdrawal as provider failed.",
      })
    }

    return { success: true }
  },
  payWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
      requireProcessingChannel: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/pay`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to pay withdrawal.",
      })
    }

    return { success: true }
  },
  reverseWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/reverse`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reverse withdrawal.",
      })
    }

    return { success: true }
  },
  submitCryptoWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/crypto-submit`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to submit crypto withdrawal.",
      })
    }

    return { success: true }
  },
  confirmCryptoWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return fail(400, { error: "Missing withdrawal id." })
    }
    const validationError = ensureFinanceMutationFields(payload, {
      requireSettlementReference: true,
      requireProcessingChannel: true,
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/crypto-confirm`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to confirm crypto withdrawal.",
      })
    }

    return { success: true }
  },
}
