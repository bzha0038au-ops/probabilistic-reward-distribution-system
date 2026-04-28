import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { KycAdminDetailSchema } from "@reward/shared-types/kyc"

import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"

import { getKycCopy } from "../copy"

const parseProfileId = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

const parseOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const buildActionError = (status: number, error: string, action: string) =>
  fail(status, { error, action })

export const load: PageServerLoad = async ({
  fetch,
  cookies,
  params,
  locals,
}) => {
  const copy = getKycCopy(locals.locale)
  const profileId = parseProfileId(params.profileId)

  if (!profileId) {
    return {
      detail: null,
      error: copy.errors.invalidProfileId,
    }
  }

  try {
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/kyc-profiles/${profileId}`,
    )

    if (!response.ok) {
      return {
        detail: null,
        error: response.error?.message ?? copy.errors.loadDetail,
      }
    }

    const parsed = KycAdminDetailSchema.safeParse(response.data)
    if (!parsed.success) {
      captureAdminServerException(new Error(copy.errors.unexpectedData), {
        tags: {
          kind: "admin_kyc_detail_unexpected_response",
        },
      })

      return {
        detail: null,
        error: copy.errors.unexpectedData,
      }
    }

    return {
      detail: parsed.data,
      error: null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_kyc_detail_exception",
      },
    })

    return {
      detail: null,
      error: copy.errors.loadDetail,
    }
  }
}

const submitReviewAction = async (params: {
  request: Request
  fetch: typeof fetch
  cookies: { get: (key: string) => string | undefined }
  profileIdRaw: string
  locale: "en" | "zh-CN"
  path: string
  successMessage: string
  action: string
  requireReason?: boolean
}) => {
  const copy = getKycCopy(params.locale)
  const profileId = parseProfileId(params.profileIdRaw)
  if (!profileId) {
    return buildActionError(400, copy.errors.invalidProfileId, params.action)
  }

  const formData = await params.request.formData()
  const reason = parseOptionalString(formData.get("reason"))
  const stepUpPayload = parseAdminStepUpPayload(formData)
  const stepUpError = validateAdminStepUpPayload(stepUpPayload)
  if (stepUpError) {
    return buildActionError(400, stepUpError, params.action)
  }
  if (params.requireReason && !reason) {
    return buildActionError(
      400,
      copy.errors.rejectReasonRequired,
      params.action,
    )
  }

  const response = await apiRequest(
    params.fetch,
    params.cookies,
    `/admin/kyc-profiles/${profileId}${params.path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(reason ? { reason } : {}),
        totpCode: stepUpPayload.totpCode,
      }),
    },
  )

  if (!response.ok) {
    return buildActionError(
      response.status,
      response.error?.message ?? copy.errors.loadDetail,
      params.action,
    )
  }

  return {
    success: true,
    action: params.action,
    message: params.successMessage,
  }
}

export const actions: Actions = {
  approve: async ({ request, fetch, cookies, params, locals }) =>
    submitReviewAction({
      request,
      fetch,
      cookies,
      profileIdRaw: params.profileId,
      locale: locals.locale,
      path: "/approve",
      successMessage: getKycCopy(locals.locale).messages.approved,
      action: "approve",
    }),
  reject: async ({ request, fetch, cookies, params, locals }) =>
    submitReviewAction({
      request,
      fetch,
      cookies,
      profileIdRaw: params.profileId,
      locale: locals.locale,
      path: "/reject",
      successMessage: getKycCopy(locals.locale).messages.rejected,
      action: "reject",
      requireReason: true,
    }),
  requestMoreInfo: async ({ request, fetch, cookies, params, locals }) =>
    submitReviewAction({
      request,
      fetch,
      cookies,
      profileIdRaw: params.profileId,
      locale: locals.locale,
      path: "/request-more-info",
      successMessage: getKycCopy(locals.locale).messages.moreInfoRequested,
      action: "requestMoreInfo",
    }),
}
