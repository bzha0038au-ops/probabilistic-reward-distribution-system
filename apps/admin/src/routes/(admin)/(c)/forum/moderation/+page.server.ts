import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  ForumBulkDeletePostsSchema,
  ForumModerationOverviewSchema,
  ForumMuteUserSchema,
  ForumReleaseMuteSchema,
} from "@reward/shared-types/forum"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"

const fallbackOverview = {
  queue: [],
  activeMutes: [],
}

const parsePositiveInt = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const buildOverviewPath = (url: URL) => {
  const params = new URLSearchParams()
  const limit = url.searchParams.get("limit")
  const muteLimit = url.searchParams.get("muteLimit")

  if (limit) {
    params.set("limit", limit)
  }
  if (muteLimit) {
    params.set("muteLimit", muteLimit)
  }

  const queryString = params.toString()
  return `/admin/forum/moderation/overview${queryString ? `?${queryString}` : ""}`
}

export const load: PageServerLoad = async ({ fetch, cookies, locals, url }) => {
  const t = createTranslator(getMessages(locals.locale))

  try {
    const response = await apiRequest(fetch, cookies, buildOverviewPath(url))
    if (!response.ok) {
      const errorMessage =
        response.error?.message ?? t("forum.moderation.errors.loadData")

      captureAdminServerException(new Error(errorMessage), {
        tags: {
          kind: "admin_forum_moderation_load_failure",
        },
        extra: {
          moderationStatus: response.status,
        },
      })

      return {
        overview: fallbackOverview,
        error: errorMessage,
      }
    }

    const overview = ForumModerationOverviewSchema.safeParse(response.data)
    if (!overview.success) {
      captureAdminServerException(
        new Error(t("forum.moderation.errors.unexpectedResponse")),
        {
          tags: {
            kind: "admin_forum_moderation_unexpected_response",
          },
          extra: {
            schemaValid: false,
          },
        },
      )
    }

    return {
      overview: overview.success ? overview.data : fallbackOverview,
      error: overview.success
        ? null
        : t("forum.moderation.errors.unexpectedResponse"),
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_forum_moderation_load_exception",
      },
    })

    return {
      overview: fallbackOverview,
      error: t("forum.moderation.errors.loadData"),
    }
  }
}

export const actions: Actions = {
  bulkDeletePosts: async ({ request, fetch, cookies, locals }) => {
    const t = createTranslator(getMessages(locals.locale))
    const formData = await request.formData()
    const reason = parseOptionalText(formData.get("reason"))
    const postIds = formData
      .getAll("postIds")
      .map((value) => parsePositiveInt(value))
      .filter((value): value is number => value !== null)

    const parsed = ForumBulkDeletePostsSchema.safeParse({
      postIds,
      reason,
    })

    if (!parsed.success) {
      return fail(400, {
        error: t("forum.moderation.errors.invalidBulkSelection"),
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/forum/moderation/posts/bulk-delete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? t("forum.moderation.errors.bulkDeleteFailed"),
      })
    }

    return {
      success: true,
      message: t("forum.moderation.feedback.bulkDeleteSuccess"),
    }
  },
  muteUser: async ({ request, fetch, cookies, locals }) => {
    const t = createTranslator(getMessages(locals.locale))
    const formData = await request.formData()
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const validationError = validateAdminStepUpPayload(stepUpPayload)

    if (validationError) {
      return fail(400, {
        error: t("forum.moderation.errors.stepUpRequired"),
      })
    }

    const parsed = ForumMuteUserSchema.safeParse({
      userId: parsePositiveInt(formData.get("userId")),
      reason: parseOptionalText(formData.get("reason")) ?? undefined,
    })

    if (!parsed.success) {
      return fail(400, {
        error: t("forum.moderation.errors.invalidUserId"),
      })
    }

    const response = await apiRequest(fetch, cookies, "/admin/forum/moderation/mutes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        ...stepUpPayload,
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? t("forum.moderation.errors.muteFailed"),
      })
    }

    return {
      success: true,
      message: t("forum.moderation.feedback.muteSuccess"),
    }
  },
  releaseMute: async ({ request, fetch, cookies, locals }) => {
    const t = createTranslator(getMessages(locals.locale))
    const formData = await request.formData()
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const validationError = validateAdminStepUpPayload(stepUpPayload)

    if (validationError) {
      return fail(400, {
        error: t("forum.moderation.errors.stepUpRequired"),
      })
    }

    const parsed = ForumReleaseMuteSchema.safeParse({
      freezeRecordId: parsePositiveInt(formData.get("freezeRecordId")),
      reason: parseOptionalText(formData.get("reason")) ?? undefined,
    })

    if (!parsed.success) {
      return fail(400, {
        error: t("forum.moderation.errors.invalidFreezeRecordId"),
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      "/admin/forum/moderation/mutes/release",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          ...stepUpPayload,
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? t("forum.moderation.errors.releaseFailed"),
      })
    }

    return {
      success: true,
      message: t("forum.moderation.feedback.releaseSuccess"),
    }
  },
}
