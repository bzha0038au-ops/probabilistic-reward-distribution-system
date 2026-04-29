import type { KycTier } from "@reward/shared-types/kyc";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import {
  domainError,
  forbiddenError,
  serviceUnavailableError,
} from "../../shared/errors";
import { getConfig } from "../../shared/config";
import { logger } from "../../shared/logger";
import {
  createRateLimiter,
  type RateLimitResult,
} from "../../shared/rate-limit";

type CommunityWriteAction = "thread" | "reply";
type AutomatedSignalProvider =
  | "keyword"
  | "link"
  | "contact"
  | "openai"
  | "perspective";

type CommunitySignal = {
  provider: AutomatedSignalProvider;
  score: number;
  reason: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

export type CommunityAutomatedModerationReport = {
  source: "automated_signal";
  reason: string;
  detail: string;
  metadata: Record<string, unknown>;
};

export type CommunitySubmissionGuardResult = {
  rateLimit: RateLimitResult;
  reviewRequired: boolean;
  autoHidden: boolean;
  moderationReason: string | null;
  moderationSource: "automated_signal" | null;
  queuedReport: CommunityAutomatedModerationReport | null;
};

export type AutomatedCommunityTextModerationResult = {
  normalizedContent: string;
  moderationScore: number;
  reviewRequired: boolean;
  autoHidden: boolean;
  moderationReason: string | null;
  moderationSource: "automated_signal" | null;
  queuedReport: CommunityAutomatedModerationReport | null;
};

const KYC_TIER_RANK: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

const COMMUNITY_WRITE_POLICIES: Record<
  CommunityWriteAction,
  Record<KycTier, { limit: number; windowMs: number }>
> = {
  thread: {
    tier_0: { limit: 0, windowMs: 30 * 60 * 1000 },
    tier_1: { limit: 2, windowMs: 30 * 60 * 1000 },
    tier_2: { limit: 5, windowMs: 30 * 60 * 1000 },
  },
  reply: {
    tier_0: { limit: 0, windowMs: 10 * 60 * 1000 },
    tier_1: { limit: 8, windowMs: 10 * 60 * 1000 },
    tier_2: { limit: 20, windowMs: 10 * 60 * 1000 },
  },
};

const rateLimiters: Record<
  CommunityWriteAction,
  ReturnType<typeof createRateLimiter>
> = {
  thread: createRateLimiter({
    limit: COMMUNITY_WRITE_POLICIES.thread.tier_2.limit,
    windowMs: COMMUNITY_WRITE_POLICIES.thread.tier_2.windowMs,
    prefix: "community-thread-write",
  }),
  reply: createRateLimiter({
    limit: COMMUNITY_WRITE_POLICIES.reply.tier_2.limit,
    windowMs: COMMUNITY_WRITE_POLICIES.reply.tier_2.windowMs,
    prefix: "community-reply-write",
  }),
};

const URL_PATTERN = /\b(?:(?:https?:\/\/)|(?:www\.))[^\s<>"']+/gi;
const OFF_PLATFORM_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  score: number;
}> = [
  { label: "telegram", pattern: /\b(?:telegram|t\.me)\b/i, score: 0.55 },
  { label: "discord", pattern: /\b(?:discord|discord\.gg)\b/i, score: 0.5 },
  { label: "whatsapp", pattern: /\b(?:whatsapp|wa\.me)\b/i, score: 0.55 },
  { label: "wechat", pattern: /\bwechat\b/i, score: 0.55 },
  { label: "line", pattern: /\b(?:line|line\.me)\b/i, score: 0.45 },
];

const clampScore = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const getWritePolicy = (action: CommunityWriteAction, kycTier: KycTier) =>
  COMMUNITY_WRITE_POLICIES[action][kycTier];

const getTimeoutSignal = (timeoutMs: number) => AbortSignal.timeout(timeoutMs);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const parseKeywordList = () =>
  getConfig()
    .communityModerationKeywordList.split(/[\n,]/)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0);

const summarizeSignals = (signals: CommunitySignal[]) =>
  signals.map((signal) => signal.detail).join("; ");

const aggregateSignalScore = (signals: CommunitySignal[]) =>
  clampScore(
    signals.reduce((total, signal) => total + clampScore(signal.score), 0),
  );

const buildModerationMetadata = (
  signals: CommunitySignal[],
  moderationScore: number,
) => ({
  signalProviders: [...new Set(signals.map((signal) => signal.provider))],
  moderationScore,
  signals: signals.map((signal) => ({
    provider: signal.provider,
    score: signal.score,
    reason: signal.reason,
    detail: signal.detail,
    metadata: signal.metadata ?? null,
  })),
});

