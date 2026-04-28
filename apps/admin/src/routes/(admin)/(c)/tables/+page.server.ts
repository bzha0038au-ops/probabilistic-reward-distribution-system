import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"

import { apiRequest } from "$lib/server/api"
import { loadTableMonitoringRealtimeState } from "./realtime"

const parseRequiredText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseSeatIndex = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return loadTableMonitoringRealtimeState(fetch, cookies)
}

export const actions: Actions = {
  forceTimeout: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const sourceKind = parseRequiredText(formData.get("sourceKind"))
    const tableId = parseRequiredText(formData.get("tableId"))
    const totpCode = parseRequiredText(formData.get("totpCode"))
    const reason = parseOptionalText(formData.get("reason"))

    if (!sourceKind || !tableId) {
      return fail(400, { error: "Missing table identifier." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/table-monitoring/${encodeURIComponent(sourceKind)}/${encodeURIComponent(tableId)}/force-timeout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode,
          reason: reason ?? undefined,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to force table timeout.",
      })
    }

    return { success: true }
  },
  closeTable: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const sourceKind = parseRequiredText(formData.get("sourceKind"))
    const tableId = parseRequiredText(formData.get("tableId"))
    const reason = parseRequiredText(formData.get("reason"))
    const totpCode = parseRequiredText(formData.get("totpCode"))

    if (!sourceKind || !tableId) {
      return fail(400, { error: "Missing table identifier." })
    }
    if (!reason) {
      return fail(400, { error: "Reason is required." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/table-monitoring/${encodeURIComponent(sourceKind)}/${encodeURIComponent(tableId)}/close`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode,
          reason,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to close table.",
      })
    }

    return { success: true }
  },
  kickSeat: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const sourceKind = parseRequiredText(formData.get("sourceKind"))
    const tableId = parseRequiredText(formData.get("tableId"))
    const reason = parseRequiredText(formData.get("reason"))
    const totpCode = parseRequiredText(formData.get("totpCode"))
    const seatIndex = parseSeatIndex(formData.get("seatIndex"))

    if (!sourceKind || !tableId) {
      return fail(400, { error: "Missing table identifier." })
    }
    if (seatIndex === null) {
      return fail(400, { error: "Missing seat identifier." })
    }
    if (!reason) {
      return fail(400, { error: "Reason is required." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/table-monitoring/${encodeURIComponent(sourceKind)}/${encodeURIComponent(tableId)}/seats/${seatIndex}/kick`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode,
          reason,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to kick seat.",
      })
    }

    return { success: true }
  },
}
