import { fail, redirect, type Cookies } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"

import { createTranslator, getMessages } from "$lib/i18n"
import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest, getApiBaseUrl } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"
import type {
  SaasApiKeyIssue,
  SaasOverview,
  SaasTenantProvisioning,
} from "@reward/shared-types/saas"
import { saasActionPolicies } from "./action-policies"

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

const parseNullableMoneyString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const parseNumberString = (value: FormDataEntryValue | null, fallback = "0") =>
  parseMoneyString(value, fallback)

const parseOptionalNumber = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (trimmed === "") return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseOptionalIsoDate = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (trimmed === "") return undefined

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
}

const parseOptionalJsonObject = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return {
      ok: true as const,
      value: undefined,
    }
  }

  const trimmed = value.trim()
  if (trimmed === "") {
    return {
      ok: true as const,
      value: undefined,
    }
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {
        ok: false as const,
        errorKey: "saas.errors.strategyParamsObject",
      }
    }

    return {
      ok: true as const,
      value: parsed as Record<string, unknown>,
    }
  } catch {
    return {
      ok: false as const,
      errorKey: "saas.errors.strategyParamsInvalidJson",
    }
  }
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

const getPageT = (locale?: Parameters<typeof getMessages>[0]) =>
  createTranslator(getMessages(locale ?? "en"))

const buildStepUpMessages = (t: ReturnType<typeof createTranslator>) => ({
  totpRequired: t("saas.confirmDialog.mfaRequired"),
  breakGlassRequired: t("saas.confirmDialog.breakGlassRequired"),
})

const actionFail = (
  status: number,
  t: ReturnType<typeof createTranslator>,
  errorKey: string,
  extra: Record<string, unknown> = {},
) =>
  fail(status, {
    error: t(errorKey),
    ...extra,
  })

const failFromResponse = (
  response: {
    ok: boolean
    status: number
    error?: { message?: string } | null
  },
  localeOrFallback: Parameters<typeof getMessages>[0] | string,
  fallbackMessageKey?: string,
) =>
  fail(response.status, {
    error:
      response.error?.message ??
      (fallbackMessageKey
        ? getPageT(localeOrFallback as Parameters<typeof getMessages>[0])(
            fallbackMessageKey,
          )
        : localeOrFallback),
  })

type HelloRewardQuickstart = {
  tenantName: string
  projectId: number
  projectName: string
  projectSlug: string
  environment: "sandbox" | "live"
  apiKeyLabel: string
  apiKeyExpiresAt: string | Date
  fileName: string
  command: string
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/g, "")

const buildHelloRewardQuickstart = (params: {
  tenantName: string
  projectId: number
  projectName: string
  projectSlug: string
  environment: "sandbox" | "live"
  issuedKey: SaasApiKeyIssue
}) => {
  const baseUrl = trimTrailingSlash(getApiBaseUrl())
  const agentId = `${params.projectSlug}-hello-agent`
  const fileName = `hello-reward-${params.projectSlug}.mjs`
  const script = [
    'import { createPrizeEngineClient, createPrizeEngineIdempotencyKey } from "@reward/prize-engine-sdk";',
    "",
    "const client = createPrizeEngineClient({",
    `  baseUrl: ${JSON.stringify(baseUrl)},`,
    `  environment: ${JSON.stringify(params.environment)},`,
    `  getApiKey: () => ${JSON.stringify(params.issuedKey.apiKey)},`,
    "});",
    "",
    `const agentId = ${JSON.stringify(agentId)};`,
    "",
    "const overview = await client.getOverview();",
    "if (!overview.ok) throw new Error(overview.error.message);",
    'console.log("project", overview.data.project);',
    "",
    "const reward = await client.reward({",
    "  agent: {",
    "    agentId,",
    '    groupId: "hello-reward-demo",',
    '    metadata: { source: "hello-reward" },',
    "  },",
    "  behavior: {",
    '    actionType: "hello_reward_demo",',
    "    score: 0.92,",
    '    context: { source: "hello-reward" },',
    "  },",
    "  idempotencyKey: createPrizeEngineIdempotencyKey(),",
    "  clientNonce: `hello-reward-${Date.now()}`,",
    "});",
    "if (!reward.ok) throw new Error(reward.error.message);",
    'console.log("reward", reward.data.result);',
    "",
    "const ledger = await client.getLedger(agentId);",
    "if (!ledger.ok) throw new Error(ledger.error.message);",
    'console.log("ledger", ledger.data);',
  ].join("\n")

  return {
    tenantName: params.tenantName,
    projectId: params.projectId,
    projectName: params.projectName,
    projectSlug: params.projectSlug,
    environment: params.environment,
    apiKeyLabel: params.issuedKey.label,
    apiKeyExpiresAt: params.issuedKey.expiresAt,
    fileName,
    command: [
      "npm install @reward/prize-engine-sdk",
      `cat > ${fileName} <<'EOF'`,
      script,
      "EOF",
      `node ${fileName}`,
    ].join("\n"),
  } satisfies HelloRewardQuickstart
}

