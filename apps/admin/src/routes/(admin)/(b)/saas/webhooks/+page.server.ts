import { actions as parentActions, load as parentLoad } from "../+page.server"

export const load = (...args: Parameters<typeof parentLoad>) =>
  parentLoad(...args)
export const actions = parentActions
