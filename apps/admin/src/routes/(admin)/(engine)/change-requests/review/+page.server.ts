import type { Actions, PageServerLoad } from "../$types"

import {
  controlCenterActions,
  loadControlCenterPage,
} from "../../(shared)/control-center/control-center"

export const load: PageServerLoad = async (event) =>
  loadControlCenterPage(event)

export const actions: Actions = controlCenterActions