const issueHelloRewardKey = async (
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
  projectId: number,
  label: string,
  stepUpPayload: {
    totpCode: string | null
    breakGlassCode: string | null
  } | null = null,
) =>
  requestJson<SaasApiKeyIssue>(
    fetch,
    cookies,
    `/admin/saas/projects/${projectId}/keys`,
    "POST",
    {
      ...(stepUpPayload ?? {}),
      label,
      scopes: [
        "catalog:read",
        "fairness:read",
        "reward:write",
        "draw:write",
        "ledger:read",
      ],
    },
  )

const getValidatedAdminStepUpPayload = (
  formData: FormData,
  t: ReturnType<typeof createTranslator>,
  options: {
    requireBreakGlass?: boolean
  } = {},
) => {
  const stepUpPayload = parseAdminStepUpPayload(formData)
  const validationError = validateAdminStepUpPayload(stepUpPayload, {
    ...options,
    messages: buildStepUpMessages(t),
  })
  return {
    stepUpPayload,
    validationError,
  }
}

const getValidatedSaasActionStepUpPayload = (
  formData: FormData,
  t: ReturnType<typeof createTranslator>,
  actionName: keyof typeof saasActionPolicies,
) =>
  getValidatedAdminStepUpPayload(formData, t, {
    requireBreakGlass: saasActionPolicies[actionName].requireBreakGlass,
  })

export const load: PageServerLoad = async ({ fetch, cookies, locals, url }) => {
  const t = getPageT(locals?.locale)

  try {
    const overview = await apiRequest<SaasOverview>(
      fetch,
      cookies,
      "/admin/saas/overview",
    )

    if (!overview.ok) {
      captureAdminServerException(
        new Error(overview.error?.message ?? t("saas.errors.loadOverview")),
        {
          tags: {
            kind: "admin_saas_overview_load_failure",
            status_code: overview.status,
          },
          extra: {
            backendPath: "/admin/saas/overview",
          },
        },
      )
    }

    return {
      admin: locals.admin ?? null,
      overview: overview.ok ? overview.data : null,
      error: overview.ok
        ? null
        : (overview.error?.message ?? t("saas.errors.loadOverview")),
      inviteToken: url.searchParams.get("invite"),
      billingSetupStatus: url.searchParams.get("billingSetup"),
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_saas_overview_load_exception",
      },
      extra: {
        backendPath: "/admin/saas/overview",
      },
    })

    return {
      admin: locals.admin ?? null,
      overview: null,
      error: t("saas.errors.loadOverview"),
      inviteToken: url.searchParams.get("invite"),
      billingSetupStatus: url.searchParams.get("billingSetup"),
    }
  }
}

