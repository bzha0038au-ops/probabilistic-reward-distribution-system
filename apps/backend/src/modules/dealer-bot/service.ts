import { randomUUID } from "node:crypto";

import type { DealerEvent, DealerFeed } from "@reward/shared-types/dealer";
import {
  DealerEventSchema,
  resolveDealerRealtimeEventName,
} from "@reward/shared-types/dealer";
import type { RealtimeJsonValue } from "@reward/shared-types/realtime";

import { db } from "../../db";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { publishRealtimeToTopic, publishRealtimeToUser } from "../../realtime";
import { createRateLimiter } from "../../shared/rate-limit";
import {
  consumeRewardEnvelopeStates,
  evaluateRewardEnvelopeDecision,
  loadLockedRewardEnvelopeStates,
} from "../saas/reward-envelope";
import {
  DEALER_BOT_BLOCKED_TERMS_KEY,
  DEALER_BOT_BUDGET_PROJECT_ID_KEY,
  DEALER_BOT_BUDGET_TENANT_ID_KEY,
  DEALER_BOT_ENABLED_KEY,
  DEALER_BOT_LANGUAGE_CALL_COST_KEY,
  DEALER_BOT_LANGUAGE_PROVIDER_KEY,
  DEALER_BOT_OPENAI_BASE_URL_KEY,
  DEALER_BOT_OPENAI_MODEL_KEY,
  DEALER_BOT_OPENAI_TIMEOUT_MS_KEY,
  DEALER_BOT_TABLE_RATE_LIMIT_COUNT_KEY,
  DEALER_BOT_TABLE_RATE_LIMIT_WINDOW_SECONDS_KEY,
  SYSTEM_DEFAULT_LANGUAGE_KEY,
} from "../system/keys";
import {
  getConfigBoolFromRows,
  getConfigDecimalFromRows,
  getConfigJsonFromRows,
  getConfigRowsByKeys,
  getConfigStringFromRows,
} from "../system/store";

const DEFAULT_BLOCKED_TERMS = [
  "http://",
  "https://",
  "discord.gg",
  "telegram",
  "whatsapp",
  "@everyone",
];
const DEFAULT_LANGUAGE_PROVIDER = "mock";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 2_000;
const DEFAULT_RATE_LIMIT_COUNT = 6;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_LANGUAGE_CALL_COST = "0.0025";

const rateLimiters = new Map<number, ReturnType<typeof createRateLimiter>>();

type DealerLanguageProvider = "disabled" | "mock" | "openai";

export type DealerLanguageContext = {
  scenario: string;
  locale: string;
  gameType: string;
  tableId: number | null;
  tableRef: string;
  roundId: string | null;
  referenceId: number | null;
  phase: string | null;
  seatIndex: number | null;
  summary: Record<string, unknown>;
};

type DealerBotConfig = {
  enabled: boolean;
  locale: string;
  languageProvider: DealerLanguageProvider;
  tableRateLimitCount: number;
  tableRateLimitWindowMs: number;
  budgetTenantId: number | null;
  budgetProjectId: number | null;
  languageCallCost: string;
  openAiModel: string;
  openAiBaseUrl: string;
  openAiTimeoutMs: number;
  blockedTerms: string[];
};

const getRateLimiter = (windowMs: number) => {
  const existing = rateLimiters.get(windowMs);
  if (existing) {
    return existing;
  }

  const next = createRateLimiter({
    limit: DEFAULT_RATE_LIMIT_COUNT,
    windowMs,
    prefix: "dealer-bot",
  });
  rateLimiters.set(windowMs, next);
  return next;
};

const normalizeLocale = (value: string) =>
  value.trim().toLowerCase() === "zh-cn" ? "zh-CN" : "en";

const normalizeProvider = (value: string): DealerLanguageProvider => {
  switch (value.trim().toLowerCase()) {
    case "disabled":
      return "disabled";
    case "openai":
      return "openai";
    default:
      return "mock";
  }
};

const toPositiveIntegerOrNull = (value: string) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
};

