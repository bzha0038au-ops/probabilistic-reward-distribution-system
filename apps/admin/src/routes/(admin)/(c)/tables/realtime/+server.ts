import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

import { loadTableMonitoringRealtimeState } from "../realtime"

export const GET: RequestHandler = async ({ fetch, cookies }) => {
  return json(await loadTableMonitoringRealtimeState(fetch, cookies))
}
