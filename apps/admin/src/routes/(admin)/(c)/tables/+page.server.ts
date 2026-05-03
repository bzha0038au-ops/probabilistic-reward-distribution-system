import type { Actions, PageServerLoad } from "./$types"

import { loadTableMonitoringRealtimeState } from "./realtime"
import { tableMonitoringActions } from "./page-server-support"

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return loadTableMonitoringRealtimeState(fetch, cookies)
}

export const actions: Actions = tableMonitoringActions
