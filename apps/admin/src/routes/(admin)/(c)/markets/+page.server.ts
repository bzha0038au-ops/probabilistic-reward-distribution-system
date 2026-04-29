import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  CancelPredictionMarketRequestSchema,
  CreatePredictionMarketRequestSchema,
  PredictionMarketAppealAcknowledgeRequestSchema,
  PredictionMarketAppealQueueItemSchema,
  PredictionMarketOracleBindingRequestSchema,
  PredictionMarketSummarySchema,
  SettlePredictionMarketRequestSchema,
} from "@reward/shared-types/prediction-market"

import { createTranslator, getMessages } from "$lib/i18n"
import { apiRequest } from "$lib/server/api"
import {
  parseAdminStepUpPayload,
  validateAdminStepUpPayload,
} from "$lib/server/admin-step-up"

const getActionT = (locale?: Parameters<typeof getMessages>[0]) =>
  createTranslator(getMessages(locale ?? "en"))

const parseOptionalText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseRequiredText = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const parseLines = (value: FormDataEntryValue | null) =>
  typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : []

const parseTags = (value: FormDataEntryValue | null) =>
  Array.from(
    new Set(
      (typeof value === "string" ? value : "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )

const VIG_PERCENT_PATTERN = /^\d+(?:\.\d{1,2})?$/

const parseVigBps = (
  value: FormDataEntryValue | null,
  t: ReturnType<typeof createTranslator>,
) => {
  const raw = parseRequiredText(value)
  if (!raw || !VIG_PERCENT_PATTERN.test(raw)) {
    return { value: null, error: t("markets.errors.invalidVigPercent") }
  }

  const percent = Number(raw)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { value: null, error: t("markets.errors.invalidVigPercent") }
  }

  return {
    value: Math.round(percent * 100),
    error: null,
  }
}

const parseOptionalJsonRecord = (
  value: FormDataEntryValue | null,
  t: ReturnType<typeof createTranslator>,
) => {
  const raw = parseOptionalText(value)
  if (!raw) {
    return { value: null, error: null }
  }

  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { value: null, error: t("markets.errors.invalidJson") }
    }

    return { value: parsed as Record<string, unknown>, error: null }
  } catch {
    return { value: null, error: t("markets.errors.invalidJson") }
  }
}

const parseOutcomes = (
  value: FormDataEntryValue | null,
  t: ReturnType<typeof createTranslator>,
) => {
  const lines = parseLines(value)
  if (lines.length < 2) {
    return { value: null, error: t("markets.errors.invalidOutcomes") }
  }

  const outcomes = []
  for (const line of lines) {
    const parts = line.split("|").map((part) => part.trim())
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { value: null, error: t("markets.errors.invalidOutcomes") }
    }

    outcomes.push({
      key: parts[0],
      label: parts[1],
    })
  }

  return { value: outcomes, error: null }
}

const buildOraclePayload = (
  formData: FormData,
  t: ReturnType<typeof createTranslator>,
  options: { requireSource: boolean },
) => {
  const source = parseOptionalText(formData.get("oracleSource"))
  const externalRef = parseOptionalText(formData.get("oracleExternalRef"))
  const reportedAt = parseOptionalText(formData.get("oracleReportedAt"))
  const payloadHash = parseOptionalText(formData.get("oraclePayloadHash"))
  const parsedPayload = parseOptionalJsonRecord(
    formData.get("oraclePayload"),
    t,
  )

  if (parsedPayload.error) {
    return { oracle: null, error: parsedPayload.error }
  }

  const hasOptionalOracleData =
    !!externalRef ||
    !!reportedAt ||
    !!payloadHash ||
    parsedPayload.value !== null

  if (options.requireSource && !source) {
    return { oracle: null, error: t("markets.errors.oracleSourceRequired") }
  }

  if (!source && hasOptionalOracleData) {
    return { oracle: null, error: t("markets.errors.oracleSourceRequired") }
  }

  if (!source) {
    return { oracle: null, error: null }
  }

  return {
    oracle: {
      source,
      externalRef: externalRef ?? undefined,
      reportedAt: reportedAt ?? undefined,
      payloadHash: payloadHash ?? undefined,
      payload: parsedPayload.value ?? undefined,
    },
    error: null,
  }
}

