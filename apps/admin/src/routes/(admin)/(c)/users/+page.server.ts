import type { PageServerLoad } from "./$types"
import { AdminUserSearchResultSchema } from "@reward/shared-types/admin"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"

const emptyResults = {
  query: "",
  limit: 20,
  items: [],
}

export const load: PageServerLoad = async ({ fetch, cookies, url, locals }) => {
  const t = createTranslator(getMessages(locals.locale))
  const query = url.searchParams.get("query")?.trim() ?? ""

  if (query === "") {
    return {
      query,
      results: emptyResults,
      error: null,
    }
  }

  try {
    const params = new URLSearchParams({
      query,
      limit: "20",
    })
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users?${params.toString()}`,
    )

    if (!response.ok) {
      return {
        query,
        results: emptyResults,
        error: response.error?.message ?? t("users.errors.loadSearch"),
      }
    }

    const parsed = AdminUserSearchResultSchema.safeParse(response.data)
    if (!parsed.success) {
      captureAdminServerException(new Error(t("users.errors.unexpectedData")), {
        tags: {
          kind: "admin_users_search_unexpected_response",
        },
      })

      return {
        query,
        results: emptyResults,
        error: t("users.errors.unexpectedData"),
      }
    }

    return {
      query,
      results: parsed.data,
      error: null,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_users_search_exception",
      },
    })

    return {
      query,
      results: emptyResults,
      error: t("users.errors.loadSearch"),
    }
  }
}