export const actions: Actions = {
  acceptInvite: async ({ request, fetch, cookies, locals }) => {
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
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.acceptInvite",
      )
    }

    return { inviteAccepted: true }
  },

  createTenant: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "createTenant")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await requestJson<SaasTenantProvisioning>(
      fetch,
      cookies,
      "/admin/saas/tenants",
      "POST",
      {
        ...stepUpPayload,
        slug: formData.get("slug")?.toString().trim() ?? "",
        name: formData.get("name")?.toString().trim() ?? "",
        billingEmail: parseOptionalString(formData.get("billingEmail")),
        status: formData.get("status")?.toString() || "active",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createTenant",
      )
    }

    const sandboxProject = response.data.bootstrap.sandboxProject
    const quickstartResponse = await issueHelloRewardKey(
      fetch,
      cookies,
      sandboxProject.id,
      `${sandboxProject.name} hello-reward`,
      stepUpPayload,
    )

    return {
      tenantCreated: true,
      tenantProvisioned: response.data,
      sandboxQuickstart: quickstartResponse.ok
        ? buildHelloRewardQuickstart({
            tenantName: response.data.name,
            projectId: sandboxProject.id,
            projectName: sandboxProject.name,
            projectSlug: sandboxProject.slug,
            environment: sandboxProject.environment,
            issuedKey: quickstartResponse.data,
          })
        : null,
      sandboxQuickstartWarning: quickstartResponse.ok
        ? null
        : t("saas.notices.sandboxQuickstartPendingDescription"),
    }
  },

  createProject: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "createProject")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const strategyParams = parseOptionalJsonObject(
      formData.get("strategyParams"),
    )
    if (!strategyParams.ok) {
      return actionFail(400, t, strategyParams.errorKey)
    }

    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/projects",
      "POST",
      {
        ...stepUpPayload,
        tenantId: Number(formData.get("tenantId")),
        slug: formData.get("slug")?.toString().trim() ?? "",
        name: formData.get("name")?.toString().trim() ?? "",
        environment: formData.get("environment")?.toString() || "sandbox",
        status: formData.get("status")?.toString() || "active",
        currency: formData.get("currency")?.toString().trim() || "USD",
        drawCost: parseMoneyString(formData.get("drawCost")),
        prizePoolBalance: parseMoneyString(formData.get("prizePoolBalance")),
        strategy: formData.get("strategy")?.toString() || "weighted_gacha",
        strategyParams: strategyParams.value,
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
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createProject",
      )
    }

    return { projectCreated: true }
  },

  assignMembership: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "assignMembership")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/memberships`,
      "POST",
      {
        ...stepUpPayload,
        adminEmail: formData.get("adminEmail")?.toString().trim() ?? "",
        role: formData.get("role")?.toString() || "tenant_operator",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.saveMembership",
      )
    }

    return { membershipSaved: true }
  },

  deleteMembership: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "deleteMembership")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const tenantId = Number(formData.get("tenantId"))
    const membershipId = Number(formData.get("membershipId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/memberships/${membershipId}`,
      "DELETE",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.deleteMembership",
      )
    }

    return { membershipDeleted: true }
  },

  createInvite: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "createInvite")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/invites`,
      "POST",
      {
        ...stepUpPayload,
        email: formData.get("email")?.toString().trim() ?? "",
        role: formData.get("role")?.toString() || "tenant_operator",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createInvite",
      )
    }

    return { inviteCreated: true, inviteResult: response.data }
  },

  revokeInvite: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "revokeInvite")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const tenantId = Number(formData.get("tenantId"))
    const inviteId = Number(formData.get("inviteId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/invites/${inviteId}/revoke`,
      "POST",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.revokeInvite",
      )
    }

    return { inviteRevoked: true }
  },

  linkTenant: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "linkTenant")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await requestJson(
      fetch,
      cookies,
      "/admin/saas/tenant-links",
      "POST",
      {
        ...stepUpPayload,
        parentTenantId: Number(formData.get("parentTenantId")),
        childTenantId: Number(formData.get("childTenantId")),
        linkType: formData.get("linkType")?.toString() || "agent_client",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.saveTenantLink",
      )
    }

    return { tenantLinked: true }
  },

  unlinkTenant: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "unlinkTenant")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const linkId = Number(formData.get("linkId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenant-links/${linkId}`,
      "DELETE",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.deleteTenantLink",
      )
    }

    return { tenantUnlinked: true }
  },

  saveAgentControl: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const redirectPath = new URL(request.url).pathname
    const tenantId = Number(formData.get("tenantId"))
    const mode = formData.get("mode")?.toString() || "blocked"
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/agent-controls`,
      "POST",
      {
        agentId: formData.get("agentId")?.toString().trim() ?? "",
        mode,
        reason: formData.get("reason")?.toString().trim() ?? "",
        budgetMultiplier:
          mode === "throttled"
            ? parseOptionalNumber(formData.get("budgetMultiplier"))
            : undefined,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.saveAgentControl",
      )
    }

    throw redirect(303, redirectPath)
  },

  deleteAgentControl: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const redirectPath = new URL(request.url).pathname
    const tenantId = Number(formData.get("tenantId"))
    const controlId = Number(formData.get("controlId"))
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/agent-controls/${controlId}`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.deleteAgentControl",
      )
    }

    throw redirect(303, redirectPath)
  },

  issueKey: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "issueKey")
    if (validationError) {
      return fail(400, { error: validationError })
    }

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
        ...stepUpPayload,
        label: formData.get("label")?.toString().trim() ?? "",
        scopes,
        expiresAt: parseOptionalIsoDate(formData.get("expiresAt")),
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.issueApiKey",
      )
    }

    return {
      issuedKey: response.data,
    }
  },

  issueHelloRewardSnippet: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(
        formData,
        t,
        "issueHelloRewardSnippet",
      )
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const projectName =
      formData.get("projectName")?.toString().trim() || "Sandbox"
    const projectSlug =
      formData.get("projectSlug")?.toString().trim() || "sandbox"
    const tenantName = formData.get("tenantName")?.toString().trim() || "Tenant"
    const environment =
      formData.get("environment")?.toString() === "live" ? "live" : "sandbox"

    const response = await issueHelloRewardKey(
      fetch,
      cookies,
      projectId,
      `${projectName} hello-reward`,
      stepUpPayload,
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.issueApiKey",
      )
    }

    return {
      sandboxQuickstart: buildHelloRewardQuickstart({
        tenantName,
        projectId,
        projectName,
        projectSlug,
        environment,
        issuedKey: response.data,
      }),
    }
  },

  rotateKey: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "rotateKey")
    if (validationError) {
      return fail(400, { error: validationError })
    }

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
        ...stepUpPayload,
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
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.rotateApiKey",
      )
    }

    return {
      rotatedKey: response.data,
    }
  },

  revokeKey: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "revokeKey")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const keyId = Number(formData.get("keyId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/keys/${keyId}/revoke`,
      "POST",
      {
        ...stepUpPayload,
        reason: parseOptionalString(formData.get("reason")),
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.revokeApiKey",
      )
    }

    return { keyRevoked: true }
  },

  saveRiskEnvelope: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/risk-envelope/drafts`,
      "POST",
      {
        dailyBudgetCap: parseNullableMoneyString(
          formData.get("dailyBudgetCap"),
        ),
        maxSinglePayout: parseNullableMoneyString(
          formData.get("maxSinglePayout"),
        ),
        varianceCap: parseNullableMoneyString(formData.get("varianceCap")),
        emergencyStop: formData.get("emergencyStop") === "on",
        reason: parseOptionalString(formData.get("reason")),
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.saveRiskEnvelope",
      )
    }

    return {
      riskEnvelopeDraft: response.data,
    }
  },

  saveBilling: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const validationError = validateAdminStepUpPayload(stepUpPayload, {
      requireBreakGlass: saasActionPolicies.saveBilling.requireBreakGlass,
      messages: buildStepUpMessages(t),
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing`,
      "PUT",
      {
        ...stepUpPayload,
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
        decisionPricing: {
          reject: parseMoneyString(formData.get("decisionRejectFee"), "0.0000"),
          mute: parseMoneyString(formData.get("decisionMuteFee"), "0.0000"),
          payout: parseMoneyString(formData.get("decisionPayoutFee"), "0.0000"),
        },
        currency: formData.get("currency")?.toString().trim() || "USD",
        isBillable: formData.get("isBillable") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.saveBillingAccount",
      )
    }

    return { billingSaved: true }
  },

  openBillingPortal: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson<{ url: string }>(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing/portal`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.openBillingPortal",
      )
    }

    throw redirect(303, response.data.url)
  },

  openBillingSetup: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson<{ url: string }>(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing/setup-session`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.openBillingSetup",
      )
    }

    throw redirect(303, response.data.url)
  },

  createPrize: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "createPrize")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes`,
      "POST",
      {
        ...stepUpPayload,
        name: formData.get("name")?.toString().trim() ?? "",
        stock: Number(parseNumberString(formData.get("stock"), "0")),
        weight: Number(parseNumberString(formData.get("weight"), "1")),
        rewardAmount: parseMoneyString(formData.get("rewardAmount")),
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createPrize",
      )
    }

    return { prizeCreated: true }
  },

  createOutboundWebhook: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const projectId = Number(formData.get("projectId"))
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(
        formData,
        t,
        "createOutboundWebhook",
      )
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/outbound-webhooks`,
      "POST",
      {
        ...stepUpPayload,
        url: formData.get("url")?.toString().trim() ?? "",
        secret: formData.get("secret")?.toString().trim() ?? "",
        events: ["reward.completed"],
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createOutboundWebhook",
      )
    }

    return { outboundWebhookCreated: true }
  },

  updateOutboundWebhook: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(
        formData,
        t,
        "updateOutboundWebhook",
      )
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const webhookId = Number(formData.get("webhookId"))
    const nextSecret = parseOptionalString(formData.get("secret"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/outbound-webhooks/${webhookId}`,
      "PATCH",
      {
        ...stepUpPayload,
        url: formData.get("url")?.toString().trim() ?? "",
        ...(nextSecret ? { secret: nextSecret } : {}),
        events: ["reward.completed"],
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.updateOutboundWebhook",
      )
    }

    return { outboundWebhookUpdated: true }
  },

  deleteOutboundWebhook: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(
        formData,
        t,
        "deleteOutboundWebhook",
      )
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const webhookId = Number(formData.get("webhookId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/outbound-webhooks/${webhookId}`,
      "DELETE",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.deleteOutboundWebhook",
      )
    }

    return { outboundWebhookDeleted: true }
  },

  updatePrize: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "updatePrize")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const prizeId = Number(formData.get("prizeId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes/${prizeId}`,
      "PATCH",
      {
        ...stepUpPayload,
        name: formData.get("name")?.toString().trim() ?? "",
        stock: Number(parseNumberString(formData.get("stock"), "0")),
        weight: Number(parseNumberString(formData.get("weight"), "1")),
        rewardAmount: parseMoneyString(formData.get("rewardAmount")),
        isActive: formData.get("isActive") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.updatePrize",
      )
    }

    return { prizeUpdated: true }
  },

  deletePrize: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "deletePrize")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const projectId = Number(formData.get("projectId"))
    const prizeId = Number(formData.get("prizeId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/projects/${projectId}/prizes/${prizeId}`,
      "DELETE",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.deletePrize",
      )
    }

    return { prizeDeleted: true }
  },

  createBillingRun: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "createBillingRun")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const tenantId = Number(formData.get("tenantId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/billing-runs`,
      "POST",
      {
        ...stepUpPayload,
        periodStart: parseOptionalIsoDate(formData.get("periodStart")),
        periodEnd: parseOptionalIsoDate(formData.get("periodEnd")),
        finalize: formData.get("finalize") === "on",
        sendInvoice: formData.get("sendInvoice") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createBillingRun",
      )
    }

    return { billingRunCreated: true }
  },

  syncBillingRun: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "syncBillingRun")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/sync`,
      "POST",
      {
        ...stepUpPayload,
        finalize: formData.get("finalize") === "on",
        sendInvoice: formData.get("sendInvoice") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.syncBillingRun",
      )
    }

    return { billingRunSynced: true }
  },

  refreshBillingRun: async ({ request, fetch, cookies, locals }) => {
    const formData = await request.formData()
    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/refresh`,
      "POST",
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.refreshBillingRun",
      )
    }

    return { billingRunRefreshed: true }
  },

  settleBillingRun: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "settleBillingRun")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const billingRunId = Number(formData.get("billingRunId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/billing-runs/${billingRunId}/settle`,
      "POST",
      {
        ...stepUpPayload,
        paidOutOfBand: formData.get("paidOutOfBand") === "on",
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.settleBillingRun",
      )
    }

    return { billingRunSettled: true }
  },

  createTopUp: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const tenantId = Number(formData.get("tenantId"))
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const validationError = validateAdminStepUpPayload(stepUpPayload, {
      requireBreakGlass: saasActionPolicies.createTopUp.requireBreakGlass,
      messages: buildStepUpMessages(t),
    })
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/tenants/${tenantId}/top-ups`,
      "POST",
      {
        ...stepUpPayload,
        amount: parseMoneyString(formData.get("amount")),
        currency: formData.get("currency")?.toString().trim() || "USD",
        note: parseOptionalString(formData.get("note")),
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.createBillingTopUp",
      )
    }

    return { topUpCreated: true }
  },

  syncTopUp: async ({ request, fetch, cookies, locals }) => {
    const t = getPageT(locals?.locale)
    const formData = await request.formData()
    const { stepUpPayload, validationError } =
      getValidatedSaasActionStepUpPayload(formData, t, "syncTopUp")
    if (validationError) {
      return fail(400, { error: validationError })
    }

    const topUpId = Number(formData.get("topUpId"))
    const response = await requestJson(
      fetch,
      cookies,
      `/admin/saas/top-ups/${topUpId}/sync`,
      "POST",
      {
        ...stepUpPayload,
      },
    )

    if (!response.ok) {
      return failFromResponse(
        response,
        locals.locale,
        "saas.errors.syncBillingTopUp",
      )
    }

    return { topUpSynced: true }
  },
}
