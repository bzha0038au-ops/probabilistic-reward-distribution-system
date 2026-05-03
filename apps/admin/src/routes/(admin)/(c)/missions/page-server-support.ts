import { fail, redirect } from "@sveltejs/kit"
import {
  RewardMissionAdminRecordSchema,
  RewardMissionCreateSchema,
  RewardMissionUpdateSchema,
} from "@reward/shared-types/gamification"

import { apiRequest } from "$lib/server/api"

const parseMissionForm = async (request: Request) => {
  const formData = await request.formData()
  const id = formData.get("id")?.toString().trim() ?? ""
  const type = formData.get("type")?.toString().trim() ?? ""
  const reward = formData.get("reward")?.toString().trim() ?? ""
  const paramsRaw = formData.get("params")?.toString().trim() ?? ""
  const isActive = formData.get("isActive") === "on"

  let params: Record<string, unknown>
  try {
    const parsed = JSON.parse(paramsRaw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: "Params must be a JSON object.",
      }
    }
    params = parsed as Record<string, unknown>
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Invalid params JSON.",
    }
  }

  return {
    ok: true as const,
    data: {
      id,
      type,
      reward,
      isActive,
      params,
    },
  }
}

export const loadMissionsPage = async (
  fetch: typeof globalThis.fetch,
  cookies: { get: (name: string) => string | undefined },
) => {
  try {
    const response = await apiRequest(fetch, cookies, "/admin/missions")

    if (!response.ok) {
      return {
        missions: [],
        error: response.error?.message ?? "Failed to load missions.",
      }
    }

    const parsed = RewardMissionAdminRecordSchema.array().safeParse(
      response.data ?? [],
    )

    if (!parsed.success) {
      return {
        missions: [],
        error: "Mission API returned an unexpected response.",
      }
    }

    return {
      missions: parsed.data,
      error: null,
    }
  } catch (error) {
    return {
      missions: [],
      error:
        error instanceof Error ? error.message : "Failed to load missions.",
    }
  }
}

export const buildMissionActions = (redirectTo: string) => ({
  create: async ({
    request,
    fetch,
    cookies,
  }: {
    request: Request
    fetch: typeof globalThis.fetch
    cookies: { get: (name: string) => string | undefined }
  }) => {
    const parsedForm = await parseMissionForm(request)
    if (!parsedForm.ok) {
      return fail(400, { error: parsedForm.error })
    }

    const validated = RewardMissionCreateSchema.safeParse(parsedForm.data)
    if (!validated.success) {
      return fail(400, { error: "Invalid mission payload." })
    }

    try {
      const response = await apiRequest(fetch, cookies, "/admin/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      })

      if (!response.ok) {
        return fail(response.status, {
          error: response.error?.message ?? "Failed to create mission.",
        })
      }
    } catch (error) {
      return fail(500, {
        error:
          error instanceof Error ? error.message : "Failed to create mission.",
      })
    }

    throw redirect(303, redirectTo)
  },
  update: async ({
    request,
    fetch,
    cookies,
  }: {
    request: Request
    fetch: typeof globalThis.fetch
    cookies: { get: (name: string) => string | undefined }
  }) => {
    const parsedForm = await parseMissionForm(request)
    if (!parsedForm.ok) {
      return fail(400, { error: parsedForm.error })
    }

    if (!parsedForm.data.id) {
      return fail(400, { error: "Mission id is required." })
    }

    const validated = RewardMissionUpdateSchema.safeParse({
      type: parsedForm.data.type,
      reward: parsedForm.data.reward,
      isActive: parsedForm.data.isActive,
      params: parsedForm.data.params,
    })
    if (!validated.success) {
      return fail(400, { error: "Invalid mission payload." })
    }

    try {
      const response = await apiRequest(
        fetch,
        cookies,
        `/admin/missions/${encodeURIComponent(parsedForm.data.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated.data),
        },
      )

      if (!response.ok) {
        return fail(response.status, {
          error: response.error?.message ?? "Failed to update mission.",
        })
      }
    } catch (error) {
      return fail(500, {
        error:
          error instanceof Error ? error.message : "Failed to update mission.",
      })
    }

    throw redirect(303, redirectTo)
  },
  delete: async ({
    request,
    fetch,
    cookies,
  }: {
    request: Request
    fetch: typeof globalThis.fetch
    cookies: { get: (name: string) => string | undefined }
  }) => {
    const formData = await request.formData()
    const id = formData.get("id")?.toString().trim() ?? ""

    if (!id) {
      return fail(400, { error: "Mission id is required." })
    }

    try {
      const response = await apiRequest(
        fetch,
        cookies,
        `/admin/missions/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      )

      if (!response.ok) {
        return fail(response.status, {
          error: response.error?.message ?? "Failed to delete mission.",
        })
      }
    } catch (error) {
      return fail(500, {
        error:
          error instanceof Error ? error.message : "Failed to delete mission.",
      })
    }

    throw redirect(303, redirectTo)
  },
})
