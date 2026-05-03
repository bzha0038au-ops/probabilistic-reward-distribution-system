import {
  AdminActionSummarySchema,
  CursorAdminActionPageSchema,
} from "@reward/shared-types/admin"
import type { RequestEvent } from "@sveltejs/kit"

import { apiRequest } from "$lib/server/api"

type AuditLoadEvent = Pick<RequestEvent, "fetch" | "cookies" | "url">

const fallbackAdminActions = {
  items: [],
  limit: 50,
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  prevCursor: null,
  direction: "next" as const,
  sort: "desc" as const,
}

const fallbackSummary = {
  totalCount: 0,
  byAdmin: [],
  byAction: [],
  byUser: [],
  byDay: [],
}

export const loadAuditPage = async ({
  fetch,
  cookies,
  url,
}: AuditLoadEvent) => {
  const listParams = new URLSearchParams()
  const summaryParams = new URLSearchParams()
  const adminId = url.searchParams.get("adminId")
  const userId = url.searchParams.get("userId")
  const action = url.searchParams.get("action")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const limit = url.searchParams.get("limit")
  const cursor = url.searchParams.get("cursor")
  const direction = url.searchParams.get("direction")
  const sort = url.searchParams.get("sort")

  if (adminId) {
    listParams.set("adminId", adminId)
    summaryParams.set("adminId", adminId)
  }
  if (userId) {
    listParams.set("userId", userId)
    summaryParams.set("userId", userId)
  }
  if (action) {
    listParams.set("action", action)
    summaryParams.set("action", action)
  }
  if (from) {
    listParams.set("from", from)
    summaryParams.set("from", from)
  }
  if (to) {
    listParams.set("to", to)
    summaryParams.set("to", to)
  }
  if (limit) {
    listParams.set("limit", limit)
  }
  if (cursor) {
    listParams.set("cursor", cursor)
  }
  if (direction === "next" || direction === "prev") {
    listParams.set("direction", direction)
  }
  if (sort === "asc" || sort === "desc") {
    listParams.set("sort", sort)
    summaryParams.set("sort", sort)
  }

  try {
    const [actionsRes, summaryRes] = await Promise.all([
      apiRequest(
        fetch,
        cookies,
        `/admin/admin-actions?${listParams.toString()}`,
      ),
      apiRequest(
        fetch,
        cookies,
        `/admin/admin-actions/summary?${summaryParams.toString()}`,
      ),
    ])

    if (!actionsRes.ok) {
      return {
        adminActions: fallbackAdminActions,
        summary: fallbackSummary,
        error: actionsRes.error?.message ?? "Failed to load audit data.",
      }
    }

    if (!summaryRes.ok) {
      return {
        adminActions: fallbackAdminActions,
        summary: fallbackSummary,
        error: summaryRes.error?.message ?? "Failed to load audit data.",
      }
    }

    const adminActions = CursorAdminActionPageSchema.safeParse(actionsRes.data)
    const summary = AdminActionSummarySchema.safeParse(summaryRes.data)

    return {
      adminActions: adminActions.success
        ? adminActions.data
        : fallbackAdminActions,
      summary: summary.success ? summary.data : fallbackSummary,
      error:
        adminActions.success && summary.success
          ? null
          : "Audit API returned an unexpected response.",
    }
  } catch (error) {
    return {
      adminActions: fallbackAdminActions,
      summary: fallbackSummary,
      error:
        error instanceof Error ? error.message : "Failed to load audit data.",
    }
  }
}
