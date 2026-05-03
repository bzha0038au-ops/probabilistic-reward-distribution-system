import { fail } from "@sveltejs/kit"
import type { RequestEvent } from "@sveltejs/kit"

import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"
import type { EconomyOverview } from "./page-support"

type EconomyLoadEvent = Pick<RequestEvent, "fetch" | "cookies">
type EconomyActionEvent = Pick<RequestEvent, "request" | "fetch" | "cookies">

const parseRequiredText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parsePositiveInt = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const invalidForm = (message: string) => fail(400, { error: message })

export const loadEconomyPage = async ({ fetch, cookies }: EconomyLoadEvent) => {
  try {
    const response = await apiRequest<EconomyOverview>(
      fetch,
      cookies,
      "/admin/economy/overview",
    )

    if (!response.ok) {
      return {
        overview: null,
        error: response.error?.message ?? "Failed to load economy dashboard.",
      }
    }

    return {
      overview: response.data,
      error: null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_economy_load_exception",
      },
    })

    return {
      overview: null,
      error: "Failed to load economy dashboard.",
    }
  }
}

export const economyPageActions = {
  replayFulfillment: async ({
    request,
    fetch,
    cookies,
  }: EconomyActionEvent) => {
    const formData = await request.formData()
    const orderId = parsePositiveInt(formData.get("orderId"))
    const stepUp = parseAdminStepUpPayload(formData)
    if (!orderId) {
      return invalidForm("Invalid order id.")
    }
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return invalidForm(stepUpError)
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/economy/orders/${orderId}/replay-fulfillment`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          totpCode: stepUp.totpCode,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to replay store purchase fulfillment.",
      })
    }

    return {
      success: `Order #${orderId} fulfillment replayed.`,
    }
  },

  reverseOrder: async ({ request, fetch, cookies }: EconomyActionEvent) => {
    const formData = await request.formData()
    const orderId = parsePositiveInt(formData.get("orderId"))
    const targetStatus = parseRequiredText(formData.get("targetStatus"))
    const reason = parseRequiredText(formData.get("reason"))
    const stepUp = parseAdminStepUpPayload(formData)

    if (
      !orderId ||
      (targetStatus !== "refunded" && targetStatus !== "revoked") ||
      !reason
    ) {
      return invalidForm("Order id, reverse status, and reason are required.")
    }
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return invalidForm(stepUpError)
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/economy/orders/${orderId}/reverse`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          totpCode: stepUp.totpCode,
          targetStatus,
          reason,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? "Failed to reverse store purchase order.",
      })
    }

    return {
      success: `Order #${orderId} marked ${targetStatus}.`,
    }
  },

  adjustAsset: async ({ request, fetch, cookies }: EconomyActionEvent) => {
    const formData = await request.formData()
    const userId = parsePositiveInt(formData.get("userId"))
    const assetCode = parseRequiredText(formData.get("assetCode"))
    const direction = parseRequiredText(formData.get("direction"))
    const amount = parseRequiredText(formData.get("amount"))
    const reason = parseRequiredText(formData.get("reason"))
    const stepUp = parseAdminStepUpPayload(formData)

    if (
      !userId ||
      (assetCode !== "B_LUCK" && assetCode !== "IAP_VOUCHER") ||
      (direction !== "credit" && direction !== "debit") ||
      !amount ||
      !reason
    ) {
      return invalidForm(
        "User, asset, direction, amount, and reason are required.",
      )
    }
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return invalidForm(stepUpError)
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/economy/adjustments",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId,
          assetCode,
          direction,
          amount,
          reason,
          totpCode: stepUp.totpCode,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to create asset adjustment.",
      })
    }

    return {
      success: `Manual ${direction} recorded for user #${userId}.`,
    }
  },

  freezeGift: async ({ request, fetch, cookies }: EconomyActionEvent) => {
    const formData = await request.formData()
    const userId = parsePositiveInt(formData.get("userId"))
    const reason = parseOptionalText(formData.get("reason")) ?? "manual_admin"
    const stepUp = parseAdminStepUpPayload(formData)

    if (!userId) {
      return invalidForm("User id is required.")
    }
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return invalidForm(stepUpError)
    }

    const response = await apiRequest(fetch, cookies, "/admin/freeze-records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId,
        category: "operations",
        reason: "manual_admin",
        scope: "gift_lock",
        totpCode: stepUp.totpCode,
        metadata: {
          note: reason,
        },
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to freeze gift capability.",
      })
    }

    return {
      success: `Gift capability frozen for user #${userId}.`,
    }
  },

  releaseGiftFreeze: async ({
    request,
    fetch,
    cookies,
  }: EconomyActionEvent) => {
    const formData = await request.formData()
    const freezeRecordId = parsePositiveInt(formData.get("freezeRecordId"))
    const reason = parseOptionalText(formData.get("reason"))
    const stepUp = parseAdminStepUpPayload(formData)

    if (!freezeRecordId) {
      return invalidForm("Freeze record id is required.")
    }
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return invalidForm(stepUpError)
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/freeze-records/${freezeRecordId}/release`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason,
          totpCode: stepUp.totpCode,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to release gift freeze.",
      })
    }

    return {
      success: `Gift freeze #${freezeRecordId} released.`,
    }
  },
}
