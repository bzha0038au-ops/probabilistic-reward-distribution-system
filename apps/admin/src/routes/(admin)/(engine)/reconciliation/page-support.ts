import type {
  ReconciliationAlertRecord,
  ReconciliationAlertStatus,
} from "@reward/shared-types/finance"

export interface ReconciliationAlertsSummary {
  openCount: number
  acknowledgedCount: number
  requireEngineeringCount: number
  resolvedCount: number
  unresolvedCount: number
}

export interface PageData {
  alerts: ReconciliationAlertRecord[]
  reconciliationAlertsSummary?: ReconciliationAlertsSummary | null
  error: string | null
}

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "—"
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString()
}

export const formatMoney = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return "—"
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value
}

export const statusBadgeClass = (status: ReconciliationAlertStatus) => {
  if (status === "resolved") return "badge-success"
  if (status === "acknowledged") return "badge-info"
  if (status === "require_engineering") return "badge-error"
  return "badge-warning"
}

export const statusLabelKey = (status: ReconciliationAlertStatus) => {
  if (status === "resolved") return "engine.status.resolved"
  if (status === "acknowledged") return "engine.status.acknowledged"
  if (status === "require_engineering") return "engine.status.requireEngineering"
  return "engine.status.open"
}

export const snapshotRows = (
  snapshot: ReconciliationAlertRecord["ledgerSnapshot"],
) => [
  {
    labelKey: "engine.snapshot.withdrawable",
    value: snapshot.withdrawableBalance,
  },
  {
    labelKey: "engine.snapshot.bonus",
    value: snapshot.bonusBalance,
  },
  {
    labelKey: "engine.snapshot.locked",
    value: snapshot.lockedBalance,
  },
  {
    labelKey: "engine.snapshot.wagered",
    value: snapshot.wageredAmount,
  },
  {
    labelKey: "engine.snapshot.total",
    value: snapshot.totalBalance,
  },
]

export const formatSnapshotJson = (
  snapshot: ReconciliationAlertRecord["ledgerSnapshot"],
) => JSON.stringify(snapshot.metadata ?? {}, null, 2)
