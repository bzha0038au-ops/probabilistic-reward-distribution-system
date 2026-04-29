import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import type { SaasOverview } from "@reward/shared-types/saas"

import { createTranslator, getMessages } from "$lib/i18n"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"
import { saasActionPolicies } from "../action-policies"

const getPageT = (locale?: Parameters<typeof getMessages>[0]) =>
  createTranslator(getMessages(locale ?? "en"))

const buildStepUpMessages = (t: ReturnType<typeof createTranslator>) => ({
  totpRequired: t("saas.confirmDialog.mfaRequired"),
  breakGlassRequired: t("saas.confirmDialog.breakGlassRequired"),
})

const parseOptionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const parsePositiveInt = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const failFromResponse = (
  response: {
    ok: boolean
    status: number
    error?: { message?: string } | null
  },
  fallbackMessage: string,
) =>
  fail(response.status, {
    error: response.error?.message ?? fallbackMessage,
  })

const getValidatedSaasActionStepUpPayload = (
  formData: FormData,
  t: ReturnType<typeof createTranslator>,
  actionName: keyof typeof saasActionPolicies,
) => {
  const stepUpPayload = parseAdminStepUpPayload(formData)
  const validationError = validateAdminStepUpPayload(stepUpPayload, {
    requireBreakGlass: saasActionPolicies[actionName].requireBreakGlass,
    messages: buildStepUpMessages(t),
  })
  return {
    stepUpPayload,
    validationError,
  }
}

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  const overview = await apiRequest<SaasOverview>(
    fetch,
    cookies,
    "/admin/saas/overview",
  )

  return {
    admin: locals.admin ?? null,
    overview: overview.ok ? overview.data : null,
    error: overview.ok
      ? null
      : (overview.error?.message ?? "Failed to load billing disputes."),
  }
}

export const actions: Actions = {
  reviewDispute: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "reviewBillingDispute")

    if (validationError) {
      return fail(400, { error: validationError })
    }

    const billingDisputeId = parsePositiveInt(formData.get("billingDisputeId"))
    if (!billingDisputeId) {
      return fail(400, { error: "Invalid billing dispute id." })
    }

    const resolutionType =
      formData.get("resolutionType")?.toString().trim() ?? "reject"
    const approvedRefundAmount = parseOptionalString(
      formData.get("approvedRefundAmount"),
    )
    const resolutionNotes = parseOptionalString(formData.get("resolutionNotes"))

    const response = await apiRequest(fetch, cookies, `/admin/saas/disputes/${billingDisputeId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...stepUpPayload,
        resolutionType,
        ...(approvedRefundAmount ? { approvedRefundAmount } : {}),
        resolutionNotes,
      }),
    })

    if (!response.ok) {
      return failFromResponse(response, "Failed to review billing dispute.")
    }

    return { disputeReviewed: true }
  },
}