const buildOracleBindingPayload = (
  formData: FormData,
  t: ReturnType<typeof createTranslator>,
) => {
  const provider = parseRequiredText(formData.get("oracleProvider"))
  if (!provider) {
    return { oracleBinding: null, error: t("markets.errors.oracleProviderRequired") }
  }

  const parsedConfig = parseOptionalJsonRecord(
    formData.get("oracleBindingConfig"),
    t,
  )
  if (parsedConfig.error) {
    return { oracleBinding: null, error: parsedConfig.error }
  }

  const payload = {
    provider,
    name: parseOptionalText(formData.get("oracleBindingName")) ?? undefined,
    config: parsedConfig.value ?? undefined,
  }
  const parsed = PredictionMarketOracleBindingRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      oracleBinding: null,
      error:
        parsed.error.issues[0]?.message ??
        t("markets.errors.invalidOracleBinding"),
    }
  }

  return {
    oracleBinding: parsed.data,
    error: null,
  }
}

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  const t = createTranslator(getMessages(locals.locale))

  try {
    const [marketsResponse, appealsResponse] = await Promise.all([
      apiRequest(fetch, cookies, "/admin/markets"),
      apiRequest(fetch, cookies, "/admin/markets/appeals"),
    ])

    let error: string | null = null
    const markets = marketsResponse.ok
      ? PredictionMarketSummarySchema.array().safeParse(marketsResponse.data ?? [])
      : null
    const appeals = appealsResponse.ok
      ? PredictionMarketAppealQueueItemSchema.array().safeParse(
          appealsResponse.data ?? [],
        )
      : null

    if (!marketsResponse.ok) {
      error = marketsResponse.error?.message ?? t("markets.errors.loadData")
    } else if (!markets?.success) {
      error = t("markets.errors.unexpectedResponse")
    }
    if (!appealsResponse.ok) {
      error ??=
        appealsResponse.error?.message ?? t("markets.errors.loadAppeals")
    } else if (!appeals?.success) {
      error ??= t("markets.errors.unexpectedAppealsResponse")
    }

    return {
      markets: markets?.success ? markets.data : [],
      appeals: appeals?.success ? appeals.data : [],
      error,
    }
  } catch (error) {
    return {
      markets: [],
      appeals: [],
      error:
        error instanceof Error ? error.message : t("markets.errors.loadData"),
    }
  }
}

