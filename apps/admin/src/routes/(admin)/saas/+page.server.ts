import { fail, redirect, type Cookies } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"

import { apiRequest } from "$lib/server/api"
import type { SaasOverview } from "@reward/shared-types/saas"

const parseOptionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const parseMoneyString = (value: FormDataEntryValue | null, fallback = "0") => {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed === "" ? fallback : trimmed
}

const parseNumberString = (value: FormDataEntryValue | null, fallback = "0") =>
  parseMoneyString(value, fallback)

const parseOptionalIsoDate = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (trimmed === "") return undefined

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
}

const requestJson = async <T = unknown>(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
  path: string,
  method: string,
  body?: Record<string, unknown>,
) =>
  apiRequest<T>(fetch, cookies, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })

const failFromResponse = (
  response: {
    ok: boolean
    status: number
    error?: { message?: string } | null
  },
  fallbackMessage: string,
) =>
  fail(response.status, {
    error: response.error?.message ?? fallbackMessage,
  })

export const load: PageServerLoad = async ({ fetch, cookies, locals, url }) => {
  const overview = await apiRequest<SaasOverview>(
    fetch,
    cookies,
    "/admin/saas/overview",
  )

  return {
    admin: locals.admin ?? null,
    overview: overview.ok ? overview.data : null,
    error: overview.ok
      ? null
      : (overview.error?.message ?? "Failed to load SaaS overview."),
    inviteToken: url.searchParams.get("invite"),
    billingSetupStatus: url.searchParams.get("billingSetup"),
  }
}

