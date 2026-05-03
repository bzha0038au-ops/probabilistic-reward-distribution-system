import { fail } from "@sveltejs/kit"
import type { RequestEvent } from "@sveltejs/kit"
import { AdminUserDetailSchema } from "@reward/shared-types/admin"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"

type UserDetailLoadEvent = Pick<
  RequestEvent,
  "fetch" | "cookies" | "params" | "locals"
>
type UserDetailActionEvent = Pick<
  RequestEvent,
  "request" | "fetch" | "cookies" | "params" | "locals"
>

const parseUserId = (value: string | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

const parseOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const buildActionError = (
  status: number,
  errorMessage: string,
  action: string,
) =>
  fail(status, {
    error: errorMessage,
    action,
  })

export const loadUserDetailPage = async ({
  fetch,
  cookies,
  params,
  locals,
}: UserDetailLoadEvent) => {
  const t = createTranslator(getMessages(locals.locale ?? "en"))
  const userId = parseUserId(params.userId)

  if (!userId) {
    return {
      detail: null,
      error: t("users.errors.invalidUserId"),
    }
  }

  try {
    const response = await apiRequest(fetch, cookies, `/admin/users/${userId}`)
    if (!response.ok) {
      return {
        detail: null,
        error: response.error?.message ?? t("users.errors.loadDetail"),
      }
    }

    const parsed = AdminUserDetailSchema.safeParse(response.data)
    if (!parsed.success) {
      captureAdminServerException(new Error(t("users.errors.unexpectedData")), {
        tags: {
          kind: "admin_user_detail_unexpected_response",
        },
      })

      return {
        detail: null,
        error: t("users.errors.unexpectedData"),
      }
    }

    return {
      detail: parsed.data,
      error: null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_user_detail_exception",
      },
    })

    return {
      detail: null,
      error: t("users.errors.loadDetail"),
    }
  }
}

export const userDetailPageActions = {
  freezeScope: async ({
    request,
    fetch,
    cookies,
    params,
    locals,
  }: UserDetailActionEvent) => {
    const t = createTranslator(getMessages(locals.locale ?? "en"))
    const userId = parseUserId(params.userId)
    if (!userId) {
      return buildActionError(400, t("users.errors.invalidUserId"), "freeze")
    }

    const formData = await request.formData()
    const stepUp = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return buildActionError(400, stepUpError, "freeze")
    }

    const scope = parseOptionalString(formData.get("scope"))
    const category = parseOptionalString(formData.get("category"))
    const reason = parseOptionalString(formData.get("reason"))
    if (!scope || !category || !reason) {
      return buildActionError(400, t("users.errors.freezeFields"), "freeze")
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users/${userId}/freeze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stepUp,
          scope,
          category,
          reason,
        }),
      },
    )

    if (!response.ok) {
      return buildActionError(
        response.status,
        response.error?.message ?? t("users.errors.freezeFailed"),
        "freeze",
      )
    }

    return {
      success: true,
      action: "freeze",
      message: t("users.actions.freezeSuccess"),
    }
  },
  unfreezeScope: async ({
    request,
    fetch,
    cookies,
    params,
    locals,
  }: UserDetailActionEvent) => {
    const t = createTranslator(getMessages(locals.locale ?? "en"))
    const userId = parseUserId(params.userId)
    if (!userId) {
      return buildActionError(400, t("users.errors.invalidUserId"), "unfreeze")
    }

    const formData = await request.formData()
    const stepUp = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return buildActionError(400, stepUpError, "unfreeze")
    }

    const scope = parseOptionalString(formData.get("scope"))
    if (!scope) {
      return buildActionError(400, t("users.errors.scopeRequired"), "unfreeze")
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users/${userId}/unfreeze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stepUp,
          scope,
          reason: parseOptionalString(formData.get("releaseReason")),
        }),
      },
    )

    if (!response.ok) {
      return buildActionError(
        response.status,
        response.error?.message ?? t("users.errors.unfreezeFailed"),
        "unfreeze",
      )
    }

    return {
      success: true,
      action: "unfreeze",
      message: t("users.actions.unfreezeSuccess"),
    }
  },
  forceLogout: async ({
    request,
    fetch,
    cookies,
    params,
    locals,
  }: UserDetailActionEvent) => {
    const t = createTranslator(getMessages(locals.locale ?? "en"))
    const userId = parseUserId(params.userId)
    if (!userId) {
      return buildActionError(400, t("users.errors.invalidUserId"), "logout")
    }

    const formData = await request.formData()
    const stepUp = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return buildActionError(400, stepUpError, "logout")
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users/${userId}/force-logout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stepUp),
      },
    )

    if (!response.ok) {
      return buildActionError(
        response.status,
        response.error?.message ?? t("users.errors.forceLogoutFailed"),
        "logout",
      )
    }

    return {
      success: true,
      action: "logout",
      message: t("users.actions.forceLogoutSuccess"),
    }
  },
  resetPassword: async ({
    request,
    fetch,
    cookies,
    params,
    locals,
  }: UserDetailActionEvent) => {
    const t = createTranslator(getMessages(locals.locale ?? "en"))
    const userId = parseUserId(params.userId)
    if (!userId) {
      return buildActionError(400, t("users.errors.invalidUserId"), "reset")
    }

    const formData = await request.formData()
    const stepUp = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUp)
    if (stepUpError) {
      return buildActionError(400, stepUpError, "reset")
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users/${userId}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stepUp),
      },
    )

    if (!response.ok) {
      return buildActionError(
        response.status,
        response.error?.message ?? t("users.errors.resetPasswordFailed"),
        "reset",
      )
    }

    return {
      success: true,
      action: "reset",
      message: t("users.actions.resetPasswordSuccess"),
    }
  },
}
