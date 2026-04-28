import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  ReconciliationAlertRecordSchema,
  reconciliationAlertStatusValues,
} from "@reward/shared-types/finance"

import { apiRequest } from "$lib/server/api"

const parseAlertId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

const parseRequiredText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseAlertStatus = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const status = value.trim()
  return reconciliationAlertStatusValues.includes(
    status as (typeof reconciliationAlertStatusValues)[number],
  )
    ? status
    : null
}

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  try {
    const alertsRes = await apiRequest(
      fetch,
      cookies,
      "/admin/engine/reconciliation-alerts",
    )

    if (!alertsRes.ok) {
      return {
        alerts: [],
        error:
          alertsRes.error?.message ?? "Failed to load reconciliation alerts.",
      }
    }

    const alerts = ReconciliationAlertRecordSchema.array().safeParse(
      alertsRes.data ?? [],
    )

    return {
      alerts: alerts.success ? alerts.data : [],
      error: alerts.success
        ? null
        : "Reconciliation alert API returned an unexpected response.",
    }
  } catch (error) {
    return {
      alerts: [],
      error:
        error instanceof Error
          ? error.message
          : "Failed to load reconciliation alerts.",
    }
  }
}

export const actions: Actions = {
  updateStatus: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const alertId = parseAlertId(formData.get("alertId"))
    const status = parseAlertStatus(formData.get("status"))
    const totpCode = parseRequiredText(formData.get("totpCode"))
    const operatorNote = parseRequiredText(formData.get("operatorNote"))

    if (!alertId) {
      return fail(400, { error: "Missing reconciliation alert id." })
    }
    if (!status) {
      return fail(400, { error: "Invalid reconciliation alert status." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }
    if (!operatorNote) {
      return fail(400, { error: "Operator note is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/engine/reconciliation-alerts/${alertId}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          totpCode,
          operatorNote,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ??
          "Failed to update reconciliation alert status.",
      })
    }

    return { success: true }
  },
}
