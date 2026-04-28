import type { AppInstance } from "../types";

import { registerPortalSaasRoutes } from "./saas";

export async function registerPortalRoutes(app: AppInstance) {
  await registerPortalSaasRoutes(app);
}
