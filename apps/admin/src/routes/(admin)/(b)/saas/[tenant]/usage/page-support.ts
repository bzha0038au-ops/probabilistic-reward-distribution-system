import type { SaasTenantUsageDashboard } from "@reward/shared-types/saas"

export interface PageData {
  usage: SaasTenantUsageDashboard | null
  error: string | null
}
