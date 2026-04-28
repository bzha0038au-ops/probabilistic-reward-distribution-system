import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  CryptoDepositChannelRecordSchema,
  DepositRecordSchema,
  PaymentCapabilityOverviewSchema,
  WithdrawalRecordSchema,
} from "@reward/shared-types/finance"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"
import { financeActionPolicies } from "./action-policies"

const getActionT = (locale?: Parameters<typeof getMessages>[0]) =>
  createTranslator(getMessages(locale ?? "en"))

const buildStepUpMessages = (t: ReturnType<typeof createTranslator>) => ({
  totpRequired: t("saas.confirmDialog.mfaRequired"),
  breakGlassRequired: t("saas.confirmDialog.breakGlassRequired"),
})

const financeActionFail = (
  status: number,
  t: ReturnType<typeof createTranslator>,
  errorKey: string,
  extra: Record<string, unknown> = {},
) =>
  fail(status, {
    error: t(errorKey),
    ...extra,
  })

const financeResponseFail = (
  response: {
    status: number
    error?: { message?: string } | null
  },
  t: ReturnType<typeof createTranslator>,
  errorKey: string,
  extra: Record<string, unknown> = {},
) =>
  fail(response.status, {
    error: response.error?.message ?? t(errorKey),
    ...extra,
  })

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  const t = createTranslator(getMessages(locals.locale))

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

    if (!depositsRes.ok) {
      const errorMessage =
        depositsRes.error?.message ?? t("finance.errors.loadData")

      captureAdminServerException(new Error(errorMessage), {
        tags: {
          kind: "admin_finance_load_failure",
        },
        extra: {
          depositsStatus: depositsRes.status,
          withdrawalsStatus: withdrawalsRes.status,
        },
      })

      return {
        deposits: [],
        withdrawals: [],
        cryptoDepositChannels: [],
        paymentCapabilities: null,
        error: errorMessage,
      }
    }

    if (!withdrawalsRes.ok) {
      const errorMessage =
        withdrawalsRes.error?.message ?? t("finance.errors.loadData")

      captureAdminServerException(new Error(errorMessage), {
        tags: {
          kind: "admin_finance_load_failure",
        },
        extra: {
          depositsStatus: depositsRes.status,
          withdrawalsStatus: withdrawalsRes.status,
        },
      })

      return {
        deposits: [],
        withdrawals: [],
        cryptoDepositChannels: [],
        paymentCapabilities: null,
        error: errorMessage,
      }
    }

    const deposits = DepositRecordSchema.array().safeParse(
      depositsRes.data ?? [],
    )
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

    if (hasUnexpectedResponse) {
      captureAdminServerException(
        new Error(t("finance.errors.unexpectedResponse")),
        {
          tags: {
            kind: "admin_finance_load_unexpected_response",
          },
          extra: {
            depositsSchemaValid: deposits.success,
            withdrawalsSchemaValid: withdrawals.success,
            paymentCapabilitiesOk: paymentCapabilitiesRes.ok,
            cryptoDepositChannelsOk: cryptoDepositChannelsRes.ok,
            cryptoDepositChannelsSchemaValid:
              cryptoDepositChannels?.success ?? false,
          },
        },
      )
    }

    return {
      deposits: deposits.success ? deposits.data : [],
      withdrawals: withdrawals.success ? withdrawals.data : [],
      cryptoDepositChannels: cryptoDepositChannels?.success
        ? cryptoDepositChannels.data
        : [],
      paymentCapabilities: paymentCapabilities?.success
        ? paymentCapabilities.data
        : null,
      error: hasUnexpectedResponse
        ? t("finance.errors.unexpectedResponse")
        : null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_finance_load_exception",
      },
    })

    return {
      deposits: [],
      withdrawals: [],
      cryptoDepositChannels: [],
      paymentCapabilities: null,
      error: t("finance.errors.loadData"),
    }
  }
}

const parseId = (value: FormDataEntryValue | null) =>
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
  ...parseAdminStepUpPayload(formData),
  operatorNote: parseOptionalText(formData.get("operatorNote")),
  settlementReference: parseOptionalText(formData.get("settlementReference")),
  processingChannel: parseOptionalText(formData.get("processingChannel")),
  confirmations: parseOptionalInteger(formData.get("confirmations")),
})

