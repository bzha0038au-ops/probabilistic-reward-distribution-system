import type { Actions, PageServerLoad } from "./$types"
import { kycDetailPageActions, loadKycDetailPage } from "./page-server-support"

export const load: PageServerLoad = (event) => loadKycDetailPage(event)
export const actions: Actions = kycDetailPageActions
