import { fail } from "@sveltejs/kit"
import type { RequestEvent } from "@sveltejs/kit"
import type { SaasTenantUsageDashboard } from "@reward/shared-types/saas"

import { apiRequest } from "$lib/server/api"

type UsageLoadEvent = Pick<
  RequestEvent,
  "fetch" | "cookies" | "locals" | "params"
>
type UsageActionEvent = Pick<RequestEvent, "request" | "fetch" | "cookies">

const toNumberString = (value: FormDataEntryValue | null, fallback = "0") => {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed === "" ? fallback : trimmed
}

const parseOptionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
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

export const loadTenantUsagePage = async ({
  fetch,
  cookies,
  locals,
  params,
}: UsageLoadEvent) => {
  const tenantSlug = params.tenant?.trim()
  if (!tenantSlug) {
    return {
      admin: locals.admin ?? null,
      usage: null,
      error: "Missing tenant slug.",
    }
  }

  const usage = await apiRequest<SaasTenantUsageDashboard>(
    fetch,
    cookies,
    `/admin/saas/tenants/by-slug/${encodeURIComponent(tenantSlug)}/usage`,
  )

  return {
    admin: locals.admin ?? null,
    usage: usage.ok ? usage.data : null,
    error: usage.ok
      ? null
      : (usage.error?.message ?? "Failed to load tenant usage."),
  }
}

export const tenantUsagePageActions = {
  saveAlertThresholdDraft: async ({
    request,
    fetch,
    cookies,
  }: UsageActionEvent) => {
    const formData = await request.formData()
    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/control-center/system-config/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saasUsageAlertMaxMinuteQps: toNumberString(
            formData.get("saasUsageAlertMaxMinuteQps"),
          ),
          saasUsageAlertMaxSinglePayoutAmount: toNumberString(
            formData.get("saasUsageAlertMaxSinglePayoutAmount"),
          ),
          saasUsageAlertMaxAntiExploitRatePct: toNumberString(
            formData.get("saasUsageAlertMaxAntiExploitRatePct"),
          ),
          reason: parseOptionalString(formData.get("reason")),
        }),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to save alert threshold draft.")
    }

    return { thresholdDraftCreated: true }
  },
}
