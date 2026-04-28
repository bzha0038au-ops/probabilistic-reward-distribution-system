import type { PageServerLoad } from "./$types"
import { KycAdminQueuePageSchema } from "@reward/shared-types/kyc"

import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"

import { getKycCopy } from "./copy"

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

const createEmptyQueue = (page: number, limit: number) => ({
  items: [],
  page,
  limit,
  hasNext: false,
})

export const load: PageServerLoad = async ({
  fetch,
  cookies,
  url,
  locals,
}) => {
  const copy = getKycCopy(locals.locale)
  const filters = {
    tier: url.searchParams.get("tier")?.trim() ?? "",
    from: url.searchParams.get("from")?.trim() ?? "",
    to: url.searchParams.get("to")?.trim() ?? "",
    riskFlag: url.searchParams.get("riskFlag")?.trim() ?? "",
    limit: parsePositiveInt(url.searchParams.get("limit"), 50),
    page: parsePositiveInt(url.searchParams.get("page"), 1),
  }

  const params = new URLSearchParams()
  if (filters.tier) params.set("tier", filters.tier)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.riskFlag) params.set("riskFlag", filters.riskFlag)
  params.set("limit", String(filters.limit))
  params.set("page", String(filters.page))

  try {
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/kyc-profiles?${params.toString()}`,
    )

    if (!response.ok) {
      return {
        queue: createEmptyQueue(filters.page, filters.limit),
        filters,
        error: response.error?.message ?? copy.errors.loadQueue,
      }
    }

    const parsed = KycAdminQueuePageSchema.safeParse(response.data)
    if (!parsed.success) {
      captureAdminServerException(new Error(copy.errors.unexpectedData), {
        tags: {
          kind: "admin_kyc_queue_unexpected_response",
        },
      })

      return {
        queue: createEmptyQueue(filters.page, filters.limit),
        filters,
        error: copy.errors.unexpectedData,
      }
    }

    return {
      queue: parsed.data,
      filters,
      error: null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_kyc_queue_exception",
      },
    })

    return {
      queue: createEmptyQueue(filters.page, filters.limit),
      filters,
      error: copy.errors.loadQueue,
    }
  }
}
