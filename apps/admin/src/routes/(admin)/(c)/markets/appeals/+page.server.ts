import type { Actions, PageServerLoad } from "./$types"
import { loadMarketsPage, marketsPageActions } from "../page-server-support"

export const load: PageServerLoad = (event) => loadMarketsPage(event)
export const actions: Actions = marketsPageActions
