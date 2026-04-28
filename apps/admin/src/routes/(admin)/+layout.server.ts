import { redirect } from "@sveltejs/kit"
import type { ReconciliationAlertSummary } from "@reward/shared-types/finance"
import type { LayoutServerLoad } from "./$types"

import {
  buildAdminNavGroups,
  canAccessAdminPath,
  resolveAdminDefaultRoute,
  resolveAdminScope,
} from "$lib/admin/access"
import { apiRequest } from "$lib/server/api"

export const load: LayoutServerLoad = async ({ locals, url, fetch, cookies }) => {
  const admin = locals.admin ?? null
  const defaultRoute = resolveAdminDefaultRoute(admin)
  let reconciliationAlertsSummary: ReconciliationAlertSummary | null = null

  if (admin && !canAccessAdminPath(admin, url.pathname)) {
    throw redirect(303, defaultRoute)
  }

  if (admin) {
    try {
      const response = await apiRequest<ReconciliationAlertSummary>(
        fetch,
        cookies,
        "/admin/engine/reconciliation-alerts/summary",
      )
      if (response.ok) {
        reconciliationAlertsSummary = response.data
      }
    } catch {
      reconciliationAlertsSummary = null
    }
  }

  return {
    admin,
    adminScope: resolveAdminScope(admin),
    defaultRoute,
    navGroups: buildAdminNavGroups(admin),
    reconciliationAlertsSummary,
  }
}
