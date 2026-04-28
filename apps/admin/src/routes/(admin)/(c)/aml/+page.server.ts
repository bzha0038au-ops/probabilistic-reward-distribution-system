import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { AmlHitPageSchema } from "@reward/shared-types/admin"

import { createTranslator, getMessages } from "$lib/i18n"
import { apiRequest } from "$lib/server/api"

const fallbackQueue = {
  items: [],
  page: 1,
  limit: 25,
  hasNext: false,
  summary: {
    pendingCount: 0,
    overdueCount: 0,
    slaMinutes: 60,
    oldestPendingAt: null,
  },
}

const parseRequiredId = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

export const load: PageServerLoad = async ({ fetch, cookies, url, locals }) => {
  const t = createTranslator(getMessages(locals?.locale ?? "en"))
  const params = new URLSearchParams()
  const limit = url.searchParams.get("limit")
  const page = url.searchParams.get("page")
  const sort = url.searchParams.get("sort")

  if (limit) params.set("limit", limit)
  if (page) params.set("page", page)
  if (sort === "asc" || sort === "desc") params.set("sort", sort)

  try {
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/aml-checks?${params.toString()}`,
    )

    if (!response.ok) {
      return {
        queue: fallbackQueue,
        error: response.error?.message ?? t("aml.errors.loadQueue"),
      }
    }

    const queue = AmlHitPageSchema.safeParse(response.data)

    return {
      queue: queue.success ? queue.data : fallbackQueue,
      error: queue.success
        ? null
        : t("aml.errors.unexpectedResponse"),
    }
  } catch (error) {
    return {
      queue: fallbackQueue,
      error:
        error instanceof Error
          ? error.message
          : t("aml.errors.loadQueue"),
    }
  }
}

const submitReviewAction = async (
  request: Request,
  fetch: typeof globalThis.fetch,
  cookies: { get: (key: string) => string | undefined },
  locale: "en" | "zh-CN" = "en",
  action: "clear" | "confirm" | "escalate",
) => {
  const t = createTranslator(getMessages(locale))
  const formData = await request.formData()
  const amlCheckId = parseRequiredId(formData.get("amlCheckId"))
  const totpCode = parseTotpCode(formData.get("totpCode"))
  const note = parseOptionalText(formData.get("note"))

  if (!amlCheckId) {
    return fail(400, { error: t("aml.errors.missingCheckId") })
  }
  if (!totpCode) {
    return fail(400, { error: t("aml.errors.mfaRequired") })
  }

  const response = await apiRequest(
    fetch,
    cookies,
    `/admin/aml-checks/${amlCheckId}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totpCode,
        note: note || undefined,
      }),
    },
  )

  if (!response.ok) {
    const fallbackError =
      action === "clear"
        ? t("aml.errors.clearFailed")
        : action === "confirm"
          ? t("aml.errors.confirmFailed")
          : t("aml.errors.escalateFailed")

    return fail(response.status, {
      error: response.error?.message ?? fallbackError,
    })
  }

  return { success: true, successAction: action }
}

export const actions: Actions = {
  clearHit: async ({ request, fetch, cookies, locals }) =>
    submitReviewAction(request, fetch, cookies, locals?.locale ?? "en", "clear"),
  confirmHit: async ({ request, fetch, cookies, locals }) =>
    submitReviewAction(
      request,
      fetch,
      cookies,
      locals?.locale ?? "en",
      "confirm",
    ),
  escalateHit: async ({ request, fetch, cookies, locals }) =>
    submitReviewAction(
      request,
      fetch,
      cookies,
      locals?.locale ?? "en",
      "escalate",
    ),
}