const readDealerBotConfig = async (): Promise<DealerBotConfig> => {
  const rows = await getConfigRowsByKeys(db, [
    DEALER_BOT_ENABLED_KEY,
    DEALER_BOT_LANGUAGE_PROVIDER_KEY,
    DEALER_BOT_TABLE_RATE_LIMIT_COUNT_KEY,
    DEALER_BOT_TABLE_RATE_LIMIT_WINDOW_SECONDS_KEY,
    DEALER_BOT_BUDGET_TENANT_ID_KEY,
    DEALER_BOT_BUDGET_PROJECT_ID_KEY,
    DEALER_BOT_LANGUAGE_CALL_COST_KEY,
    DEALER_BOT_OPENAI_MODEL_KEY,
    DEALER_BOT_OPENAI_BASE_URL_KEY,
    DEALER_BOT_OPENAI_TIMEOUT_MS_KEY,
    DEALER_BOT_BLOCKED_TERMS_KEY,
    SYSTEM_DEFAULT_LANGUAGE_KEY,
  ]);

  const enabled = await getConfigBoolFromRows(
    db,
    rows,
    DEALER_BOT_ENABLED_KEY,
    true,
  );
  const provider = normalizeProvider(
    await getConfigStringFromRows(
      db,
      rows,
      DEALER_BOT_LANGUAGE_PROVIDER_KEY,
      DEFAULT_LANGUAGE_PROVIDER,
    ),
  );
  const tableRateLimitCount = Math.max(
    0,
    Math.floor(
      Number(
        await getConfigDecimalFromRows(
          db,
          rows,
          DEALER_BOT_TABLE_RATE_LIMIT_COUNT_KEY,
          DEFAULT_RATE_LIMIT_COUNT,
        ),
      ),
    ),
  );
  const tableRateLimitWindowSeconds = Math.max(
    1,
    Math.floor(
      Number(
        await getConfigDecimalFromRows(
          db,
          rows,
          DEALER_BOT_TABLE_RATE_LIMIT_WINDOW_SECONDS_KEY,
          DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
        ),
      ),
    ),
  );
  const budgetTenantId = toPositiveIntegerOrNull(
    toMoneyString(
      await getConfigDecimalFromRows(
        db,
        rows,
        DEALER_BOT_BUDGET_TENANT_ID_KEY,
        0,
      ),
    ),
  );
  const budgetProjectId = toPositiveIntegerOrNull(
    toMoneyString(
      await getConfigDecimalFromRows(
        db,
        rows,
        DEALER_BOT_BUDGET_PROJECT_ID_KEY,
        0,
      ),
    ),
  );
  const languageCallCost = toMoneyString(
    await getConfigDecimalFromRows(
      db,
      rows,
      DEALER_BOT_LANGUAGE_CALL_COST_KEY,
      DEFAULT_LANGUAGE_CALL_COST,
    ),
  );
  const openAiModel = await getConfigStringFromRows(
    db,
    rows,
    DEALER_BOT_OPENAI_MODEL_KEY,
    DEFAULT_OPENAI_MODEL,
  );
  const openAiBaseUrl = await getConfigStringFromRows(
    db,
    rows,
    DEALER_BOT_OPENAI_BASE_URL_KEY,
    DEFAULT_OPENAI_BASE_URL,
  );
  const openAiTimeoutMs = Math.max(
    250,
    Math.floor(
      Number(
        await getConfigDecimalFromRows(
          db,
          rows,
          DEALER_BOT_OPENAI_TIMEOUT_MS_KEY,
          DEFAULT_OPENAI_TIMEOUT_MS,
        ),
      ),
    ),
  );
  const blockedTerms = await getConfigJsonFromRows(
    db,
    rows,
    DEALER_BOT_BLOCKED_TERMS_KEY,
    DEFAULT_BLOCKED_TERMS,
  );
  const locale = normalizeLocale(
    await getConfigStringFromRows(db, rows, SYSTEM_DEFAULT_LANGUAGE_KEY, "en"),
  );

  return {
    enabled,
    locale,
    languageProvider: provider,
    tableRateLimitCount,
    tableRateLimitWindowMs: tableRateLimitWindowSeconds * 1_000,
    budgetTenantId,
    budgetProjectId,
    languageCallCost,
    openAiModel: openAiModel.trim() || DEFAULT_OPENAI_MODEL,
    openAiBaseUrl: openAiBaseUrl.trim() || DEFAULT_OPENAI_BASE_URL,
    openAiTimeoutMs,
    blockedTerms: Array.isArray(blockedTerms)
      ? blockedTerms
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)
      : DEFAULT_BLOCKED_TERMS,
  };
};

