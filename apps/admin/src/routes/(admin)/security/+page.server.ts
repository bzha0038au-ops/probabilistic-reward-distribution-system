import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  CursorAuthEventPageSchema,
  FreezeRecordPageSchema,
} from "@reward/shared-types/admin"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"
import { securityActionPolicies } from "./action-policies"

const getActionT = (locale?: Parameters<typeof getMessages>[0]) =>
  createTranslator(getMessages(locale ?? "en"))

const buildStepUpMessages = (t: ReturnType<typeof createTranslator>) => ({
  totpRequired: t("saas.confirmDialog.mfaRequired"),
  breakGlassRequired: t("saas.confirmDialog.breakGlassRequired"),
})

const securityActionFail = (
  status: number,
  t: ReturnType<typeof createTranslator>,
  errorKey: string,
) =>
  fail(status, {
    error: t(errorKey),
  })

const securityResponseFail = (
  response: {
    status: number
    error?: { message?: string } | null
  },
  t: ReturnType<typeof createTranslator>,
  errorKey: string,
) =>
  fail(response.status, {
    error: response.error?.message ?? t(errorKey),
  })

const fallbackAuthEvents = {
  items: [],
  limit: 50,
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  prevCursor: null,
  direction: "next" as const,
  sort: "desc" as const,
}

const fallbackFreezeRecords = {
  items: [],
  page: 1,
  limit: 50,
  hasNext: false,
}

export const load: PageServerLoad = async ({ fetch, cookies, locals, url }) => {
  const t = createTranslator(getMessages(locals.locale))
  const params = new URLSearchParams()
  const email = url.searchParams.get("email")
  const eventType = url.searchParams.get("eventType")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const limit = url.searchParams.get("authLimit")
  const cursor = url.searchParams.get("authCursor")
  const direction = url.searchParams.get("authDirection")
  const sort = url.searchParams.get("authSort")

  if (email) params.set("email", email)
  if (eventType) params.set("eventType", eventType)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (limit) params.set("limit", limit)
  if (cursor) params.set("cursor", cursor)
  if (direction === "next" || direction === "prev")
    params.set("direction", direction)
  if (sort === "asc" || sort === "desc") params.set("sort", sort)

  try {
    const freezeParams = new URLSearchParams()
    const freezeLimit = url.searchParams.get("freezeLimit")
    const freezePage = url.searchParams.get("freezePage")
    const freezeSort = url.searchParams.get("freezeSort")
    if (freezeLimit) freezeParams.set("limit", freezeLimit)
    if (freezePage) freezeParams.set("page", freezePage)
    if (freezeSort === "asc" || freezeSort === "desc") {
      freezeParams.set("sort", freezeSort)
    }
    const [eventsRes, freezeRes] = await Promise.all([
      apiRequest(fetch, cookies, `/admin/auth-events?${params.toString()}`),
      apiRequest(
        fetch,
        cookies,
        `/admin/freeze-records?${freezeParams.toString()}`,
      ),
    ])

    if (!eventsRes.ok || !freezeRes.ok) {
      const errorMessage = !eventsRes.ok
        ? eventsRes.error?.message
        : !freezeRes.ok
          ? freezeRes.error?.message
          : t("security.errors.loadData")

      captureAdminServerException(new Error(errorMessage), {
        tags: {
          kind: "admin_security_load_failure",
        },
        extra: {
          authEventsStatus: eventsRes.status,
          freezeRecordsStatus: freezeRes.status,
        },
      })

      return {
        authEvents: fallbackAuthEvents,
        freezeRecords: fallbackFreezeRecords,
        error: errorMessage ?? t("security.errors.loadData"),
      }
    }

    const authEvents = CursorAuthEventPageSchema.safeParse(eventsRes.data)
    const freezeRecords = FreezeRecordPageSchema.safeParse(freezeRes.data)

    if (!authEvents.success || !freezeRecords.success) {
      captureAdminServerException(
        new Error(t("security.errors.unexpectedResponse")),
        {
          tags: {
            kind: "admin_security_load_unexpected_response",
          },
          extra: {
            authEventsSchemaValid: authEvents.success,
            freezeRecordsSchemaValid: freezeRecords.success,
          },
        },
      )
    }

    return {
      authEvents: authEvents.success ? authEvents.data : fallbackAuthEvents,
      freezeRecords: freezeRecords.success
        ? freezeRecords.data
        : fallbackFreezeRecords,
      error:
        authEvents.success && freezeRecords.success
          ? null
          : t("security.errors.unexpectedResponse"),
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_security_load_exception",
      },
    })

    return {
      authEvents: fallbackAuthEvents,
      freezeRecords: fallbackFreezeRecords,
      error: t("security.errors.loadData"),
    }
  }
}

export const actions: Actions = {
  releaseFreeze: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const freezeRecordId = formData.get("freezeRecordId")?.toString().trim()
    const stepUpPayload = parseAdminStepUpPayload(formData)

    if (!freezeRecordId) {
      return securityActionFail(
        400,
        t,
        "security.errors.missingFreezeRecordId",
      )
    }
    const validationError = validateAdminStepUpPayload(stepUpPayload, {
      messages: buildStepUpMessages(t),
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/freeze-records/${freezeRecordId}/release`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stepUpPayload),
      },
    )

    if (!response.ok) {
      return securityResponseFail(response, t, "security.errors.releaseFreeze")
    }

    return { success: true }
  },
  createFreeze: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const userId = formData.get("userId")?.toString().trim()
    const reason = formData.get("reason")?.toString().trim() || "manual_admin"
    const scope = formData.get("scope")?.toString().trim() || "account_lock"
    const stepUpPayload = parseAdminStepUpPayload(formData)

    if (!userId) {
      return securityActionFail(400, t, "security.errors.missingUserId")
    }
    const validationError = validateAdminStepUpPayload(stepUpPayload, {
      requireBreakGlass: securityActionPolicies.createFreeze.requireBreakGlass,
      messages: buildStepUpMessages(t),
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await apiRequest(fetch, cookies, "/admin/freeze-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: Number(userId),
        reason,
        scope,
        ...stepUpPayload,
      }),
    })

    if (!response.ok) {
      return securityResponseFail(response, t, "security.errors.freezeAccount")
    }

    return { success: true }
  },
}
