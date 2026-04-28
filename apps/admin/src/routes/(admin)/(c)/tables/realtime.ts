import {
  TableMonitoringSnapshotSchema,
  type TableMonitoringSnapshot,
  TableMonitoringWsAccessTokenSchema,
} from "@reward/shared-types/table-monitoring"

import { apiRequest, getApiBaseUrl } from "$lib/server/api"

type CookieStore = {
  get: (key: string) => string | undefined
}

export type TableMonitoringRealtimeState = {
  snapshot: TableMonitoringSnapshot
  wsUrl: string
  error: string | null
}

export const buildWebSocketUrl = (accessToken?: string | null) => {
  const url = new URL("/admin/ws/table-monitoring", getApiBaseUrl())
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  if (accessToken) {
    url.searchParams.set("accessToken", accessToken)
  }
  return url.toString()
}

export const buildFallbackSnapshot = (): TableMonitoringSnapshot => ({
  generatedAt: new Date().toISOString(),
  tables: [],
})

export const loadTableMonitoringRealtimeState = async (
  fetcher: typeof fetch,
  cookies: CookieStore,
): Promise<TableMonitoringRealtimeState> => {
  const [snapshotResult, tokenResult] = await Promise.allSettled([
    apiRequest(fetcher, cookies, "/admin/table-monitoring"),
    apiRequest(fetcher, cookies, "/admin/table-monitoring/ws-token"),
  ])

  let snapshot = buildFallbackSnapshot()
  let accessToken: string | null = null
  const errors: string[] = []

  if (snapshotResult.status === "fulfilled") {
    if (!snapshotResult.value.ok) {
      errors.push(
        snapshotResult.value.error?.message ?? "Failed to load live table data.",
      )
    } else {
      const parsed = TableMonitoringSnapshotSchema.safeParse(
        snapshotResult.value.data,
      )
      if (parsed.success) {
        snapshot = parsed.data
      } else {
        errors.push("Table monitoring API returned an unexpected response.")
      }
    }
  } else {
    errors.push(
      snapshotResult.reason instanceof Error
        ? snapshotResult.reason.message
        : "Failed to load live table data.",
    )
  }

  if (tokenResult.status === "fulfilled") {
    if (!tokenResult.value.ok) {
      errors.push(
        tokenResult.value.error?.message ?? "Failed to open live table stream.",
      )
    } else {
      const parsed = TableMonitoringWsAccessTokenSchema.safeParse(
        tokenResult.value.data,
      )
      if (parsed.success) {
        accessToken = parsed.data.token
      } else {
        errors.push("Table monitoring websocket token was invalid.")
      }
    }
  } else {
    errors.push(
      tokenResult.reason instanceof Error
        ? tokenResult.reason.message
        : "Failed to open live table stream.",
    )
  }

  return {
    snapshot,
    wsUrl: buildWebSocketUrl(accessToken),
    error: errors[0] ?? null,
  }
}
