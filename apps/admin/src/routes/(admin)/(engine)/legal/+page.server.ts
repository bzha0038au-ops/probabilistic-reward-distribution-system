import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import type { LegalAdminOverview } from "@reward/shared-types/legal"

import { apiRequest, type ApiResult } from "$lib/server/api"

type ControlCenterResponse = {
  changeRequests: unknown[]
}

const parseOptionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const parsePositiveInt = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const parsePercent = (value: FormDataEntryValue | null, fallback = 100) => {
  if (typeof value !== "string" || value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : fallback
}

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const readApiErrorMessage = <T>(result: ApiResult<T>) =>
  "error" in result ? result.error?.message ?? null : null

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  const [legalRes, controlRes, mfaStatusRes] = await Promise.all([
    apiRequest<LegalAdminOverview>(fetch, cookies, "/admin/legal/overview"),
    apiRequest<ControlCenterResponse>(fetch, cookies, "/admin/control-center"),
    apiRequest(fetch, cookies, "/admin/mfa/status"),
  ])

  return {
    admin: locals.admin ?? null,
    documents: legalRes.ok ? legalRes.data?.documents ?? [] : [],
    changeRequests: controlRes.ok
      ? ((controlRes.data?.changeRequests ?? []) as Array<{
          changeType?: string
        }>).filter((request) => request.changeType === "legal_document_publish")
      : [],
    mfaStatus: mfaStatusRes.ok ? mfaStatusRes.data ?? null : null,
    error:
      legalRes.ok && controlRes.ok && mfaStatusRes.ok
        ? null
        : readApiErrorMessage(legalRes) ??
          readApiErrorMessage(controlRes) ??
          readApiErrorMessage(mfaStatusRes) ??
          "Failed to load legal admin data.",
  }
}

export const actions: Actions = {
  createDocument: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()

    const payload = {
      documentKey: formData.get("documentKey")?.toString().trim() ?? "",
      locale: formData.get("locale")?.toString().trim() || "zh-CN",
      title: formData.get("title")?.toString().trim() ?? "",
      htmlContent: formData.get("htmlContent")?.toString() ?? "",
      summary: parseOptionalString(formData.get("summary")),
      changeNotes: parseOptionalString(formData.get("changeNotes")),
      isRequired: formData.get("isRequired") === "on",
    }

    if (!payload.documentKey || !payload.title || !payload.htmlContent.trim()) {
      return fail(400, { error: "Document key, title, and HTML are required." })
    }

    const response = await apiRequest(fetch, cookies, "/admin/legal/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to create legal document.",
      })
    }

    return { success: true }
  },

  updateDocument: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const documentId = parsePositiveInt(formData.get("documentId"))
    if (!documentId) {
      return fail(400, { error: "Missing legal document id." })
    }

    const payload = {
      title: formData.get("title")?.toString().trim() ?? "",
      htmlContent: formData.get("htmlContent")?.toString() ?? "",
      summary: parseOptionalString(formData.get("summary")),
      changeNotes: parseOptionalString(formData.get("changeNotes")),
      isRequired: formData.get("isRequired") === "on",
    }

    if (!payload.title || !payload.htmlContent.trim()) {
      return fail(400, { error: "Title and HTML are required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/legal/documents/${documentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to update legal document.",
      })
    }

    return { success: true }
  },

  deleteDocument: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const documentId = parsePositiveInt(formData.get("documentId"))
    if (!documentId) {
      return fail(400, { error: "Missing legal document id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/legal/documents/${documentId}`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to delete legal document.",
      })
    }

    return { success: true }
  },

  createPublishDraft: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const documentId = parsePositiveInt(formData.get("documentId"))
    if (!documentId) {
      return fail(400, { error: "Missing legal document id." })
    }

    const payload = {
      rolloutPercent: parsePercent(formData.get("rolloutPercent")),
      reason: parseOptionalString(formData.get("reason")),
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/legal/documents/${documentId}/publish-drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to create publish draft.",
      })
    }

    return { success: true }
  },

  submitChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parsePositiveInt(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationText: parseOptionalString(formData.get("confirmationText")),
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to submit change request.",
      })
    }

    return { success: true }
  },

  approveChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parsePositiveInt(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/approve`,
      { method: "POST" },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to approve change request.",
      })
    }

    return { success: true }
  },

  publishChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parsePositiveInt(formData.get("requestId"))
    const totpCode = parseTotpCode(formData.get("totpCode"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }
    if (!totpCode) {
      return fail(400, { error: "Admin MFA code is required." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode,
          confirmationText: parseOptionalString(formData.get("confirmationText")),
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to publish change request.",
      })
    }

    return { success: true }
  },

  rejectChangeRequest: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const requestId = parsePositiveInt(formData.get("requestId"))
    if (!requestId) {
      return fail(400, { error: "Missing config change request id." })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/control-center/change-requests/${requestId}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: parseOptionalString(formData.get("rejectReason")),
        }),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? "Failed to reject change request.",
      })
    }

    return { success: true }
  },
}
