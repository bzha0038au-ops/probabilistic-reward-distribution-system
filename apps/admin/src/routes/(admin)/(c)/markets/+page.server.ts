import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import {
  CancelPredictionMarketRequestSchema,
  CreatePredictionMarketRequestSchema,
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

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  const t = createTranslator(getMessages(locals.locale))

  try {
    const response = await apiRequest(fetch, cookies, "/admin/markets")
    if (!response.ok) {
      return {
        markets: [],
        error: response.error?.message ?? t("markets.errors.loadData"),
      }
    }

    const parsed = PredictionMarketSummarySchema.array().safeParse(
      response.data ?? [],
    )
    if (!parsed.success) {
      return {
        markets: [],
        error: t("markets.errors.unexpectedResponse"),
      }
    }

    return {
      markets: parsed.data,
      error: null,
    }
  } catch (error) {
    return {
      markets: [],
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
}