const scoreFromPerspectiveResponse = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return { maxScore: 0, attributes: {} as Record<string, number> };
  }

  const attributeScores = Reflect.get(
    payload as Record<string, unknown>,
    "attributeScores",
  );
  if (!attributeScores || typeof attributeScores !== "object") {
    return { maxScore: 0, attributes: {} as Record<string, number> };
  }

  const supportedAttributes = ["SPAM", "TOXICITY", "SEVERE_TOXICITY", "INSULT"];
  const collected = Object.fromEntries(
    supportedAttributes.flatMap((attribute) => {
      const attributePayload = Reflect.get(
        attributeScores as Record<string, unknown>,
        attribute,
      );
      const summaryScore = attributePayload
        ? Reflect.get(attributePayload as Record<string, unknown>, "summaryScore")
        : null;
      const value =
        summaryScore && typeof summaryScore === "object"
          ? Reflect.get(summaryScore as Record<string, unknown>, "value")
          : null;
      const numeric = typeof value === "number" ? clampScore(value) : null;

      return numeric === null ? [] : [[attribute, numeric]];
    }),
  );

  const maxScore = Object.values(collected).reduce(
    (current, value) => Math.max(current, value),
    0,
  );

  return { maxScore, attributes: collected };
};

const scoreFromOpenAiResponse = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return {
      maxScore: 0,
      flagged: false,
      categories: {} as Record<string, boolean>,
      categoryScores: {} as Record<string, number>,
    };
  }

  const results = Reflect.get(payload as Record<string, unknown>, "results");
  if (!Array.isArray(results) || results.length === 0) {
    return {
      maxScore: 0,
      flagged: false,
      categories: {} as Record<string, boolean>,
      categoryScores: {} as Record<string, number>,
    };
  }

  const [first] = results;
  if (!first || typeof first !== "object") {
    return {
      maxScore: 0,
      flagged: false,
      categories: {} as Record<string, boolean>,
      categoryScores: {} as Record<string, number>,
    };
  }

  const flagged = Boolean(Reflect.get(first as Record<string, unknown>, "flagged"));
  const rawCategories = Reflect.get(
    first as Record<string, unknown>,
    "categories",
  );
  const rawCategoryScores = Reflect.get(
    first as Record<string, unknown>,
    "category_scores",
  );

  const categories =
    rawCategories && typeof rawCategories === "object"
      ? Object.fromEntries(
          Object.entries(rawCategories as Record<string, unknown>).map(
            ([key, value]) => [key, Boolean(value)],
          ),
        )
      : {};

  const categoryScores =
    rawCategoryScores && typeof rawCategoryScores === "object"
      ? Object.fromEntries(
          Object.entries(rawCategoryScores as Record<string, unknown>).flatMap(
            ([key, value]) =>
              typeof value === "number" ? [[key, clampScore(value)]] : [],
          ),
        )
      : {};

  const maxScore = Object.values(categoryScores).reduce(
    (current, value) => Math.max(current, value),
    0,
  );

  return { maxScore, flagged, categories, categoryScores };
};

const verifyCommunityCaptcha = async (params: {
  captchaToken: string | null;
  remoteIp: string | null;
  kycTier: KycTier;
}) => {
  const config = getConfig();
  if (config.communityCaptchaProvider === "disabled") {
    return;
  }

  if (
    KYC_TIER_RANK[params.kycTier] >=
    KYC_TIER_RANK[config.communityCaptchaBypassMinTier]
  ) {
    return;
  }

  if (!params.captchaToken) {
    throw forbiddenError("Captcha verification required.", {
      code: API_ERROR_CODES.COMMUNITY_CAPTCHA_REQUIRED,
    });
  }

  if (!config.communityCaptchaSecret) {
    throw serviceUnavailableError("Captcha verification unavailable.");
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: config.communityCaptchaSecret,
          response: params.captchaToken,
          remoteip: params.remoteIp ?? undefined,
        }),
        signal: getTimeoutSignal(config.communityModerationTimeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(`turnstile_status_${response.status}`);
    }

    const payload = (await response.json()) as {
      success?: boolean;
      ["error-codes"]?: string[];
    };

    if (!payload.success) {
      throw forbiddenError("Captcha verification failed.", {
        code: API_ERROR_CODES.COMMUNITY_CAPTCHA_INVALID,
        details:
          payload["error-codes"]?.map((code) => `captcha:${code}`) ?? undefined,
      });
    }
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    logger.warning("community captcha verification failed", {
      err: error,
    });
    throw serviceUnavailableError("Captcha verification unavailable.");
  }
};

