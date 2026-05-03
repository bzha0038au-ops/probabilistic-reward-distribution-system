import { fail } from "@sveltejs/kit"
import type { Action, Cookies, RequestEvent } from "@sveltejs/kit"

import { apiRequest } from "$lib/server/api"
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
} from "$lib/server/admin-session"

type ControlCenterResponse = {
  systemConfig: Record<string, unknown> | null
  providers: unknown[]
  changeRequests: unknown[]
}

type ControlCenterLoadEvent = {
  fetch: RequestEvent["fetch"]
  cookies: Cookies
  locals: App.Locals
}

const SYSTEM_CONFIG_STRING_FIELD_DEFAULTS = {
  poolBalance: "0",
  drawCost: "0",
  weightJitterPct: "0",
  bonusUnlockWagerRatio: "1",
  authFailureWindowMinutes: "15",
  authFailureFreezeThreshold: "8",
  adminFailureFreezeThreshold: "5",
  blackjackMinStake: "1",
  blackjackMaxStake: "100",
  blackjackWinPayoutMultiplier: "2",
  blackjackPushPayoutMultiplier: "1",
  blackjackNaturalPayoutMultiplier: "2.5",
} as const

const SYSTEM_CONFIG_BOOLEAN_FIELDS = [
  "maintenanceMode",
  "registrationEnabled",
  "loginEnabled",
  "drawEnabled",
  "paymentDepositEnabled",
  "paymentWithdrawEnabled",
  "antiAbuseAutoFreezeEnabled",
  "withdrawRiskNewCardFirstWithdrawalReviewEnabled",
  "weightJitterEnabled",
  "bonusAutoReleaseEnabled",
  "blackjackDealerHitsSoft17",
  "blackjackDoubleDownAllowed",
  "blackjackSplitAcesAllowed",
  "blackjackHitSplitAcesAllowed",
  "blackjackResplitAllowed",
  "blackjackSplitTenValueCardsAllowed",
] as const

const SYSTEM_CONFIG_INTEGER_FIELD_DEFAULTS = {
  blackjackMaxSplitHands: 4,
} as const

type SystemConfigStringField = keyof typeof SYSTEM_CONFIG_STRING_FIELD_DEFAULTS
type SystemConfigBooleanField = (typeof SYSTEM_CONFIG_BOOLEAN_FIELDS)[number]
type SystemConfigIntegerField =
  keyof typeof SYSTEM_CONFIG_INTEGER_FIELD_DEFAULTS

type SystemConfigDraftSelection = {
  stringFields: readonly SystemConfigStringField[]
  booleanFields: readonly SystemConfigBooleanField[]
  integerFields: readonly SystemConfigIntegerField[]
}

const FULL_SYSTEM_CONFIG_SELECTION = {
  stringFields: Object.keys(
    SYSTEM_CONFIG_STRING_FIELD_DEFAULTS,
  ) as SystemConfigStringField[],
  booleanFields: [...SYSTEM_CONFIG_BOOLEAN_FIELDS],
  integerFields: Object.keys(
    SYSTEM_CONFIG_INTEGER_FIELD_DEFAULTS,
  ) as SystemConfigIntegerField[],
} satisfies SystemConfigDraftSelection

const HIGH_RISK_SYSTEM_CONFIG_SELECTION = {
  stringFields: [
    "poolBalance",
    "drawCost",
    "weightJitterPct",
    "bonusUnlockWagerRatio",
    "authFailureWindowMinutes",
    "authFailureFreezeThreshold",
    "adminFailureFreezeThreshold",
  ],
  booleanFields: [
    "maintenanceMode",
    "registrationEnabled",
    "loginEnabled",
    "drawEnabled",
    "paymentDepositEnabled",
    "paymentWithdrawEnabled",
    "antiAbuseAutoFreezeEnabled",
    "withdrawRiskNewCardFirstWithdrawalReviewEnabled",
    "weightJitterEnabled",
    "bonusAutoReleaseEnabled",
  ],
  integerFields: [],
} satisfies SystemConfigDraftSelection

