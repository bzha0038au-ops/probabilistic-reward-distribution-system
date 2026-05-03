import type { Actions, PageServerLoad } from "./$types"
import { economyPageActions, loadEconomyPage } from "./page-server-support"

export const load: PageServerLoad = (event) => loadEconomyPage(event)

export const actions: Actions = economyPageActions