const ensureFinanceMutationFields = (
  payload: ReturnType<typeof buildFinanceMutationPayload>,
  t: ReturnType<typeof createTranslator>,
  options: {
    requireBreakGlass?: boolean
    requireSettlementReference?: boolean
    requireProcessingChannel?: boolean
  } = {},
) => {
  if (!payload.operatorNote) {
    return t("finance.errors.operatorNoteRequired")
  }
  if (options.requireSettlementReference && !payload.settlementReference) {
    return t("finance.errors.settlementReferenceRequired")
  }
  if (options.requireProcessingChannel && !payload.processingChannel) {
    return t("finance.errors.processingChannelRequired")
  }
  const stepUpValidationError = validateAdminStepUpPayload(payload, {
    requireBreakGlass: options.requireBreakGlass,
    messages: buildStepUpMessages(t),
  })
  if (stepUpValidationError) {
    return stepUpValidationError
  }
  return null
}

export const actions: Actions = {
  createCryptoDepositChannel: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const chain = parseRequiredText(formData.get("chain"))
    const network = parseRequiredText(formData.get("network"))
    const token = parseRequiredText(formData.get("token"))
    const receiveAddress = parseRequiredText(formData.get("receiveAddress"))

    if (!chain || !network || !token || !receiveAddress) {
      return financeActionFail(
        400,
        t,
        "finance.errors.missingCryptoChannelFields",
        {
          financeChannelTab: "crypto",
        },
      )
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.createCryptoDepositChannel",
        {
          financeChannelTab: "crypto",
        },
      )
    }

    return { success: true, financeChannelTab: "crypto" }
  },
  markDepositProviderPending: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t)
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.sendDepositToProvider",
      )
    }

    return { success: true }
  },
  markDepositProviderSucceeded: async ({
    request,
    fetch,
    cookies,
    locals,
  }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.markDepositProviderSucceeded",
      )
    }

    return { success: true }
  },
  creditDeposit: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t)
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
      return financeResponseFail(response, t, "finance.errors.creditDeposit")
    }

    return { success: true }
  },
  markDepositProviderFailed: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t)
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.markDepositProviderFailed",
      )
    }

    return { success: true }
  },
  reverseDeposit: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(response, t, "finance.errors.reverseDeposit")
    }

    return { success: true }
  },
  confirmCryptoDeposit: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.confirmCryptoDeposit",
      )
    }

    return { success: true }
  },
  rejectCryptoDeposit: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingDepositId")
    }
    const validationError = ensureFinanceMutationFields(payload, t)
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.rejectCryptoDeposit",
      )
    }

    return { success: true }
  },
  approveWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
      requireBreakGlass:
        financeActionPolicies.approveWithdrawal.requireBreakGlass,
    })
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.approveWithdrawal",
      )
    }

    return { success: true }
  },
  rejectWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t)
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.rejectWithdrawal",
      )
    }

    return { success: true }
  },
  markWithdrawalProviderSubmitted: async ({
    request,
    fetch,
    cookies,
    locals,
  }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.markWithdrawalProviderSubmitted",
      )
    }

    return { success: true }
  },
  markWithdrawalProviderProcessing: async ({
    request,
    fetch,
    cookies,
    locals,
  }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.markWithdrawalProviderProcessing",
      )
    }

    return { success: true }
  },
  markWithdrawalProviderFailed: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.markWithdrawalProviderFailed",
      )
    }

    return { success: true }
  },
  payWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(response, t, "finance.errors.payWithdrawal")
    }

    return { success: true }
  },
  reverseWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.reverseWithdrawal",
      )
    }

    return { success: true }
  },
  submitCryptoWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.submitCryptoWithdrawal",
      )
    }

    return { success: true }
  },
  confirmCryptoWithdrawal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const id = parseId(formData.get("id"))
    const payload = buildFinanceMutationPayload(formData)

    if (!id) {
      return financeActionFail(400, t, "finance.errors.missingWithdrawalId")
    }
    const validationError = ensureFinanceMutationFields(payload, t, {
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
      return financeResponseFail(
        response,
        t,
        "finance.errors.confirmCryptoWithdrawal",
      )
    }

    return { success: true }
  },
}
