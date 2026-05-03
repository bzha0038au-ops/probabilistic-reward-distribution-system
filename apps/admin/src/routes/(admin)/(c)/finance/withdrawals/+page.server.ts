import type { Actions, PageServerLoad } from "./$types"

import { financePageActions, loadFinancePage } from "../page-server-support"

export const load: PageServerLoad = async (event) => loadFinancePage(event)

export const actions: Actions = financePageActions
