import type { Actions, PageServerLoad } from "./$types"
import {
  loadTenantUsagePage,
  tenantUsagePageActions,
} from "./page-server-support"

export const load: PageServerLoad = (event) => loadTenantUsagePage(event)
export const actions: Actions = tenantUsagePageActions
