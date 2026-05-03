import type { Actions, PageServerLoad } from "./$types"

import { loadSecurityPage, securityPageActions } from "./page-server-support"

export const load: PageServerLoad = (event) => loadSecurityPage(event)
export const actions: Actions = securityPageActions