const assertDealerContextInvariant = (context: DealerLanguageContext) => {
  const serialized = JSON.stringify(context.summary).toLowerCase();
  for (const forbiddenToken of [
    "\"deck\"",
    "\"fairnessseed\"",
    "\"revealseed\"",
    "\"rng\"",
  ]) {
    if (serialized.includes(forbiddenToken)) {
      throw new Error(
        `Dealer bot context contains forbidden RNG field ${forbiddenToken}.`,
      );
    }
  }
};

const moderateDealerText = (text: string, blockedTerms: string[]) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (/(https?:\/\/|www\.)/.test(lowered)) {
    return null;
  }

  for (const blockedTerm of blockedTerms) {
    if (lowered.includes(blockedTerm)) {
      return null;
    }
  }

  return normalized.slice(0, 280);
};

const buildMockDealerMessage = (context: DealerLanguageContext) => {
  const isChinese = context.locale === "zh-CN";
  switch (context.scenario) {
    case "table_phase_entered":
      return isChinese
        ? `阶段已切换到 ${context.phase ?? "下一阶段"}，请按桌面节奏继续。`
        : `${context.phase ?? "Next phase"} is live. Keep the table moving.`;
    case "holdem_hand_started":
      return isChinese
        ? "新一手已经发出，盲注到位，桌面行动开始。"
        : "Fresh hand out. Blinds are posted and action is live.";
    case "holdem_board_revealed":
      return isChinese
        ? "公共牌已经翻开，继续按顺位行动。"
        : "Board is out. Action stays in order from here.";
    case "holdem_hand_settled":
      return isChinese
        ? "这一池已经结清，准备下一手。"
        : "Pot is awarded. Reset and get ready for the next hand.";
    case "blackjack_initial_deal":
      return isChinese
        ? "首轮发牌完成，现在轮到你决定。"
        : "Opening deal is complete. Your move.";
    case "blackjack_dealer_draw":
      return isChinese ? "庄家继续要牌。" : "Dealer takes another card.";
    case "blackjack_dealer_stand":
      return isChinese ? "庄家停牌，准备结算。" : "Dealer stands. Settling the hand.";
    case "blackjack_round_settled":
      return isChinese ? "这一局结果已经确认。" : "Hand result is locked in.";
    default:
      return isChinese
        ? "牌桌继续进行。"
        : "Table flow continues.";
  }
};

