import type { Actions, PageServerLoad } from "./$types"

import { tableMonitoringActions } from "../page-server-support"
import { loadTableMonitoringRealtimeState } from "../realtime"

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return loadTableMonitoringRealtimeState(fetch, cookies)
}

export const actions: Actions = tableMonitoringActions