const runHeuristicSignals = (content: string): CommunitySignal[] => {
  const signals: CommunitySignal[] = [];
  const normalized = normalizeWhitespace(content);
  const urlMatches = normalized.match(URL_PATTERN) ?? [];
  if (urlMatches.length > 0) {
    const score = urlMatches.length > 1 ? 0.45 : 0.3;
    signals.push({
      provider: "link",
      score,
      reason: "contains_external_link",
      detail:
        urlMatches.length > 1
          ? `Contains ${urlMatches.length} external links`
          : "Contains an external link",
      metadata: {
        urls: urlMatches.slice(0, 3),
        count: urlMatches.length,
      },
    });
  }

  for (const pattern of OFF_PLATFORM_PATTERNS) {
    if (!pattern.pattern.test(normalized)) {
      continue;
    }

    signals.push({
      provider: "contact",
      score: pattern.score,
      reason: "contains_off_platform_contact",
      detail: `Contains off-platform contact hint: ${pattern.label}`,
      metadata: {
        channel: pattern.label,
      },
    });
  }

  const lowered = normalized.toLowerCase();
  const matchedKeywords = parseKeywordList().filter((keyword) =>
    lowered.includes(keyword),
  );
  if (matchedKeywords.length > 0) {
    signals.push({
      provider: "keyword",
      score: clampScore(0.35 + (matchedKeywords.length - 1) * 0.15),
      reason: "matches_spam_keyword_list",
      detail: `Matched keywords: ${matchedKeywords.slice(0, 5).join(", ")}`,
      metadata: {
        keywords: matchedKeywords,
      },
    });
  }

  return signals;
};

const runOpenAiSignal = async (content: string) => {
  const config = getConfig();
  if (
    config.communityModerationProvider !== "openai" ||
    !config.communityModerationOpenAiApiKey
  ) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.communityModerationOpenAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.communityModerationOpenAiModel,
      input: content,
    }),
    signal: getTimeoutSignal(config.communityModerationTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`openai_status_${response.status}`);
  }

  const payload = await response.json();
  const result = scoreFromOpenAiResponse(payload);
  const effectiveScore = result.flagged
    ? Math.max(result.maxScore, config.communityModerationQueueThreshold)
    : result.maxScore;

  if (!result.flagged && effectiveScore < config.communityModerationQueueThreshold) {
    return null;
  }

  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => flagged)
    .map(([key]) => key);

  return {
    provider: "openai",
    score: clampScore(effectiveScore),
    reason: result.flagged ? "openai_flagged" : "openai_high_risk_score",
    detail:
      flaggedCategories.length > 0
        ? `OpenAI flagged categories: ${flaggedCategories.join(", ")}`
        : `OpenAI moderation score ${effectiveScore.toFixed(2)}`,
    metadata: {
      model: config.communityModerationOpenAiModel,
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.categoryScores,
    },
  } satisfies CommunitySignal;
};

