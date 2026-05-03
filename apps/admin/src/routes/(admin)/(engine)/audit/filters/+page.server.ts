import type { PageServerLoad } from "../$types"
import { loadAuditPage } from "../page-server-support"

export const load: PageServerLoad = (event) => loadAuditPage(event)
