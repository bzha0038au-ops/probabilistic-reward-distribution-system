import type { Actions, PageServerLoad } from "./$types"

import { buildMissionActions, loadMissionsPage } from "./page-server-support"

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return loadMissionsPage(fetch, cookies)
}

export const actions: Actions = buildMissionActions("/missions")
