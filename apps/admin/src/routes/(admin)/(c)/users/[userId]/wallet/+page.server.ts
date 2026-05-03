import type { Actions, PageServerLoad } from "./$types"
import {
  loadUserDetailPage,
  userDetailPageActions,
} from "../page-server-support"

export const load: PageServerLoad = (event) => loadUserDetailPage(event)
export const actions: Actions = userDetailPageActions
