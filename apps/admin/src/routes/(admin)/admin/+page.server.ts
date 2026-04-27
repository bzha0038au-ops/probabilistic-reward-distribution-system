import { fail } from "@sveltejs/kit"
import type { Cookies } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"

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
        .filter((value): value is "deposit" | "withdrawal" =>
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

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  try {
    const [prizeRes, analyticsRes, controlRes, mfaStatusRes] = await Promise.all(
      [
        apiRequest(fetch, cookies, "/admin/prizes"),
        apiRequest(fetch, cookies, "/admin/analytics/summary"),
        apiRequest<ControlCenterResponse>(fetch, cookies, "/admin/control-center"),
        apiRequest(fetch, cookies, "/admin/mfa/status"),
      ],
    )

    if (!prizeRes.ok || !analyticsRes.ok || !controlRes.ok || !mfaStatusRes.ok) {
      return {
        admin: locals.admin ?? null,
        prizes: [],
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

export const actions: Actions = {
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
  configDraft: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()

    const payload = {
      poolBalance: toNumberString(formData.get("poolBalance")),
      drawCost: toNumberString(formData.get("drawCost")),
      weightJitterEnabled: formData.get("weightJitterEnabled") === "on",
      weightJitterPct: toNumberString(formData.get("weightJitterPct")),
      bonusAutoReleaseEnabled: formData.get("bonusAutoReleaseEnabled") === "on",
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
      profileSecurityRewardAmount: toNumberString(
        formData.get("profileSecurityRewardAmount"),
        "8",
      ),
      firstDrawRewardAmount: toNumberString(
        formData.get("firstDrawRewardAmount"),
        "3",
      ),
      drawStreakDailyRewardAmount: toNumberString(
        formData.get("drawStreakDailyRewardAmount"),
        "5",
      ),
      topUpStarterRewardAmount: toNumberString(
        formData.get("topUpStarterRewardAmount"),
        "10",
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
      blackjackDealerHitsSoft17:
        formData.get("blackjackDealerHitsSoft17") === "on",
      blackjackDoubleDownAllowed:
        formData.get("blackjackDoubleDownAllowed") === "on",
      blackjackSplitAcesAllowed:
        formData.get("blackjackSplitAcesAllowed") === "on",
      blackjackHitSplitAcesAllowed:
        formData.get("blackjackHitSplitAcesAllowed") === "on",
      blackjackResplitAllowed: formData.get("blackjackResplitAllowed") === "on",
      blackjackMaxSplitHands:
        parseOptionalNumber(formData.get("blackjackMaxSplitHands")) ?? 4,
      blackjackSplitTenValueCardsAllowed:
        formData.get("blackjackSplitTenValueCardsAllowed") === "on",
      reason: parseOptionalString(formData.get("changeReason")),
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
  },
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
    if (!providerId) {
      return fail(400, { error: "Missing payment provider id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/payment-providers/${providerId}/circuit-reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpCode }),
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
    const formData = await request.formData()
    const userId = formData.get("userId")?.toString().trim()
    const amount = formData.get("amount")?.toString().trim()
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!userId) {
      return fail(400, { error: "User id is required." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const payload = {
      userId: Number(userId),
      amount: amount ? amount : undefined,
      totpCode,
    }

    const response = await apiRequest(fetch, cookies, "/admin/bonus-release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to release bonus.",
      })
    }

    return { success: true }
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
}