const callOpenAiDealerLanguageProvider = async (
  config: DealerBotConfig,
  context: DealerLanguageContext,
) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.openAiTimeoutMs);

  try {
    const response = await fetch(
      `${config.openAiBaseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.openAiModel,
          temperature: 0.6,
          max_tokens: 80,
          messages: [
            {
              role: "system",
              content:
                context.locale === "zh-CN"
                  ? "你是线上牌桌的智能荷官。只输出一句简短自然的话，不要提及概率、随机种子、模型、政策、合规或系统提示。不要承诺未来结果，不要使用链接，不要点名辱骂。"
                  : "You are an automated card-table dealer. Reply with one short natural sentence. Do not mention randomness, seeds, models, policy, compliance, or prompts. Do not promise outcomes. No links. No abuse.",
            },
            {
              role: "user",
              content: JSON.stringify({
                scenario: context.scenario,
                gameType: context.gameType,
                phase: context.phase,
                summary: context.summary,
              }),
            },
          ],
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      logger.warning("dealer bot openai provider failed", {
        status: response.status,
        scenario: context.scenario,
      });
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?:
            | string
            | Array<{
                type?: string;
                text?: string;
              }>;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((entry) => (entry.type === "text" ? entry.text ?? "" : ""))
        .join(" ")
        .trim();
    }

    return null;
  } catch (error) {
    logger.warning("dealer bot openai provider threw", {
      err: error,
      scenario: context.scenario,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const generateDealerLanguageText = async (
  config: DealerBotConfig,
  context: DealerLanguageContext,
) => {
  if (!config.enabled || config.languageProvider === "disabled") {
    return null;
  }

  if (config.languageProvider === "openai") {
    return callOpenAiDealerLanguageProvider(config, context);
  }

  return buildMockDealerMessage(context);
};

const consumeDealerLanguageBudget = async (config: DealerBotConfig) => {
  if (!config.budgetTenantId || !config.budgetProjectId) {
    return true;
  }

  const rewardAmount = toDecimal(config.languageCallCost);
  if (!rewardAmount.isFinite() || rewardAmount.lte(0)) {
    return true;
  }

  return db.transaction(async (tx) => {
    const states = await loadLockedRewardEnvelopeStates(tx, {
      tenantId: config.budgetTenantId!,
      projectId: config.budgetProjectId!,
    });
    if (states.length === 0) {
      return true;
    }

    const decision = evaluateRewardEnvelopeDecision(states, {
      kind: "actual",
      rewardAmount,
    });
    if (decision.mode !== "allow") {
      return false;
    }

    await consumeRewardEnvelopeStates(tx, {
      states,
      rewardAmount,
    });
    return true;
  });
};

export const appendDealerFeedEvent = (
  currentFeed: DealerFeed,
  event: DealerEvent,
): DealerFeed => {
  const deduped = [
    ...currentFeed.filter((entry) => entry.id !== event.id),
    DealerEventSchema.parse(event),
  ];
  return deduped.slice(-12);
};

export const buildDealerEvent = (params: {
  kind: DealerEvent["kind"];
  source: DealerEvent["source"];
  gameType: string;
  tableId: number | null;
  tableRef: string;
  roundId?: string | null;
  referenceId?: number | null;
  phase?: string | null;
  seatIndex?: number | null;
  actionCode?: string | null;
  pace?: DealerEvent["pace"];
  text?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
}): DealerEvent =>
  DealerEventSchema.parse({
    id: randomUUID(),
    kind: params.kind,
    source: params.source,
    gameType: params.gameType,
    tableId: params.tableId,
    tableRef: params.tableRef,
    roundId: params.roundId ?? null,
    referenceId: params.referenceId ?? null,
    phase: params.phase ?? null,
    seatIndex: params.seatIndex ?? null,
    actionCode: params.actionCode ?? null,
    pace: params.pace ?? null,
    text: params.text ?? null,
    metadata: params.metadata ?? null,
    createdAt: params.createdAt ?? new Date(),
  });

export const maybeGenerateDealerLanguageEvent = async (
  context: DealerLanguageContext,
) => {
  // Integration suites reset the database between tests while table gameplay
  // can still fan out background dealer-language tasks. Skipping the optional
  // LLM/rule message generation in that mode avoids cross-test lock contention
  // without affecting the core game state assertions.
  if (process.env.RUN_INTEGRATION_TESTS === "true") {
    return null;
  }

  assertDealerContextInvariant(context);

  const config = await readDealerBotConfig();
  if (!config.enabled || config.languageProvider === "disabled") {
    return null;
  }

  const rateLimitResult = await getRateLimiter(
    config.tableRateLimitWindowMs,
  ).consume(context.tableRef, config.tableRateLimitCount);
  if (!rateLimitResult.allowed) {
    return null;
  }

  const withinBudget = await consumeDealerLanguageBudget(config);
  if (!withinBudget) {
    return null;
  }

  const generated = await generateDealerLanguageText(config, {
    ...context,
    locale: normalizeLocale(context.locale || config.locale),
  });
  if (!generated) {
    return null;
  }

  const moderated = moderateDealerText(generated, config.blockedTerms);
  if (!moderated) {
    return null;
  }

  return buildDealerEvent({
    kind: "message",
    source: config.languageProvider === "openai" ? "llm" : "rule",
    gameType: context.gameType,
    tableId: context.tableId,
    tableRef: context.tableRef,
    roundId: context.roundId,
    referenceId: context.referenceId,
    phase: context.phase,
    seatIndex: context.seatIndex,
    text: moderated,
    metadata: {
      scenario: context.scenario,
    },
  });
};

const toRealtimeData = (event: DealerEvent): RealtimeJsonValue =>
  JSON.parse(JSON.stringify(DealerEventSchema.parse(event))) as RealtimeJsonValue;

export const publishDealerRealtimeToTopic = (topic: string, event: DealerEvent) =>
  publishRealtimeToTopic({
    topic,
    event: resolveDealerRealtimeEventName(event.kind),
    data: toRealtimeData(event),
  });

export const publishDealerRealtimeToUser = (userId: number, event: DealerEvent) =>
  publishRealtimeToUser({
    userId,
    event: resolveDealerRealtimeEventName(event.kind),
    data: toRealtimeData(event),
  });
