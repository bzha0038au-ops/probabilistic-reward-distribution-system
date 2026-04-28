import { fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  AdminPermissionScopeOverviewSchema,
  AdminPermissionScopeUpdateResultSchema,
} from "@reward/shared-types/admin"

import { apiRequest } from "$lib/server/api"

const parseOptionalPositiveInt = (value: string | null) => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

const parseRequiredString = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

export const load: PageServerLoad = async ({ fetch, cookies, locals, url }) => {
  if (!locals.admin) {
    throw redirect(303, "/login")
  }

  const selectedAdminIdParam = parseOptionalPositiveInt(url.searchParams.get("adminId"))

  try {
    const response = await apiRequest(fetch, cookies, "/admin/engine/permissions")

    if (!response.ok) {
      return {
        admins: [],
        scopePool: [],
        selectedAdminId: selectedAdminIdParam,
        error: response.error?.message ?? "Failed to load admin permission scopes.",
      }
    }

    const parsed = AdminPermissionScopeOverviewSchema.safeParse(response.data ?? null)
    if (!parsed.success) {
      return {
        admins: [],
        scopePool: [],
        selectedAdminId: selectedAdminIdParam,
        error: "Permission scope API returned an unexpected response.",
      }
    }

    const selectedAdminId = parsed.data.admins.some(
      (admin) => admin.adminId === selectedAdminIdParam,
    )
      ? selectedAdminIdParam
      : (parsed.data.admins[0]?.adminId ?? null)

    return {
      admins: parsed.data.admins,
      scopePool: parsed.data.scopePool,
      selectedAdminId,
      error: null,
    }
  } catch (error) {
    return {
      admins: [],
      scopePool: [],
      selectedAdminId: selectedAdminIdParam,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load admin permission scopes.",
    }
  }
}

export const actions: Actions = {
  save: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const adminId = parseOptionalPositiveInt(
      parseRequiredString(formData.get("adminId")),
    )
    const confirmationText = parseRequiredString(formData.get("confirmationText"))
    const totpCode = parseRequiredString(formData.get("totpCode"))
    const scopeKeys = Array.from(
      new Set(
        formData
          .getAll("scopeKeys")
          .map((value) => value.toString().trim())
          .filter(Boolean),
      ),
    )

    if (!adminId) {
      return fail(400, { error: "Missing admin id." })
    }
    if (!confirmationText) {
      return fail(400, {
        error: "Confirmation text is required.",
        selectedAdminId: adminId,
      })
    }
    if (!totpCode) {
      return fail(400, {
        error: "Admin MFA code is required.",
        selectedAdminId: adminId,
      })
    }

    const response = await apiRequest(fetch, cookies, `/admin/engine/permissions/${adminId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeKeys,
        confirmationText,
        totpCode,
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to save admin permission scopes.",
        selectedAdminId: adminId,
      })
    }

    const parsed = AdminPermissionScopeUpdateResultSchema.safeParse(
      response.data ?? null,
    )
    if (!parsed.success) {
      return fail(500, {
        error: "Permission scope API returned an unexpected response.",
        selectedAdminId: adminId,
      })
    }

    return {
      success: true,
      selectedAdminId: adminId,
      scopeUpdate: parsed.data,
    }
  },
}