const BLACKJACK_SYSTEM_CONFIG_SELECTION = {
  stringFields: [
    "blackjackMinStake",
    "blackjackMaxStake",
    "blackjackWinPayoutMultiplier",
    "blackjackPushPayoutMultiplier",
    "blackjackNaturalPayoutMultiplier",
  ],
  booleanFields: [
    "blackjackDealerHitsSoft17",
    "blackjackDoubleDownAllowed",
    "blackjackSplitAcesAllowed",
    "blackjackHitSplitAcesAllowed",
    "blackjackResplitAllowed",
    "blackjackSplitTenValueCardsAllowed",
  ],
  integerFields: ["blackjackMaxSplitHands"],
} satisfies SystemConfigDraftSelection

const readConfigStringValue = (
  config: Record<string, unknown> | null,
  key: SystemConfigStringField,
) => {
  const value = config ? Reflect.get(config, key) : null
  if (value === null || value === undefined || value === "") {
    return SYSTEM_CONFIG_STRING_FIELD_DEFAULTS[key]
  }
  return String(value)
}

const readConfigBooleanValue = (
  config: Record<string, unknown> | null,
  key: SystemConfigBooleanField,
) => Boolean(config ? Reflect.get(config, key) : false)

const readConfigIntegerValue = (
  config: Record<string, unknown> | null,
  key: SystemConfigIntegerField,
) => {
  const value = config ? Reflect.get(config, key) : null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return SYSTEM_CONFIG_INTEGER_FIELD_DEFAULTS[key]
  }
  return Math.trunc(parsed)
}

const buildSystemConfigDraftPayload = (
  formData: FormData,
  currentConfig: Record<string, unknown> | null,
  selection: SystemConfigDraftSelection = FULL_SYSTEM_CONFIG_SELECTION,
) => {
  const nextStringValues = {
    poolBalance: toNumberString(formData.get("poolBalance")),
    drawCost: toNumberString(formData.get("drawCost")),
    weightJitterPct: toNumberString(formData.get("weightJitterPct")),
    bonusUnlockWagerRatio: toNumberString(
      formData.get("bonusUnlockWagerRatio"),
    ),
    authFailureWindowMinutes: toNumberString(
      formData.get("authFailureWindowMinutes"),
    ),
    authFailureFreezeThreshold: toNumberString(
      formData.get("authFailureFreezeThreshold"),
    ),
    adminFailureFreezeThreshold: toNumberString(
      formData.get("adminFailureFreezeThreshold"),
    ),
    blackjackMinStake: toNumberString(formData.get("blackjackMinStake"), "1"),
    blackjackMaxStake: toNumberString(formData.get("blackjackMaxStake"), "100"),
    blackjackWinPayoutMultiplier: toNumberString(
      formData.get("blackjackWinPayoutMultiplier"),
      "2",
    ),
    blackjackPushPayoutMultiplier: toNumberString(
      formData.get("blackjackPushPayoutMultiplier"),
      "1",
    ),
    blackjackNaturalPayoutMultiplier: toNumberString(
      formData.get("blackjackNaturalPayoutMultiplier"),
      "2.5",
    ),
  } satisfies Record<SystemConfigStringField, string>

  const nextBooleanValues = {
    maintenanceMode: formData.get("maintenanceMode") === "on",
    registrationEnabled: formData.get("registrationEnabled") === "on",
    loginEnabled: formData.get("loginEnabled") === "on",
    drawEnabled: formData.get("drawEnabled") === "on",
    paymentDepositEnabled: formData.get("paymentDepositEnabled") === "on",
    paymentWithdrawEnabled: formData.get("paymentWithdrawEnabled") === "on",
    antiAbuseAutoFreezeEnabled:
      formData.get("antiAbuseAutoFreezeEnabled") === "on",
    withdrawRiskNewCardFirstWithdrawalReviewEnabled:
      formData.get("withdrawRiskNewCardFirstWithdrawalReviewEnabled") === "on",
    weightJitterEnabled: formData.get("weightJitterEnabled") === "on",
    bonusAutoReleaseEnabled: formData.get("bonusAutoReleaseEnabled") === "on",
    blackjackDealerHitsSoft17:
      formData.get("blackjackDealerHitsSoft17") === "on",
    blackjackDoubleDownAllowed:
      formData.get("blackjackDoubleDownAllowed") === "on",
    blackjackSplitAcesAllowed:
      formData.get("blackjackSplitAcesAllowed") === "on",
    blackjackHitSplitAcesAllowed:
      formData.get("blackjackHitSplitAcesAllowed") === "on",
    blackjackResplitAllowed: formData.get("blackjackResplitAllowed") === "on",
    blackjackSplitTenValueCardsAllowed:
      formData.get("blackjackSplitTenValueCardsAllowed") === "on",
  } satisfies Record<SystemConfigBooleanField, boolean>

  const nextIntegerValues = {
    blackjackMaxSplitHands:
      parseOptionalNumber(formData.get("blackjackMaxSplitHands")) ?? 4,
  } satisfies Record<SystemConfigIntegerField, number>

  const payload: Record<string, string | number | boolean> = {}

  for (const key of selection.stringFields) {
    const nextValue = nextStringValues[key]
    if (nextValue !== readConfigStringValue(currentConfig, key)) {
      payload[key] = nextValue
    }
  }

  for (const key of selection.booleanFields) {
    const nextValue = nextBooleanValues[key]
    if (nextValue !== readConfigBooleanValue(currentConfig, key)) {
      payload[key] = nextValue
    }
  }

  for (const key of selection.integerFields) {
    const nextValue = nextIntegerValues[key]
    if (nextValue !== readConfigIntegerValue(currentConfig, key)) {
      payload[key] = nextValue
    }
  }

  return payload
}

