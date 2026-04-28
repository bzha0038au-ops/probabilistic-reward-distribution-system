import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { CollusionDashboardSchema } from "@reward/shared-types/admin"

import { apiRequest } from "$lib/server/api"

const fallbackDashboard = {
  windowDays: 14,
  seriesLimit: 8,
  topLimit: 10,
  generatedAt: new Date(0).toISOString(),
  userSeries: [],
  deviceSeries: [],
  sharedIpTop: [],
  sharedDeviceTop: [],
  frequentTablePairs: [],
}

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const readUserId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const buildDashboardPath = (url: URL) => {
  const params = new URLSearchParams()
  const days = url.searchParams.get("days")

  if (days) {
    params.set("days", days)
  }

  const queryString = params.toString()
  return `/admin/risk/collusion${queryString ? `?${queryString}` : ""}`
}

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  try {
    const response = await apiRequest(fetch, cookies, buildDashboardPath(url))
    if (!response.ok) {
      return {
        dashboard: fallbackDashboard,
        error: response.error?.message ?? "Failed to load collusion dashboard.",
      }
    }

    const dashboard = CollusionDashboardSchema.safeParse(response.data)
    return {
      dashboard: dashboard.success ? dashboard.data : fallbackDashboard,
      error: dashboard.success
        ? null
        : "Collusion dashboard returned an unexpected response.",
    }
  } catch (error) {
    return {
      dashboard: fallbackDashboard,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load collusion dashboard.",
    }
  }
}

export const actions: Actions = {
  createManualFlag: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const userId = readUserId(formData.get("userId"))
    const reason = formData.get("reason")?.toString().trim()
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!userId) {
      return fail(400, { error: "Missing user id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/risk/collusion/manual-flags",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reason: reason || undefined,
          totpCode,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to mark user.",
      })
    }

    return { success: true }
  },
  clearManualFlag: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const userId = readUserId(formData.get("userId"))
    const reason = formData.get("reason")?.toString().trim()
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!userId) {
      return fail(400, { error: "Missing user id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/risk/collusion/manual-flags/${userId}/clear`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason || undefined,
          totpCode,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to clear mark.",
      })
    }

    return { success: true }
  },
  freezeUser: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const userId = readUserId(formData.get("userId"))
    const totpCode = parseTotpCode(formData.get("totpCode"))

    if (!userId) {
      return fail(400, { error: "Missing user id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(fetch, cookies, "/admin/freeze-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        reason: "manual_admin",
        scope: "gameplay_lock",
        totpCode,
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to freeze user.",
      })
    }

    return { success: true }
  },
}