export const actions: Actions = {
  create: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUpPayload, {
      messages: {
        totpRequired: t("markets.errors.missingTotp"),
        breakGlassRequired: t("markets.errors.missingTotp"),
      },
    })

    if (stepUpError) {
      return fail(400, { error: stepUpError })
    }

    const parsedOutcomes = parseOutcomes(formData.get("outcomes"), t)
    if (parsedOutcomes.error) {
      return fail(400, { error: parsedOutcomes.error })
    }

    const tags = parseTags(formData.get("tags"))
    if (tags.length === 0) {
      return fail(400, { error: t("markets.errors.invalidTags") })
    }
    const parsedVigBps = parseVigBps(formData.get("vigPercent"), t)
    if (parsedVigBps.error || parsedVigBps.value === null) {
      return fail(400, {
        error: parsedVigBps.error ?? t("markets.errors.invalidVigPercent"),
      })
    }
    const parsedOracleBinding = buildOracleBindingPayload(formData, t)
    if (parsedOracleBinding.error || !parsedOracleBinding.oracleBinding) {
      return fail(400, {
        error:
          parsedOracleBinding.error ??
          t("markets.errors.invalidOracleBinding"),
      })
    }

    const payload = {
      slug: parseRequiredText(formData.get("slug")),
      roundKey: parseRequiredText(formData.get("roundKey")),
      title: parseRequiredText(formData.get("title")),
      description: parseOptionalText(formData.get("description")),
      resolutionRules: parseRequiredText(formData.get("resolutionRules")),
      sourceOfTruth: parseRequiredText(formData.get("sourceOfTruth")),
      category: parseRequiredText(formData.get("category")),
      tags,
      invalidPolicy: parseRequiredText(formData.get("invalidPolicy")),
      vigBps: parsedVigBps.value,
      oracleBinding: parsedOracleBinding.oracleBinding,
      outcomes: parsedOutcomes.value,
      opensAt: parseOptionalText(formData.get("opensAt")) ?? undefined,
      locksAt: parseRequiredText(formData.get("locksAt")),
      resolvesAt: parseOptionalText(formData.get("resolvesAt")),
    }

    const parsed = CreatePredictionMarketRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return fail(400, {
        error:
          parsed.error.issues[0]?.message ?? t("markets.errors.createFailed"),
      })
    }

    const response = await apiRequest(fetch, cookies, "/admin/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        ...stepUpPayload,
      }),
    })

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? t("markets.errors.createFailed"),
      })
    }

    return {
      success: true,
      actionType: "create",
      marketTitle: parsed.data.title,
    }
  },
  settle: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const marketId = parseRequiredText(formData.get("marketId"))
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUpPayload, {
      messages: {
        totpRequired: t("markets.errors.missingTotp"),
        breakGlassRequired: t("markets.errors.missingTotp"),
      },
    })

    if (!marketId) {
      return fail(400, { error: t("markets.errors.missingMarketId") })
    }
    if (stepUpError) {
      return fail(400, { error: stepUpError })
    }

    const winningOutcomeKey = parseRequiredText(
      formData.get("winningOutcomeKey"),
    )
    if (!winningOutcomeKey) {
      return fail(400, { error: t("markets.errors.winningOutcomeRequired") })
    }

    const parsedOracle = buildOraclePayload(formData, t, {
      requireSource: true,
    })
    if (parsedOracle.error || !parsedOracle.oracle) {
      return fail(400, {
        error: parsedOracle.error ?? t("markets.errors.oracleSourceRequired"),
      })
    }

    const payload = {
      winningOutcomeKey,
      oracle: parsedOracle.oracle,
    }
    const parsed = SettlePredictionMarketRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return fail(400, {
        error:
          parsed.error.issues[0]?.message ?? t("markets.errors.settleFailed"),
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/markets/${marketId}/settle`,
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
        error: response.error?.message ?? t("markets.errors.settleFailed"),
      })
    }

    return {
      success: true,
      actionType: "settle",
      marketId,
    }
  },
  cancel: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const marketId = parseRequiredText(formData.get("marketId"))
    const stepUpPayload = parseAdminStepUpPayload(formData)
    const stepUpError = validateAdminStepUpPayload(stepUpPayload, {
      messages: {
        totpRequired: t("markets.errors.missingTotp"),
        breakGlassRequired: t("markets.errors.missingTotp"),
      },
    })

    if (!marketId) {
      return fail(400, { error: t("markets.errors.missingMarketId") })
    }
    if (stepUpError) {
      return fail(400, { error: stepUpError })
    }

    const reason = parseRequiredText(formData.get("reason"))
    if (!reason) {
      return fail(400, { error: t("markets.errors.cancelReasonRequired") })
    }

    const parsedOracle = buildOraclePayload(formData, t, {
      requireSource: false,
    })
    if (parsedOracle.error) {
      return fail(400, { error: parsedOracle.error })
    }

    const parsedMetadata = parseOptionalJsonRecord(
      formData.get("cancellationMetadata"),
      t,
    )
    if (parsedMetadata.error) {
      return fail(400, { error: parsedMetadata.error })
    }

    const payload = {
      reason,
      oracle: parsedOracle.oracle,
      metadata: parsedMetadata.value ?? undefined,
    }
    const parsed = CancelPredictionMarketRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return fail(400, {
        error:
          parsed.error.issues[0]?.message ?? t("markets.errors.cancelFailed"),
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/markets/${marketId}/cancel`,
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
        error: response.error?.message ?? t("markets.errors.cancelFailed"),
      })
    }

    return {
      success: true,
      actionType: "cancel",
      marketId,
    }
  },
  acknowledgeAppeal: async ({ request, fetch, cookies, locals }) => {
    const t = getActionT(locals?.locale)
    const formData = await request.formData()
    const appealId = parseRequiredText(formData.get("appealId"))

    if (!appealId) {
      return fail(400, { error: t("markets.errors.missingAppealId") })
    }

    const payload = {
      note: parseOptionalText(formData.get("acknowledgeNote")) ?? undefined,
    }
    const parsed = PredictionMarketAppealAcknowledgeRequestSchema.safeParse(
      payload,
    )
    if (!parsed.success) {
      return fail(400, {
        error:
          parsed.error.issues[0]?.message ??
          t("markets.errors.acknowledgeAppealFailed"),
      })
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/markets/appeals/${appealId}/acknowledge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      },
    )

    if (!response.ok) {
      return fail(response.status, {
        error:
          response.error?.message ?? t("markets.errors.acknowledgeAppealFailed"),
      })
    }

    return {
      success: true,
      actionType: "acknowledgeAppeal",
      appealId,
    }
  },
}