const toNumberString = (value: FormDataEntryValue | null, fallback = "0") => {
  if (typeof value !== "string") return fallback
  return value.trim() === "" ? fallback : value
}

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const parseOptionalNumber = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseSupportedFlows = (formData: FormData) =>
  Array.from(
    new Set(
      formData
        .getAll("supportedFlows")
        .map((value) => value.toString())
        .filter(
          (value): value is "deposit" | "withdrawal" =>
            value === "deposit" || value === "withdrawal",
        ),
    ),
  )

const setAdminSessionCookie = (cookies: Cookies, token: string) => {
  cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
  })
}

const createConfigDraftAction = (
  selection: SystemConfigDraftSelection,
  noChangesMessage: string,
) => {
  const action: Action = async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const controlCenterResponse = await apiRequest<ControlCenterResponse>(
      fetch,
      cookies,
      "/admin/control-center",
    )

    if (!controlCenterResponse.ok) {
      return fail(controlCenterResponse.status, {
        error:
          controlCenterResponse.error?.message ??
          "Failed to load current config before creating draft.",
      })
    }

    const payload = buildSystemConfigDraftPayload(
      formData,
      controlCenterResponse.data?.systemConfig ?? null,
      selection,
    )
    const reason = parseOptionalString(formData.get("changeReason"))
    if (reason) {
      payload.reason = reason
    }
    if (Object.keys(payload).length === (reason ? 1 : 0)) {
      return fail(400, {
        error: noChangesMessage,
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/control-center/system-config/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to save config draft.",
      })
    }

    return { success: true }
  }

  return action
}

export const loadControlCenterPage = async ({
  fetch,
  cookies,
  locals,
}: ControlCenterLoadEvent) => {
  try {
    const [prizeRes, analyticsRes, controlRes, mfaStatusRes] =
      await Promise.all([
        apiRequest(fetch, cookies, "/admin/prizes"),
        apiRequest(fetch, cookies, "/admin/analytics/summary"),
        apiRequest<ControlCenterResponse>(
          fetch,
          cookies,
          "/admin/control-center",
        ),
        apiRequest(fetch, cookies, "/admin/mfa/status"),
      ])

    if (
      !prizeRes.ok ||
      !analyticsRes.ok ||
      !controlRes.ok ||
      !mfaStatusRes.ok
    ) {
      return {
        admin: locals.admin ?? null,
        prizes: [],
        legalDocuments: [],
        analytics: null,
        config: null,
        providers: [],
        changeRequests: [],
        mfaStatus: null,
        error: "Failed to load admin data.",
      }
    }

    return {
      admin: locals.admin ?? null,
      prizes: prizeRes.data ?? [],
      legalDocuments: [],
      analytics: analyticsRes.data ?? null,
      config: controlRes.data?.systemConfig ?? null,
      providers: controlRes.data?.providers ?? [],
      changeRequests: controlRes.data?.changeRequests ?? [],
      mfaStatus: mfaStatusRes.data ?? null,
      error: null,
    }
  } catch (error) {
    return {
      admin: locals.admin ?? null,
      prizes: [],
      legalDocuments: [],
      analytics: null,
      config: null,
      providers: [],
      changeRequests: [],
      mfaStatus: null,
      error:
        error instanceof Error ? error.message : "Failed to load admin data.",
    }
  }
}