const runPerspectiveSignal = async (content: string) => {
  const config = getConfig();
  if (
    config.communityModerationProvider !== "perspective" ||
    !config.communityModerationPerspectiveApiKey
  ) {
    return null;
  }

  const response = await fetch(
    `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${config.communityModerationPerspectiveApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: { text: content },
        requestedAttributes: {
          SPAM: {},
          TOXICITY: {},
          SEVERE_TOXICITY: {},
          INSULT: {},
        },
        doNotStore: true,
      }),
      signal: getTimeoutSignal(config.communityModerationTimeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(`perspective_status_${response.status}`);
  }

  const payload = await response.json();
  const result = scoreFromPerspectiveResponse(payload);
  if (result.maxScore < config.communityModerationQueueThreshold) {
    return null;
  }

  return {
    provider: "perspective",
    score: result.maxScore,
    reason: "perspective_high_risk_score",
    detail: `Perspective score ${result.maxScore.toFixed(2)}`,
    metadata: {
      attributes: result.attributes,
    },
  } satisfies CommunitySignal;
};

const buildQueuedReport = (signals: CommunitySignal[]) => {
  const orderedSignals = [...signals].sort((left, right) => right.score - left.score);
  const moderationScore = aggregateSignalScore(orderedSignals);

  return {
    moderationReason: orderedSignals[0]?.reason ?? "automated_spam_signal",
    detail: summarizeSignals(orderedSignals),
    metadata: buildModerationMetadata(orderedSignals, moderationScore),
    moderationScore,
  };
};

const buildAutomatedTextModerationResult = (params: {
  normalizedContent: string;
  signals: CommunitySignal[];
}): AutomatedCommunityTextModerationResult => {
  const moderationScore = aggregateSignalScore(params.signals);
  const queueThreshold = clampScore(getConfig().communityModerationQueueThreshold);
  const autoHideThreshold = clampScore(
    getConfig().communityModerationAutoHideThreshold,
  );
  const reviewRequired = moderationScore >= queueThreshold;
  const autoHidden = moderationScore >= autoHideThreshold;

  if (!reviewRequired) {
    return {
      normalizedContent: params.normalizedContent,
      moderationScore,
      reviewRequired: false,
      autoHidden: false,
      moderationReason: null,
      moderationSource: null,
      queuedReport: null,
    };
  }

  const report = buildQueuedReport(params.signals);
  return {
    normalizedContent: params.normalizedContent,
    moderationScore,
    reviewRequired: true,
    autoHidden,
    moderationReason: report.moderationReason,
    moderationSource: "automated_signal",
    queuedReport: {
      source: "automated_signal",
      reason: report.moderationReason,
      detail: report.detail,
      metadata: {
        ...report.metadata,
        autoHidden,
      },
    },
  };
};

export const screenAutomatedCommunityText = (
  content: string,
): AutomatedCommunityTextModerationResult => {
  const normalizedContent = normalizeWhitespace(content);
  if (normalizedContent.length === 0) {
    return {
      normalizedContent,
      moderationScore: 0,
      reviewRequired: false,
      autoHidden: false,
      moderationReason: null,
      moderationSource: null,
      queuedReport: null,
    };
  }

  return buildAutomatedTextModerationResult({
    normalizedContent,
    signals: runHeuristicSignals(normalizedContent),
  });
};

const collectSignals = async (content: string) => {
  const signals = runHeuristicSignals(content);
  const config = getConfig();

  if (config.communityModerationProvider === "disabled") {
    return signals;
  }

  try {
    const providerSignal =
      config.communityModerationProvider === "openai"
        ? await runOpenAiSignal(content)
        : await runPerspectiveSignal(content);
    if (providerSignal) {
      signals.push(providerSignal);
    }
  } catch (error) {
    logger.warning("community moderation provider failed", {
      err: error,
      provider: config.communityModerationProvider,
    });
  }

  return signals;
};

export async function moderateAutomatedCommunityText(
  content: string,
): Promise<AutomatedCommunityTextModerationResult> {
  const normalizedContent = normalizeWhitespace(content);
  if (normalizedContent.length === 0) {
    return {
      normalizedContent,
      moderationScore: 0,
      reviewRequired: false,
      autoHidden: false,
      moderationReason: null,
      moderationSource: null,
      queuedReport: null,
    };
  }

  return buildAutomatedTextModerationResult({
    normalizedContent,
    signals: await collectSignals(normalizedContent),
  });
}

export async function guardCommunitySubmission(params: {
  userId: number;
  kycTier: KycTier;
  action: CommunityWriteAction;
  title?: string;
  body: string;
  captchaToken?: string | null;
  remoteIp?: string | null;
}): Promise<CommunitySubmissionGuardResult> {
  const policy = getWritePolicy(params.action, params.kycTier);
  const rateLimit = await rateLimiters[params.action].consume(
    `user:${params.userId}`,
    policy.limit,
  );

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
    );
    throw domainError(
      429,
      `Community ${params.action === "thread" ? "thread" : "reply"} rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      {
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        details: [`retry_after_seconds:${retryAfterSeconds}`],
      },
    );
  }

  await verifyCommunityCaptcha({
    captchaToken: params.captchaToken ?? null,
    remoteIp: params.remoteIp ?? null,
    kycTier: params.kycTier,
  });

  const content = normalizeWhitespace(
    [params.title, params.body].filter(Boolean).join("\n"),
  );
  const signals = await collectSignals(content);
  const moderationScore = aggregateSignalScore(signals);
  const queueThreshold = clampScore(getConfig().communityModerationQueueThreshold);
  const autoHideThreshold = clampScore(
    getConfig().communityModerationAutoHideThreshold,
  );
  const reviewRequired = moderationScore >= queueThreshold;
  const autoHidden = moderationScore >= autoHideThreshold;

  if (!reviewRequired) {
    return {
      rateLimit,
      reviewRequired: false,
      autoHidden: false,
      moderationReason: null,
      moderationSource: null,
      queuedReport: null,
    };
  }

  const report = buildQueuedReport(signals);
  return {
    rateLimit,
    reviewRequired: true,
    autoHidden,
    moderationReason: report.moderationReason,
    moderationSource: "automated_signal",
    queuedReport: {
      source: "automated_signal",
      reason: report.moderationReason,
      detail: report.detail,
      metadata: {
        ...report.metadata,
        autoHidden,
      },
    },
  };
}