export const actions: Actions = {
  acceptInvite: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/invites/accept",
      "POST",
      {
        token: formData.get("token")?.toString().trim() ?? "",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to accept tenant invite.")
    }

    return { inviteAccepted: true }
  },

  createTenant: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/tenants",
      "POST",
      {
        slug: formData.get("slug")?.toString().trim() ?? "",
        name: formData.get("name")?.toString().trim() ?? "",
        billingEmail: parseOptionalString(formData.get("billingEmail")),
        status: formData.get("status")?.toString() || "active",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create tenant.")
    }

    return { tenantCreated: true }
  },

  createProject: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/projects",
      "POST",
      {
        tenantId: Number(formData.get("tenantId")),
        slug: formData.get("slug")?.toString().trim() ?? "",
        name: formData.get("name")?.toString().trim() ?? "",
        environment: formData.get("environment")?.toString() || "sandbox",
        status: formData.get("status")?.toString() || "active",
        currency: formData.get("currency")?.toString().trim() || "USD",
        drawCost: parseMoneyString(formData.get("drawCost")),
        prizePoolBalance: parseMoneyString(formData.get("prizePoolBalance")),
        fairnessEpochSeconds: Number(
          parseNumberString(formData.get("fairnessEpochSeconds"), "3600"),
        ),
        maxDrawCount: Number(
          parseNumberString(formData.get("maxDrawCount"), "1"),
        ),
        missWeight: Number(parseNumberString(formData.get("missWeight"), "0")),
        apiRateLimitBurst: Number(
          parseNumberString(formData.get("apiRateLimitBurst"), "120"),
        ),
        apiRateLimitHourly: Number(
          parseNumberString(formData.get("apiRateLimitHourly"), "3600"),
        ),
        apiRateLimitDaily: Number(
          parseNumberString(formData.get("apiRateLimitDaily"), "86400"),
        ),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create project.")
    }

    return { projectCreated: true }
  },

  assignMembership: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/memberships`,
      "POST",
      {
        adminEmail: formData.get("adminEmail")?.toString().trim() ?? "",
        role: formData.get("role")?.toString() || "tenant_operator",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to save membership.")
    }

    return { membershipSaved: true }
  },

  deleteMembership: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const membershipId = Number(formData.get("membershipId"))
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/memberships/${membershipId}`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to delete membership.")
    }

    return { membershipDeleted: true }
  },

  createInvite: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/invites`,
      "POST",
      {
        email: formData.get("email")?.toString().trim() ?? "",
        role: formData.get("role")?.toString() || "tenant_operator",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create invite.")
    }

    return { inviteCreated: true, inviteResult: response.data }
  },

  revokeInvite: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const inviteId = Number(formData.get("inviteId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/invites/${inviteId}/revoke`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to revoke invite.")
    }

    return { inviteRevoked: true }
  },

  linkTenant: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/tenant-links",
      "POST",
      {
        parentTenantId: Number(formData.get("parentTenantId")),
        childTenantId: Number(formData.get("childTenantId")),
        linkType: formData.get("linkType")?.toString() || "agent_client",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to save tenant link.")
    }

    return { tenantLinked: true }
  },

  unlinkTenant: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const linkId = Number(formData.get("linkId"))
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/saas/tenant-links/${linkId}`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to delete tenant link.")
    }

    return { tenantUnlinked: true }
  },

  issueKey: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const scopes = formData
      .getAll("scopes")
      .map((value) => value.toString())
      .filter(Boolean)

    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/keys`,
      "POST",
      {
        label: formData.get("label")?.toString().trim() ?? "",
        scopes,
        expiresAt: parseOptionalIsoDate(formData.get("expiresAt")),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to issue API key.")
    }

    return {
      issuedKey: response.data,
    }
  },

  rotateKey: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const keyId = Number(formData.get("keyId"))
    const scopes = formData
      .getAll("scopes")
      .map((value) => value.toString())
      .filter(Boolean)

    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/keys/${keyId}/rotate`,
      "POST",
      {
        label: parseOptionalString(formData.get("label")) ?? undefined,
        scopes: scopes.length > 0 ? scopes : undefined,
        expiresAt: parseOptionalIsoDate(formData.get("expiresAt")),
        overlapSeconds: Number(
          parseNumberString(formData.get("overlapSeconds"), "3600"),
        ),
        reason: parseOptionalString(formData.get("reason")),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to rotate API key.")
    }

    return {
      rotatedKey: response.data,
    }
  },

  revokeKey: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const keyId = Number(formData.get("keyId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/keys/${keyId}/revoke`,
      "POST",
      {
        reason: parseOptionalString(formData.get("reason")),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to revoke API key.")
    }

    return { keyRevoked: true }
  },

  saveBilling: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing`,
      "PUT",
      {
        planCode: formData.get("planCode")?.toString() || "starter",
        stripeCustomerId: parseOptionalString(formData.get("stripeCustomerId")),
        collectionMethod:
          formData.get("collectionMethod")?.toString() || "send_invoice",
        autoBillingEnabled: formData.get("autoBillingEnabled") === "on",
        portalConfigurationId: parseOptionalString(
          formData.get("portalConfigurationId"),
        ),
        baseMonthlyFee: parseMoneyString(formData.get("baseMonthlyFee")),
        drawFee: parseMoneyString(formData.get("drawFee"), "0.0000"),
        currency: formData.get("currency")?.toString().trim() || "USD",
        isBillable: formData.get("isBillable") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to save billing account.")
    }

    return { billingSaved: true }
  },

  openBillingPortal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson<{ url: string }>(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing/portal`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to open billing portal.")
    }

    throw redirect(303, response.data.url)
  },

  openBillingSetup: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson<{ url: string }>(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing/setup-session`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to open billing setup.")
    }

    throw redirect(303, response.data.url)
  },

  createPrize: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes`,
      "POST",
      {
        name: formData.get("name")?.toString().trim() ?? "",
        stock: Number(parseNumberString(formData.get("stock"), "0")),
        weight: Number(parseNumberString(formData.get("weight"), "1")),
        rewardAmount: parseMoneyString(formData.get("rewardAmount")),
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create prize.")
    }

    return { prizeCreated: true }
  },

  updatePrize: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const prizeId = Number(formData.get("prizeId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes/${prizeId}`,
      "PATCH",
      {
        name: formData.get("name")?.toString().trim() ?? "",
        stock: Number(parseNumberString(formData.get("stock"), "0")),
        weight: Number(parseNumberString(formData.get("weight"), "1")),
        rewardAmount: parseMoneyString(formData.get("rewardAmount")),
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to update prize.")
    }

    return { prizeUpdated: true }
  },

  deletePrize: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const prizeId = Number(formData.get("prizeId"))
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes/${prizeId}`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to delete prize.")
    }

    return { prizeDeleted: true }
  },

  createBillingRun: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing-runs`,
      "POST",
      {
        periodStart: parseOptionalIsoDate(formData.get("periodStart")),
        periodEnd: parseOptionalIsoDate(formData.get("periodEnd")),
        finalize: formData.get("finalize") === "on",
        sendInvoice: formData.get("sendInvoice") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create billing run.")
    }

    return { billingRunCreated: true }
  },

  syncBillingRun: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/sync`,
      "POST",
      {
        finalize: formData.get("finalize") === "on",
        sendInvoice: formData.get("sendInvoice") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to sync billing run.")
    }

    return { billingRunSynced: true }
  },

  refreshBillingRun: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/refresh`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to refresh billing run.")
    }

    return { billingRunRefreshed: true }
  },

  settleBillingRun: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/settle`,
      "POST",
      {
        paidOutOfBand: formData.get("paidOutOfBand") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to settle billing run.")
    }

    return { billingRunSettled: true }
  },

  createTopUp: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/top-ups`,
      "POST",
      {
        amount: parseMoneyString(formData.get("amount")),
        currency: formData.get("currency")?.toString().trim() || "USD",
        note: parseOptionalString(formData.get("note")),
      },
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to create billing top-up.")
    }

    return { topUpCreated: true }
  },

  syncTopUp: async ({ request, fetch, cookies }) => {
    const formData = await request.formData()
    const topUpId = Number(formData.get("topUpId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/top-ups/${topUpId}/sync`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(response, "Failed to sync billing top-up.")
    }

    return { topUpSynced: true }
  },
}