export const controlCenterActions = {
  create: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()

    const payload = {
      name: formData.get("name")?.toString().trim() ?? "",
      stock: toNumberString(formData.get("stock")),
      weight: toNumberString(formData.get("weight"), "1"),
      poolThreshold: toNumberString(formData.get("poolThreshold")),
      userPoolThreshold: toNumberString(formData.get("userPoolThreshold")),
      rewardAmount: toNumberString(formData.get("rewardAmount")),
      payoutBudget: toNumberString(formData.get("payoutBudget")),
      payoutPeriodDays: toNumberString(formData.get("payoutPeriodDays"), "1"),
      isActive: formData.get("isActive") === "on",
    }

    if (!payload.name) {
      return fail(400, { error: "Prize name is required." })
    }

    const response = await apiRequest(fetch, cookies, "/admin/prizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to create prize.",
      })
    }

    return { success: true }
  },
  update: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = formData.get("id")?.toString()

    if (!id) {
      return fail(400, { error: "Missing prize id." })
    }

    const payload = {
      name: formData.get("name")?.toString().trim() ?? "",
      stock: toNumberString(formData.get("stock")),
      weight: toNumberString(formData.get("weight")),
      poolThreshold: toNumberString(formData.get("poolThreshold")),
      userPoolThreshold: toNumberString(formData.get("userPoolThreshold")),
      rewardAmount: toNumberString(formData.get("rewardAmount")),
      payoutBudget: toNumberString(formData.get("payoutBudget")),
      payoutPeriodDays: toNumberString(formData.get("payoutPeriodDays"), "1"),
    }

    const response = await apiRequest(fetch, cookies, `/admin/prizes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to update prize.",
      })
    }

    return { success: true }
  },
  toggle: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = formData.get("id")?.toString()

    if (!id) {
      return fail(400, { error: "Missing prize id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/prizes/${id}/toggle`,
      { method: "PATCH" },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to toggle prize.",
      })
    }

    return { success: true }
  },
  delete: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const id = formData.get("id")?.toString()

    if (!id) {
      return fail(400, { error: "Missing prize id." })
    }

    const response = await apiRequest(fetch, cookies, `/admin/prizes/${id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to delete prize.",
      })
    }

    return { success: true }
  },
  configDraft: createConfigDraftAction(
    FULL_SYSTEM_CONFIG_SELECTION,
    "No config changes detected.",
  ),
  configDraftHighRisk: createConfigDraftAction(
    HIGH_RISK_SYSTEM_CONFIG_SELECTION,
    "No high-risk config changes detected.",
  ),
  configDraftBlackjack: createConfigDraftAction(
    BLACKJACK_SYSTEM_CONFIG_SELECTION,
    "No blackjack rule changes detected.",
  ),
  providerDraft: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const priority = parseOptionalNumber(formData.get("priority"))
    if (priority === null) {
      return fail(400, { error: "Provider priority is required." })
    }

    const executionMode =
      formData.get("executionMode")?.toString() === "automated"
        ? "automated"
        : "manual"

    const payload = {
      providerId: parseOptionalNumber(formData.get("providerId")),
      name: formData.get("providerName")?.toString().trim() ?? "",
      providerType: formData.get("providerType")?.toString().trim() ?? "",
      priority,
      isActive: formData.get("providerIsActive") === "on",
      supportedFlows: parseSupportedFlows(formData),
      executionMode,
      adapter: parseOptionalString(formData.get("adapter")),
      reason: parseOptionalString(formData.get("providerReason")),
    }

    if (!payload.name || !payload.providerType) {
      return fail(400, { error: "Provider name and type are required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/control-center/payment-providers/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to save provider draft.",
      })
    }

    return { success: true }
  },
  submitChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parseOptionalNumber(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const payload = {
      confirmationText: parseOptionalString(formData.get("confirmationText")),
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to submit change request.",
      })
    }

    return { success: true }
  },
  approveChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parseOptionalNumber(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/approve`,
      {
        method: "POST",
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to approve change request.",
      })
    }

    return { success: true }
  },
  publishChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parseOptionalNumber(formData.get("requestId"))
    const totpCode = parseTotpCode(formData.get("totpCode"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const payload = {
      totpCode,
      confirmationText: parseOptionalString(formData.get("confirmationText")),
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to publish change request.",
      })
    }

    return { success: true }
  },
  rejectChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parseOptionalNumber(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const payload = {
      reason: parseOptionalString(formData.get("rejectReason")),
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reject change request.",
      })
    }

    return { success: true }
  },
  tripProviderCircuit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const providerId = parseOptionalNumber(formData.get("providerId"))
    const totpCode = parseTotpCode(formData.get("totpCode"))
    const reason = parseOptionalString(formData.get("circuitReason"))
    if (!providerId) {
      return fail(400, { error: "Missing payment provider id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }
    if (!reason) {
      return fail(400, { error: "Circuit breaker reason is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/payment-providers/${providerId}/circuit-break`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpCode, reason }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to trip payment provider circuit breaker.",
      })
    }

    return { success: true }
  },
  resetProviderCircuit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const providerId = parseOptionalNumber(formData.get("providerId"))
    const totpCode = parseTotpCode(formData.get("totpCode"))
    const reason = parseOptionalString(formData.get("resetReason"))
    if (!providerId) {
      return fail(400, { error: "Missing payment provider id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }
    if (!reason) {
      return fail(400, { error: "Reset reason is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/payment-providers/${providerId}/circuit-reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpCode, reason }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to reset payment provider circuit breaker.",
      })
    }

    return { success: true }
  },
  bonusRelease: async ({ request, fetch, cookies }) => {
    void request
    void fetch
    void cookies
    return fail(409, {
      error: "Legacy bonus release is disabled under the B luck economy model.",
    })
  },
  startMfaEnrollment: async ({ fetch, cookies }) => {
    const response = await apiRequest(fetch, cookies, "/admin/mfa/enrollment", {
      method: "POST",
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to start MFA enrollment.",
      })
    }

    return {
      mfaEnrollment: response.data,
    }
  },
  confirmMfaEnrollment: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const enrollmentToken =
      formData.get("enrollmentToken")?.toString().trim() ?? ""
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!enrollmentToken) {
      return fail(400, { error: "Missing MFA enrollment token." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest<{
      token?: string
      expiresAt?: number
      mfaEnabled?: boolean
      recoveryCodes?: string[]
      recoveryCodesRemaining?: number
    }>(fetch, cookies, "/admin/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollmentToken,
        totpCode,
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to enable MFA.",
      })
    }

    const token = response.data?.token
    if (!token) {
      return fail(500, { error: "Missing updated session token." })
    }

    setAdminSessionCookie(cookies, token)

    return {
      success: true,
      mfaEnabled: true,
      mfaRecoveryMode: "none",
      recoveryCodes: response.data?.recoveryCodes ?? [],
      recoveryCodesRemaining: response.data?.recoveryCodesRemaining ?? 0,
    }
  },
  regenerateRecoveryCodes: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest<{
      recoveryCodes?: string[]
      recoveryCodesRemaining?: number
    }>(fetch, cookies, "/admin/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpCode }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? "Failed to regenerate recovery codes.",
      })
    }

    return {
      success: true,
      recoveryCodes: response.data?.recoveryCodes ?? [],
      recoveryCodesRemaining: response.data?.recoveryCodesRemaining ?? 0,
    }
  },
  disableMfa: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const totpCode = parseTotpCode(formData.get("totpCode"))

    const response = await apiRequest<{
      token?: string
      expiresAt?: number
      mfaEnabled?: boolean
    }>(fetch, cookies, "/admin/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(totpCode ? { totpCode } : {}),
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to disable MFA.",
      })
    }

    const token = response.data?.token
    if (!token) {
      return fail(500, { error: "Missing updated session token." })
    }

    setAdminSessionCookie(cookies, token)

    return {
      success: true,
      mfaEnabled: false,
      mfaRecoveryMode: "none",
      recoveryCodes: [],
      recoveryCodesRemaining: 0,
    }
  },
} satisfies Record<string, Action>
