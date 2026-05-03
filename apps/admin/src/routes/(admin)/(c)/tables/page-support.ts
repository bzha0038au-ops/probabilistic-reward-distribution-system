import type { TableMonitoringSnapshot } from "@reward/shared-types/table-monitoring"

export interface PageData {
  snapshot: TableMonitoringSnapshot
  wsUrl: string
  error: string | null
}
