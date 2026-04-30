import type Decimal from "decimal.js";
import {
  predictionMarketAppeals,
  predictionMarketOracles,
  predictionMarkets,
  predictionPositions,
} from "@reward/database";
import { and, desc, eq, inArray, sql } from "@reward/database/orm";
import {
  type CancelPredictionMarketRequest,
  type PredictionMarketAppealAcknowledgeRequest,
  type PredictionMarketAppealQueueItem,
  PredictionMarketAppealQueueItemSchema,
  type PredictionMarketAppealReason,
  type PredictionMarketAppealStatus,
  PredictionMarketAppealRecordSchema,
  PredictionMarketDetailSchema,
  PredictionMarketOutcomeSchema,
  type PredictionMarketOracleBinding,
  PredictionMarketOracleBindingRequestSchema,
  PredictionMarketOracleSchema,
  PredictionMarketPortfolioItemSchema,
  PredictionMarketPortfolioStatusSchema,
  PredictionMarketTagsSchema,
  PredictionPositionStatusSchema,
  PredictionMarketStatusSchema,
  type PredictionMarketOracleBindingRequest,
  type CreatePredictionMarketRequest,
  type PredictionMarketDetail,
  type PredictionMarketHistoryResponse,
  type PredictionMarketOutcome,
  type PredictionMarketOracle,
  type PredictionMarketPortfolioFilter,
  type PredictionMarketPortfolioItem,
  type PredictionMarketPortfolioMarket,
  type PredictionMarketPortfolioResponse,
  type PredictionMarketPortfolioStatus,
  type PredictionMarketPositionMutationResponse,
  type PredictionMarketSummary,
  type PredictionPosition,
  type SettlePredictionMarketRequest,
} from "@reward/shared-types/prediction-market";

import { db, type DbClient, type DbTransaction } from "../../db";
import {
  badRequestError,
  conflictError,
  internalInvariantError,
  notFoundError,
  persistenceError,
} from "../../shared/errors";
import { getConfigView } from "../../shared/config";
import { logger } from "../../shared/logger";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";
import {
  lockAsset,
  settleLockedAsset,
  unlockAsset,
} from "../economy/service";
import { applyHouseBankrollDelta } from "../house/service";
import { assertKycStakeAllowed } from "../kyc/service";
import { sendPredictionMarketSettledNotification } from "../notification/service";
import {
  evaluatePredictionMarketOracle,
  type PredictionMarketOracleEvaluationResult,
} from "./oracle-providers";
import { resolvePariMutuelSettlement } from "./settlement";

type DbExecutor = DbClient | DbTransaction;

type StoredAppeal = typeof predictionMarketAppeals.$inferSelect;
type StoredMarket = typeof predictionMarkets.$inferSelect;
type StoredOracle = typeof predictionMarketOracles.$inferSelect;
type StoredPosition = typeof predictionPositions.$inferSelect;

type LockedMarketRow = {
  id: StoredMarket["id"];
  slug: StoredMarket["slug"];
  roundKey: StoredMarket["roundKey"];
  title: StoredMarket["title"];
  description: StoredMarket["description"];
  resolutionRules: StoredMarket["resolutionRules"];
  sourceOfTruth: StoredMarket["sourceOfTruth"];
  category: StoredMarket["category"];
  tags: StoredMarket["tags"];
  invalidPolicy: StoredMarket["invalidPolicy"];
  mechanism: StoredMarket["mechanism"];
  vigBps: StoredMarket["vigBps"];
  status: StoredMarket["status"];
  outcomes: StoredMarket["outcomes"];
  totalPoolAmount: StoredMarket["totalPoolAmount"];
  winningOutcomeKey: StoredMarket["winningOutcomeKey"];
  winningPoolAmount: StoredMarket["winningPoolAmount"];
  oracleSource: StoredMarket["oracleSource"];
  oracleExternalRef: StoredMarket["oracleExternalRef"];
  oracleReportedAt: StoredMarket["oracleReportedAt"];
  metadata: StoredMarket["metadata"];
  opensAt: StoredMarket["opensAt"];
  locksAt: StoredMarket["locksAt"];
  resolvesAt: StoredMarket["resolvesAt"];
  resolvedAt: StoredMarket["resolvedAt"];
  createdAt: StoredMarket["createdAt"];
  updatedAt: StoredMarket["updatedAt"];
};

const MARKET_REFERENCE_TYPE = "prediction_market";
const STAKE_ENTRY_TYPE = "prediction_market_stake";
const SELL_ENTRY_TYPE = "prediction_market_sell";
const PAYOUT_ENTRY_TYPE = "prediction_market_payout";
const REFUND_ENTRY_TYPE = "prediction_market_refund";
const VIG_ENTRY_TYPE = "prediction_market_vig";
const PREDICTION_MARKET_ASSET_CODE = "B_LUCK";
const PREDICTION_MARKET_SOURCE_APP = "backend.prediction_market";

const OutcomeArraySchema = PredictionMarketOutcomeSchema.array().min(2);
const TagsArraySchema = PredictionMarketTagsSchema;
const MarketDetailListSchema = PredictionMarketDetailSchema.array();
const MarketAppealQueueItemListSchema =
  PredictionMarketAppealQueueItemSchema.array();
const MarketPortfolioItemListSchema =
  PredictionMarketPortfolioItemSchema.array();
const config = getConfigView();

const normalizeJsonValue = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      return toRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const parseMarketOutcomes = (value: unknown): PredictionMarketOutcome[] => {
  const parsed = parseSchema(OutcomeArraySchema, normalizeJsonValue(value));
  if (!parsed.isValid) {
    throw internalInvariantError("Prediction market outcomes are invalid.");
  }

  return parsed.data;
};

const parseMarketTags = (value: unknown) => {
  const parsed = parseSchema(TagsArraySchema, normalizeJsonValue(value));
  if (!parsed.isValid) {
    throw internalInvariantError("Prediction market tags are invalid.");
  }

  return parsed.data;
};

const readOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const parseMarketOracle = (market: {
  oracleSource: unknown;
  oracleExternalRef: unknown;
  oracleReportedAt: unknown;
  metadata: unknown;
}): PredictionMarketOracle | null => {
  const metadata = toRecord(market.metadata);
  const storedOracle = toRecord(
    metadata ? Reflect.get(metadata, "oracle") : null,
  );
  const source =
    readOptionalString(market.oracleSource) ??
    readOptionalString(
      storedOracle ? Reflect.get(storedOracle, "source") : null,
    );

  if (!source) {
    return null;
  }

  const externalRef =
    readOptionalString(market.oracleExternalRef) ??
    readOptionalString(
      storedOracle ? Reflect.get(storedOracle, "externalRef") : null,
    );
  const payloadHash = readOptionalString(
    storedOracle ? Reflect.get(storedOracle, "payloadHash") : null,
  );
  const payload = toRecord(
    storedOracle ? Reflect.get(storedOracle, "payload") : null,
  );
  const reportedAt =
    market.oracleReportedAt instanceof Date ||
    typeof market.oracleReportedAt === "string"
      ? market.oracleReportedAt
      : (readOptionalString(
          storedOracle ? Reflect.get(storedOracle, "reportedAt") : null,
        ) ?? null);

  const parsed = PredictionMarketOracleSchema.safeParse({
    source,
    externalRef,
    reportedAt,
    payloadHash,
    payload,
  });

  return parsed.success ? parsed.data : null;
};

const buildDefaultOracleBinding = (): PredictionMarketOracleBindingRequest => ({
  provider: "manual_admin",
  name: "Manual Admin",
  config: {},
});

const resolveCreateOracleBinding = (
  value: CreatePredictionMarketRequest["oracleBinding"],
) => {
  const candidate = value ?? buildDefaultOracleBinding();
  const parsed =
    PredictionMarketOracleBindingRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw badRequestError("Prediction market oracle binding is invalid.", {
      details: parsed.error.issues.map((issue) => issue.message),
    });
  }

  return parsed.data;
};

const collectOracleOutcomeKeys = (
  binding: PredictionMarketOracleBindingRequest,
): string[] => {
  switch (binding.provider) {
    case "manual_admin":
      return [];
    case "api_pull":
      if (binding.config.outcomeValueMap) {
        return Object.values(binding.config.outcomeValueMap);
      }
      return binding.config.comparison
        ? [
            binding.config.comparison.outcomeKeyIfTrue,
            binding.config.comparison.outcomeKeyIfFalse,
          ]
        : [];
    case "chainlink":
      return [
        binding.config.comparison.outcomeKeyIfTrue,
        binding.config.comparison.outcomeKeyIfFalse,
      ];
    case "uma_oracle":
      return [
        binding.config.outcomeKeyIfTrue,
        binding.config.outcomeKeyIfFalse ?? "",
      ].filter(Boolean);
  }
};

const assertOracleBindingMatchesOutcomes = (
  binding: PredictionMarketOracleBindingRequest,
  outcomes: readonly PredictionMarketOutcome[],
) => {
  const outcomeKeySet = new Set(outcomes.map((outcome) => outcome.key));
  const missingKeys = collectOracleOutcomeKeys(binding).filter(
    (key) => !outcomeKeySet.has(key),
  );

  if (missingKeys.length > 0) {
    throw badRequestError(
      "Prediction market oracle binding references invalid outcomes.",
      {
        details: missingKeys.map((key) => `Unknown oracle outcome key: ${key}`),
      },
    );
  }
};

const serializeOracleBinding = (
  oracle: StoredOracle | null | undefined,
): PredictionMarketOracleBinding | null => {
  if (!oracle) {
    return null;
  }

  return {
    id: oracle.id,
    provider: oracle.provider,
    name: oracle.name ?? null,
    status: oracle.status,
    lastCheckedAt: oracle.lastCheckedAt ?? null,
    lastReportedAt: oracle.lastReportedAt ?? null,
    lastResolvedOutcomeKey: oracle.lastResolvedOutcomeKey ?? null,
    createdAt: oracle.createdAt,
    updatedAt: oracle.updatedAt,
  };
};

const serializePredictionMarketAppealRecord = (appeal: StoredAppeal) => {
  const parsed = PredictionMarketAppealRecordSchema.safeParse({
    id: appeal.id,
    marketId: appeal.marketId,
    oracleBindingId: appeal.oracleBindingId ?? null,
    appealKey: appeal.appealKey,
    reason: appeal.reason,
    status: appeal.status,
    provider: appeal.provider ?? null,
    title: appeal.title,
    description: appeal.description,
    metadata: toRecord(appeal.metadata),
    firstDetectedAt: appeal.firstDetectedAt,
    lastDetectedAt: appeal.lastDetectedAt,
    resolvedByAdminId: appeal.resolvedByAdminId ?? null,
    resolvedAt: appeal.resolvedAt ?? null,
    createdAt: appeal.createdAt,
    updatedAt: appeal.updatedAt,
  });
  if (!parsed.success) {
    throw internalInvariantError(
      "Prediction market appeal serialization is invalid.",
    );
  }

  return parsed.data;
};

const serializePredictionMarketAppealQueueItem = (params: {
  appeal: StoredAppeal;
  market: StoredMarket;
  oracleBinding: StoredOracle | null;
}): PredictionMarketAppealQueueItem => {
  const parsed = PredictionMarketAppealQueueItemSchema.safeParse({
    ...serializePredictionMarketAppealRecord(params.appeal),
    market: {
      id: params.market.id,
      slug: params.market.slug,
      roundKey: params.market.roundKey,
      title: params.market.title,
      status: params.market.status,
      oracleBinding: serializeOracleBinding(params.oracleBinding),
    },
  });
  if (!parsed.success) {
    throw internalInvariantError(
      "Prediction market appeal queue serialization is invalid.",
    );
  }

  return parsed.data;
};

const loadOracleBindingsByMarketId = async (
  executor: DbExecutor,
  marketIds: number[],
) => {
  if (marketIds.length === 0) {
    return new Map<number, StoredOracle>();
  }

  const rows = await executor
    .select()
    .from(predictionMarketOracles)
    .where(inArray(predictionMarketOracles.marketId, marketIds));

  return new Map(rows.map((row) => [row.marketId, row] as const));
};

const parseMarketDetailList = (value: unknown) => {
  const parsed = parseSchema(MarketDetailListSchema, value);
  if (!parsed.isValid) {
    throw internalInvariantError("Prediction market serialization is invalid.");
  }

  return parsed.data;
};

const parseMarketPortfolioItemList = (value: unknown) => {
  const parsed = parseSchema(MarketPortfolioItemListSchema, value);
  if (!parsed.isValid) {
    throw internalInvariantError(
      "Prediction market portfolio serialization is invalid.",
    );
  }

  return parsed.data;
};

const parseMarketAppealQueueItemList = (value: unknown) => {
  const parsed = parseSchema(MarketAppealQueueItemListSchema, value);
  if (!parsed.isValid) {
    throw internalInvariantError(
      "Prediction market appeal queue serialization is invalid.",
    );
  }

  return parsed.data;
};

const resolveStakeAmount = (value: string) => {
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw badRequestError("Invalid stake amount.");
  }

  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw badRequestError("Invalid stake amount.");
  }

  return amount;
};

const buildPredictionMarketAssetAudit = (
  metadata: Record<string, unknown>,
) => ({
  sourceApp: PREDICTION_MARKET_SOURCE_APP,
  metadata: {
    ...metadata,
    assetCode: PREDICTION_MARKET_ASSET_CODE,
  },
});

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const next = new Date(value);
  if (Number.isNaN(next.valueOf())) {
    throw internalInvariantError("Prediction market date is invalid.");
  }

  return next;
};

type PredictionMarketStatusSnapshot = {
  status: StoredMarket["status"] | string;
  opensAt: StoredMarket["opensAt"] | Date | string | null | undefined;
  locksAt: StoredMarket["locksAt"] | Date | string | null | undefined;
};

export const getEffectivePredictionMarketStatus = (
  market: PredictionMarketStatusSnapshot,
  now = new Date(),
) => {
  const storedStatus = PredictionMarketStatusSchema.parse(market.status);

  if (storedStatus === "resolved" || storedStatus === "cancelled") {
    return storedStatus;
  }

  const opensAt = toDate(market.opensAt);
  const locksAt = toDate(market.locksAt);
  if (!opensAt || !locksAt) {
    throw internalInvariantError("Prediction market timing is invalid.");
  }

  if (now.getTime() < opensAt.getTime()) {
    return "draft" as const;
  }

  if (now.getTime() >= locksAt.getTime()) {
    return "locked" as const;
  }

  return "open" as const;
};

const serializeStoredPosition = (
  position: StoredPosition,
): PredictionPosition => ({
  id: position.id,
  marketId: position.marketId,
  userId: position.userId,
  outcomeKey: position.outcomeKey,
  stakeAmount: toMoneyString(position.stakeAmount ?? 0),
  payoutAmount: toMoneyString(position.payoutAmount ?? 0),
  status: PredictionPositionStatusSchema.parse(position.status),
  createdAt: position.createdAt,
  settledAt: position.settledAt ?? null,
});

const serializePortfolioMarket = (
  market: StoredMarket,
  oracleBinding?: StoredOracle | null,
): PredictionMarketPortfolioMarket => ({
  id: market.id,
  slug: market.slug,
  roundKey: market.roundKey,
  title: market.title,
  description: market.description ?? null,
  resolutionRules: market.resolutionRules,
  sourceOfTruth: market.sourceOfTruth,
  category: market.category,
  tags: parseMarketTags(market.tags),
  invalidPolicy: market.invalidPolicy,
  mechanism: market.mechanism,
  vigBps: market.vigBps,
  status: getEffectivePredictionMarketStatus(market),
  outcomes: parseMarketOutcomes(market.outcomes),
  totalPoolAmount: toMoneyString(market.totalPoolAmount ?? 0),
  winningOutcomeKey: market.winningOutcomeKey ?? null,
  winningPoolAmount:
    market.winningPoolAmount === null || market.winningPoolAmount === undefined
      ? null
      : toMoneyString(market.winningPoolAmount),
  oracleBinding: serializeOracleBinding(oracleBinding),
  opensAt: market.opensAt,
  locksAt: market.locksAt,
  resolvesAt: market.resolvesAt ?? null,
  resolvedAt: market.resolvedAt ?? null,
  createdAt: market.createdAt,
  updatedAt: market.updatedAt,
});

const getPortfolioStatusForPositions = (
  positions: ReadonlyArray<StoredPosition>,
): PredictionMarketPortfolioStatus => {
  if (positions.some((position) => position.status === "open")) {
    return PredictionMarketPortfolioStatusSchema.parse("open");
  }

  if (
    positions.every(
      (position) =>
        position.status === "refunded" || position.status === "sold",
    )
  ) {
    return PredictionMarketPortfolioStatusSchema.parse("refunded");
  }

  return PredictionMarketPortfolioStatusSchema.parse("resolved");
};

const buildPortfolioItem = (params: {
  market: StoredMarket;
  positions: StoredPosition[];
  oracleBinding?: StoredOracle | null;
}): PredictionMarketPortfolioItem => {
  const { market, positions, oracleBinding } = params;
  const serializedPositions = positions.map(serializeStoredPosition);
  const portfolioStatus = getPortfolioStatusForPositions(positions);
  let totalStakeAmount = toDecimal(0);
  let openStakeAmount = toDecimal(0);
  let settledPayoutAmount = toDecimal(0);
  let refundedAmount = toDecimal(0);
  let lastActivityAt = positions[0]?.createdAt ?? market.createdAt;

  for (const position of positions) {
    totalStakeAmount = totalStakeAmount.plus(position.stakeAmount ?? 0);
    const activityAt = position.settledAt ?? position.createdAt;
    if (activityAt.getTime() > lastActivityAt.getTime()) {
      lastActivityAt = activityAt;
    }

    if (position.status === "open") {
      openStakeAmount = openStakeAmount.plus(position.stakeAmount ?? 0);
      continue;
    }

    if (position.status === "refunded" || position.status === "sold") {
      refundedAmount = refundedAmount.plus(position.payoutAmount ?? 0);
      continue;
    }

    settledPayoutAmount = settledPayoutAmount.plus(position.payoutAmount ?? 0);
  }

  return {
    portfolioStatus,
    market: serializePortfolioMarket(market, oracleBinding),
    positions: serializedPositions,
    positionCount: serializedPositions.length,
    totalStakeAmount: toMoneyString(totalStakeAmount),
    openStakeAmount: toMoneyString(openStakeAmount),
    settledPayoutAmount: toMoneyString(settledPayoutAmount),
    refundedAmount: toMoneyString(refundedAmount),
    lastActivityAt,
  };
};

const sortPortfolioItems = (items: PredictionMarketPortfolioItem[]) =>
  [...items].sort((left, right) => {
    const timeDifference =
      new Date(right.lastActivityAt).getTime() -
      new Date(left.lastActivityAt).getTime();
    if (timeDifference !== 0) {
      return timeDifference;
    }

    return right.market.id - left.market.id;
  });

const buildPortfolioSummary = (
  items: ReadonlyArray<PredictionMarketPortfolioItem>,
) => {
  let positionCount = 0;
  let totalStakeAmount = toDecimal(0);
  let openStakeAmount = toDecimal(0);
  let settledPayoutAmount = toDecimal(0);
  let refundedAmount = toDecimal(0);

  for (const item of items) {
    positionCount += item.positionCount;
    totalStakeAmount = totalStakeAmount.plus(item.totalStakeAmount);
    openStakeAmount = openStakeAmount.plus(item.openStakeAmount);
    settledPayoutAmount = settledPayoutAmount.plus(item.settledPayoutAmount);
    refundedAmount = refundedAmount.plus(item.refundedAmount);
  }

  return {
    marketCount: items.length,
    positionCount,
    totalStakeAmount: toMoneyString(totalStakeAmount),
    openStakeAmount: toMoneyString(openStakeAmount),
    settledPayoutAmount: toMoneyString(settledPayoutAmount),
    refundedAmount: toMoneyString(refundedAmount),
  };
};

const filterPortfolioItemsByStatus = (
  items: ReadonlyArray<PredictionMarketPortfolioItem>,
  status: PredictionMarketPortfolioFilter,
) =>
  status === "all"
    ? [...items]
    : items.filter((item) => item.portfolioStatus === status);

const buildOffsetPage = <T>(
  items: ReadonlyArray<T>,
  page: number,
  limit: number,
) => {
  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit + 1);

  return {
    items: pageItems.slice(0, limit),
    page,
    limit,
    hasNext: pageItems.length > limit,
  };
};

const listUserPredictionMarketPortfolioItems = async (
  userId: number,
): Promise<PredictionMarketPortfolioItem[]> => {
  const userPositions = await db
    .select()
    .from(predictionPositions)
    .where(eq(predictionPositions.userId, userId))
    .orderBy(desc(predictionPositions.createdAt), desc(predictionPositions.id));

  if (userPositions.length === 0) {
    return [];
  }

  const marketIds = [
    ...new Set(userPositions.map((position) => position.marketId)),
  ];
  const markets = await db
    .select()
    .from(predictionMarkets)
    .where(inArray(predictionMarkets.id, marketIds));

  const marketById = new Map(
    markets.map((market) => [market.id, market] as const),
  );
  const oracleBindingsByMarketId = await loadOracleBindingsByMarketId(
    db,
    marketIds,
  );
  const positionsByMarketId = new Map<number, StoredPosition[]>();
  for (const position of userPositions) {
    const list = positionsByMarketId.get(position.marketId) ?? [];
    list.push(position);
    positionsByMarketId.set(position.marketId, list);
  }

  const items = marketIds.flatMap((marketId) => {
    const market = marketById.get(marketId);
    const positions = positionsByMarketId.get(marketId) ?? [];
    if (!market || positions.length === 0) {
      return [];
    }

    return [
      buildPortfolioItem({
        market,
        positions,
        oracleBinding: oracleBindingsByMarketId.get(market.id) ?? null,
      }),
    ];
  });

  return parseMarketPortfolioItemList(sortPortfolioItems(items));
};

const serializeMarketDetails = async (
  executor: DbExecutor,
  storedMarkets: StoredMarket[],
  userId: number | null,
): Promise<PredictionMarketDetail[]> => {
  if (storedMarkets.length === 0) {
    return [];
  }

  const marketIds = storedMarkets.map((market) => market.id);
  const oracleBindingsByMarketId = await loadOracleBindingsByMarketId(
    executor,
    marketIds,
  );
  const positions = await executor
    .select()
    .from(predictionPositions)
    .where(inArray(predictionPositions.marketId, marketIds))
    .orderBy(predictionPositions.marketId, predictionPositions.createdAt);

  const positionsByMarketId = new Map<number, StoredPosition[]>();
  for (const position of positions) {
    const list = positionsByMarketId.get(position.marketId) ?? [];
    list.push(position);
    positionsByMarketId.set(position.marketId, list);
  }

  const details = storedMarkets.map((market) => {
    const outcomes = parseMarketOutcomes(market.outcomes);
    const pools = new Map<
      string,
      { totalStakeAmount: Decimal; positionCount: number }
    >();
    const marketPositions = positionsByMarketId.get(market.id) ?? [];

    for (const position of marketPositions) {
      if (position.status === "sold") {
        continue;
      }

      const current = pools.get(position.outcomeKey) ?? {
        totalStakeAmount: toDecimal(0),
        positionCount: 0,
      };
      current.totalStakeAmount = current.totalStakeAmount.plus(
        position.stakeAmount ?? 0,
      );
      current.positionCount += 1;
      pools.set(position.outcomeKey, current);
    }

    return {
      id: market.id,
      slug: market.slug,
      roundKey: market.roundKey,
      title: market.title,
      description: market.description ?? null,
      resolutionRules: market.resolutionRules,
      sourceOfTruth: market.sourceOfTruth,
      category: market.category,
      tags: parseMarketTags(market.tags),
      invalidPolicy: market.invalidPolicy,
      mechanism: market.mechanism,
      vigBps: market.vigBps,
      status: getEffectivePredictionMarketStatus(market),
      outcomes,
      outcomePools: outcomes.map((outcome) => {
        const pool = pools.get(outcome.key);
        return {
          outcomeKey: outcome.key,
          label: outcome.label,
          totalStakeAmount: toMoneyString(pool?.totalStakeAmount ?? 0),
          positionCount: pool?.positionCount ?? 0,
        };
      }),
      totalPoolAmount: toMoneyString(market.totalPoolAmount ?? 0),
      winningOutcomeKey: market.winningOutcomeKey ?? null,
      winningPoolAmount:
        market.winningPoolAmount === null ||
        market.winningPoolAmount === undefined
          ? null
          : toMoneyString(market.winningPoolAmount),
      oracle: parseMarketOracle(market),
      oracleBinding:
        serializeOracleBinding(oracleBindingsByMarketId.get(market.id)) ?? null,
      opensAt: market.opensAt,
      locksAt: market.locksAt,
      resolvesAt: market.resolvesAt ?? null,
      resolvedAt: market.resolvedAt ?? null,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
      userPositions:
        userId === null
          ? []
          : marketPositions
              .filter((position) => position.userId === userId)
              .map(serializeStoredPosition),
    };
  });

  return parseMarketDetailList(details);
};

const getSerializedMarketById = async (
  executor: DbExecutor,
  marketId: number,
  userId: number | null,
) => {
  const [market] = await executor
    .select()
    .from(predictionMarkets)
    .where(eq(predictionMarkets.id, marketId))
    .limit(1);

  if (!market) {
    return null;
  }

  const [detail] = await serializeMarketDetails(executor, [market], userId);
  return detail ?? null;
};

const lockPredictionMarket = async (
  tx: DbTransaction,
  marketId: number,
): Promise<LockedMarketRow | null> => {
  const result = await tx.execute(sql`
    SELECT id,
           slug,
           round_key AS "roundKey",
           title,
           description,
           resolution_rules AS "resolutionRules",
           source_of_truth AS "sourceOfTruth",
           category,
           tags,
           invalid_policy AS "invalidPolicy",
           mechanism,
           vig_bps AS "vigBps",
           status,
           outcomes,
           total_pool_amount AS "totalPoolAmount",
           winning_outcome_key AS "winningOutcomeKey",
           winning_pool_amount AS "winningPoolAmount",
           oracle_source AS "oracleSource",
           oracle_external_ref AS "oracleExternalRef",
           oracle_reported_at AS "oracleReportedAt",
           metadata,
           opens_at AS "opensAt",
           locks_at AS "locksAt",
           resolves_at AS "resolvesAt",
           resolved_at AS "resolvedAt",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM ${predictionMarkets}
    WHERE ${predictionMarkets.id} = ${marketId}
    FOR UPDATE
  `);

  return readSqlRows<LockedMarketRow>(result)[0] ?? null;
};

const lockPredictionPosition = async (
  tx: DbTransaction,
  params: {
    marketId: number;
    positionId: number;
    userId: number;
  },
): Promise<StoredPosition | null> => {
  const result = await tx.execute(sql`
    SELECT id,
           market_id AS "marketId",
           user_id AS "userId",
           outcome_key AS "outcomeKey",
           stake_amount AS "stakeAmount",
           payout_amount AS "payoutAmount",
           status,
           metadata,
           created_at AS "createdAt",
           settled_at AS "settledAt"
    FROM ${predictionPositions}
    WHERE ${predictionPositions.id} = ${params.positionId}
      AND ${predictionPositions.marketId} = ${params.marketId}
      AND ${predictionPositions.userId} = ${params.userId}
    FOR UPDATE
  `);

  return readSqlRows<StoredPosition>(result)[0] ?? null;
};

const getPredictionMarketOracleBinding = async (
  executor: DbExecutor,
  marketId: number,
) => {
  const [oracle] = await executor
    .select()
    .from(predictionMarketOracles)
    .where(eq(predictionMarketOracles.marketId, marketId))
    .limit(1);

  return oracle ?? null;
};

const hasOpenPredictionMarketAppeal = async (
  executor: DbExecutor,
  marketId: number,
) => {
  const [appeal] = await executor
    .select({ id: predictionMarketAppeals.id })
    .from(predictionMarketAppeals)
    .where(
      and(
        eq(predictionMarketAppeals.marketId, marketId),
        inArray(predictionMarketAppeals.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);

  return Boolean(appeal);
};

const listPredictionMarketAppealQueueRows = async (
  executor: DbExecutor,
  statuses: PredictionMarketAppealStatus[],
) => {
  if (statuses.length === 0) {
    return [];
  }

  return executor
    .select({
      appeal: predictionMarketAppeals,
      market: predictionMarkets,
      oracleBinding: predictionMarketOracles,
    })
    .from(predictionMarketAppeals)
    .innerJoin(
      predictionMarkets,
      eq(predictionMarkets.id, predictionMarketAppeals.marketId),
    )
    .leftJoin(
      predictionMarketOracles,
      eq(predictionMarketOracles.id, predictionMarketAppeals.oracleBindingId),
    )
    .where(inArray(predictionMarketAppeals.status, statuses))
    .orderBy(
      sql`case
        when ${predictionMarketAppeals.status} = 'open' then 0
        when ${predictionMarketAppeals.status} = 'acknowledged' then 1
        else 2
      end`,
      desc(predictionMarketAppeals.lastDetectedAt),
      desc(predictionMarketAppeals.id),
    );
};

const getPredictionMarketAppealQueueItemById = async (
  executor: DbExecutor,
  appealId: number,
) => {
  const [row] = await executor
    .select({
      appeal: predictionMarketAppeals,
      market: predictionMarkets,
      oracleBinding: predictionMarketOracles,
    })
    .from(predictionMarketAppeals)
    .innerJoin(
      predictionMarkets,
      eq(predictionMarkets.id, predictionMarketAppeals.marketId),
    )
    .leftJoin(
      predictionMarketOracles,
      eq(predictionMarketOracles.id, predictionMarketAppeals.oracleBindingId),
    )
    .where(eq(predictionMarketAppeals.id, appealId))
    .limit(1);

  return row
    ? serializePredictionMarketAppealQueueItem({
        appeal: row.appeal,
        market: row.market,
        oracleBinding: row.oracleBinding ?? null,
      })
    : null;
};

const queuePredictionMarketAppeal = async (
  executor: DbExecutor,
  params: {
    marketId: number;
    oracleBindingId: number | null;
    provider: StoredOracle["provider"] | null;
    reason: PredictionMarketAppealReason;
    title: string;
    description: string;
    metadata: Record<string, unknown>;
  },
) => {
  const now = new Date();
  const appealKey = [
    params.marketId,
    params.oracleBindingId ?? "none",
    params.reason,
  ].join(":");

  await executor
    .insert(predictionMarketAppeals)
    .values({
      marketId: params.marketId,
      oracleBindingId: params.oracleBindingId,
      appealKey,
      provider: params.provider,
      reason: params.reason,
      status: "open",
      title: params.title,
      description: params.description,
      metadata: params.metadata,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolvedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: predictionMarketAppeals.appealKey,
      set: {
        provider: params.provider,
        status: "open",
        title: params.title,
        description: params.description,
        metadata: params.metadata,
        lastDetectedAt: now,
        resolvedAt: null,
        resolvedByAdminId: null,
        updatedAt: now,
      },
    });
};

export async function listPredictionMarketAppealQueue(
  statuses: PredictionMarketAppealStatus[] = ["open", "acknowledged"],
): Promise<PredictionMarketAppealQueueItem[]> {
  const rows = await listPredictionMarketAppealQueueRows(db, statuses);
  return parseMarketAppealQueueItemList(
    rows.map((row) =>
      serializePredictionMarketAppealQueueItem({
        appeal: row.appeal,
        market: row.market,
        oracleBinding: row.oracleBinding ?? null,
      }),
    ),
  );
}

export async function acknowledgePredictionMarketAppeal(
  appealId: number,
  input: PredictionMarketAppealAcknowledgeRequest,
  adminId: number | null = null,
): Promise<PredictionMarketAppealQueueItem> {
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .select()
      .from(predictionMarketAppeals)
      .where(eq(predictionMarketAppeals.id, appealId))
      .limit(1);

    if (!appeal) {
      throw notFoundError("Prediction market appeal not found.");
    }
    if (appeal.status === "resolved") {
      throw conflictError("Prediction market appeal is already resolved.");
    }

    const now = new Date();
    const nextMetadata = {
      ...(toRecord(appeal.metadata) ?? {}),
      acknowledgedAt: now.toISOString(),
      acknowledgedByAdminId: adminId,
      ...(input.note ? { acknowledgeNote: input.note } : {}),
    };

    await tx
      .update(predictionMarketAppeals)
      .set({
        status: "acknowledged",
        metadata: nextMetadata,
        updatedAt: now,
      })
      .where(eq(predictionMarketAppeals.id, appealId));

    const updated = await getPredictionMarketAppealQueueItemById(tx, appealId);
    if (!updated) {
      throw persistenceError("Failed to reload prediction market appeal.");
    }

    return updated;
  });
}

const resolvePredictionMarketAppealsForMarket = async (
  executor: DbExecutor,
  marketId: number,
) => {
  const now = new Date();
  await executor
    .update(predictionMarketAppeals)
    .set({
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(predictionMarketAppeals.marketId, marketId),
        inArray(predictionMarketAppeals.status, ["open", "acknowledged"]),
      ),
    );
};

export async function listPredictionMarkets(
  userId: number | null = null,
): Promise<PredictionMarketSummary[]> {
  const markets = await db
    .select()
    .from(predictionMarkets)
    .orderBy(desc(predictionMarkets.createdAt));
  const details = await serializeMarketDetails(db, markets, userId);
  return details.map((detail) => {
    const { userPositions, ...market } = detail;
    void userPositions;
    return market;
  });
}

export async function getPredictionMarket(
  marketId: number,
  userId: number | null = null,
): Promise<PredictionMarketDetail | null> {
  return getSerializedMarketById(db, marketId, userId);
}

export async function getPredictionMarketPortfolio(
  userId: number,
  status: PredictionMarketPortfolioFilter = "all",
): Promise<PredictionMarketPortfolioResponse> {
  const items = await listUserPredictionMarketPortfolioItems(userId);
  const filteredItems = filterPortfolioItemsByStatus(items, status);

  return {
    items: filteredItems,
    summary: buildPortfolioSummary(filteredItems),
    status,
  };
}

export async function getPredictionMarketHistory(
  userId: number,
  params: {
    status?: PredictionMarketPortfolioFilter;
    page: number;
    limit: number;
  },
): Promise<PredictionMarketHistoryResponse> {
  const status = params.status ?? "all";
  const items = await listUserPredictionMarketPortfolioItems(userId);
  const filteredItems = filterPortfolioItemsByStatus(items, status);
  const page = buildOffsetPage(filteredItems, params.page, params.limit);

  return {
    ...page,
    summary: buildPortfolioSummary(filteredItems),
    status,
  };
}

export async function createPredictionMarket(
  input: CreatePredictionMarketRequest,
): Promise<PredictionMarketDetail> {
  const [existing] = await db
    .select({ id: predictionMarkets.id })
    .from(predictionMarkets)
    .where(eq(predictionMarkets.slug, input.slug))
    .limit(1);

  if (existing) {
    throw conflictError("Prediction market slug already exists.");
  }

  const now = new Date();
  const opensAt = input.opensAt ? new Date(input.opensAt) : now;
  const locksAt = new Date(input.locksAt);
  const resolvesAt = input.resolvesAt ? new Date(input.resolvesAt) : null;
  const initialStatus = opensAt.getTime() > now.getTime() ? "draft" : "open";
  const oracleBinding = resolveCreateOracleBinding(input.oracleBinding);
  assertOracleBindingMatchesOutcomes(oracleBinding, input.outcomes);

  return db.transaction(async (tx) => {
    const [market] = await tx
      .insert(predictionMarkets)
      .values({
        slug: input.slug,
        roundKey: input.roundKey,
        title: input.title,
        description: input.description ?? null,
        resolutionRules: input.resolutionRules,
        sourceOfTruth: input.sourceOfTruth,
        category: input.category,
        tags: input.tags,
        invalidPolicy: input.invalidPolicy,
        mechanism: "pari_mutuel",
        vigBps: input.vigBps,
        status: initialStatus,
        outcomes: input.outcomes,
        totalPoolAmount: "0.00",
        winningOutcomeKey: null,
        winningPoolAmount: null,
        metadata: null,
        opensAt,
        locksAt,
        resolvesAt,
      })
      .returning();

    if (!market) {
      throw persistenceError("Failed to create prediction market.");
    }

    await tx.insert(predictionMarketOracles).values({
      marketId: market.id,
      provider: oracleBinding.provider,
      name: oracleBinding.name ?? null,
      status:
        oracleBinding.provider === "manual_admin" ? "manual_only" : "active",
      config: oracleBinding.config ?? {},
      metadata: oracleBinding.metadata ?? null,
    });

    const detail = await getSerializedMarketById(tx, market.id, null);
    if (!detail) {
      throw persistenceError("Failed to load prediction market.");
    }

    return detail;
  });
}

export async function placePredictionPosition(
  userId: number,
  marketId: number,
  input: {
    outcomeKey: string;
    stakeAmount: string;
  },
): Promise<PredictionMarketPositionMutationResponse> {
  return db.transaction(async (tx) => {
    const market = await lockPredictionMarket(tx, marketId);
    if (!market) {
      throw notFoundError("Prediction market not found.");
    }

    const effectiveStatus = getEffectivePredictionMarketStatus(market);
    if (effectiveStatus !== "open") {
      throw conflictError("Prediction market is not accepting positions.");
    }

    const outcomes = parseMarketOutcomes(market.outcomes);
    const matchingOutcome = outcomes.find(
      (outcome) => outcome.key === input.outcomeKey,
    );
    if (!matchingOutcome) {
      throw badRequestError("Prediction market outcome is invalid.");
    }

    const stakeAmount = resolveStakeAmount(input.stakeAmount);
    await assertKycStakeAllowed(userId, toMoneyString(stakeAmount), tx);
    await lockAsset(
      {
        userId,
        assetCode: PREDICTION_MARKET_ASSET_CODE,
        amount: toMoneyString(stakeAmount),
        entryType: STAKE_ENTRY_TYPE,
        referenceType: MARKET_REFERENCE_TYPE,
        referenceId: marketId,
        audit: buildPredictionMarketAssetAudit({
          roundKey: market.roundKey,
          marketTitle: market.title,
          outcomeKey: matchingOutcome.key,
          outcomeLabel: matchingOutcome.label,
        }),
      },
      tx,
    );

    const [position] = await tx
      .insert(predictionPositions)
      .values({
        marketId,
        userId,
        outcomeKey: matchingOutcome.key,
        stakeAmount: toMoneyString(stakeAmount),
        payoutAmount: "0.00",
        status: "open",
        metadata: {
          roundKey: market.roundKey,
          title: market.title,
          outcomeLabel: matchingOutcome.label,
        },
      })
      .returning();

    if (!position) {
      throw persistenceError("Failed to create prediction market position.");
    }

    await tx
      .update(predictionMarkets)
      .set({
        totalPoolAmount: toMoneyString(
          toDecimal(market.totalPoolAmount ?? 0).plus(stakeAmount),
        ),
        updatedAt: new Date(),
      })
      .where(eq(predictionMarkets.id, marketId));

    const serializedMarket = await getSerializedMarketById(
      tx,
      marketId,
      userId,
    );
    if (!serializedMarket) {
      throw persistenceError("Failed to reload prediction market.");
    }

    return {
      market: serializedMarket,
      position: serializeStoredPosition(position),
    };
  });
}

export async function sellPredictionPosition(
  userId: number,
  marketId: number,
  positionId: number,
): Promise<PredictionMarketPositionMutationResponse> {
  return db.transaction(async (tx) => {
    const market = await lockPredictionMarket(tx, marketId);
    if (!market) {
      throw notFoundError("Prediction market not found.");
    }

    const effectiveStatus = getEffectivePredictionMarketStatus(market);
    if (effectiveStatus !== "open") {
      throw conflictError("Prediction market is not allowing exits.");
    }

    const position = await lockPredictionPosition(tx, {
      marketId,
      positionId,
      userId,
    });
    if (!position) {
      throw notFoundError("Prediction market position not found.");
    }

    if (position.status !== "open") {
      throw conflictError("Prediction market position is not open.");
    }

    const stakeAmount = toDecimal(position.stakeAmount ?? 0);
    const totalPoolAfter = toDecimal(market.totalPoolAmount ?? 0).minus(
      stakeAmount,
    );
    if (totalPoolAfter.lt(0)) {
      throw internalInvariantError(
        "Prediction market pool cannot become negative.",
      );
    }

    await unlockAsset(
      {
        userId,
        assetCode: PREDICTION_MARKET_ASSET_CODE,
        amount: toMoneyString(stakeAmount),
        entryType: SELL_ENTRY_TYPE,
        referenceType: MARKET_REFERENCE_TYPE,
        referenceId: marketId,
        audit: buildPredictionMarketAssetAudit({
          positionId,
          roundKey: market.roundKey,
          marketTitle: market.title,
          outcomeKey: position.outcomeKey,
          settlementMode: "user_sell",
        }),
      },
      tx,
    );

    const settledAt = new Date();
    await tx
      .update(predictionPositions)
      .set({
        payoutAmount: toMoneyString(stakeAmount),
        status: "sold",
        settledAt,
        metadata: {
          ...toRecord(position.metadata),
          settlementMode: "user_sell",
          soldAt: settledAt.toISOString(),
        },
      })
      .where(eq(predictionPositions.id, positionId));

    await tx
      .update(predictionMarkets)
      .set({
        totalPoolAmount: toMoneyString(totalPoolAfter),
        updatedAt: settledAt,
      })
      .where(eq(predictionMarkets.id, marketId));

    const serializedMarket = await getSerializedMarketById(
      tx,
      marketId,
      userId,
    );
    if (!serializedMarket) {
      throw persistenceError("Failed to reload prediction market.");
    }

    const serializedPosition = serializedMarket.userPositions.find(
      (candidate) => candidate.id === positionId,
    );
    if (!serializedPosition) {
      throw persistenceError("Failed to reload prediction market position.");
    }

    return {
      market: serializedMarket,
      position: serializedPosition,
    };
  });
}

type SettlePredictionMarketOptions = {
  source?: "admin" | "oracle_worker";
};

export async function settlePredictionMarket(
  marketId: number,
  input: SettlePredictionMarketRequest,
  options: SettlePredictionMarketOptions = {},
): Promise<PredictionMarketDetail> {
  const outcome = await db.transaction(async (tx) => {
    const market = await lockPredictionMarket(tx, marketId);
    if (!market) {
      throw notFoundError("Prediction market not found.");
    }
    const oracleBinding = await getPredictionMarketOracleBinding(tx, marketId);

    const effectiveStatus = getEffectivePredictionMarketStatus(market);
    if (effectiveStatus === "resolved" || effectiveStatus === "cancelled") {
      throw conflictError("Prediction market is already finalized.");
    }
    if (effectiveStatus === "draft" || effectiveStatus === "open") {
      throw conflictError("Prediction market is still open.");
    }

    const outcomes = parseMarketOutcomes(market.outcomes);
    const matchingOutcome = outcomes.find(
      (outcome) => outcome.key === input.winningOutcomeKey,
    );
    if (!matchingOutcome) {
      throw badRequestError("Prediction market outcome is invalid.");
    }

    const settlementSource = options.source ?? "admin";
    if (
      settlementSource === "admin" &&
      oracleBinding &&
      oracleBinding.provider !== "manual_admin" &&
      !(await hasOpenPredictionMarketAppeal(tx, marketId))
    ) {
      throw conflictError(
        "This market must settle from its configured oracle unless an appeal is open.",
      );
    }

    const positions = await tx
      .select()
      .from(predictionPositions)
      .where(eq(predictionPositions.marketId, marketId))
      .orderBy(predictionPositions.id);

    const openPositions = positions.filter(
      (position) => position.status === "open",
    );
    const settlement = resolvePariMutuelSettlement({
      positions: openPositions.map((position) => ({
        id: position.id,
        userId: position.userId,
        outcomeKey: position.outcomeKey,
        stakeAmount: toMoneyString(position.stakeAmount ?? 0),
      })),
      winningOutcomeKey: input.winningOutcomeKey,
      vigBps: market.vigBps,
    });

    const resultByPositionId = new Map(
      settlement.positionResults.map((result) => [result.id, result]),
    );
    const userAggregates = new Map<
      number,
      {
        lockedRelease: Decimal;
        credit: Decimal;
        entryType: typeof PAYOUT_ENTRY_TYPE | typeof REFUND_ENTRY_TYPE | null;
        positionIds: number[];
      }
    >();

    for (const position of openPositions) {
      const result = resultByPositionId.get(position.id);
      if (!result) {
        throw internalInvariantError(
          "Prediction market position settlement missing.",
        );
      }

      const aggregate = userAggregates.get(position.userId) ?? {
        lockedRelease: toDecimal(0),
        credit: toDecimal(0),
        entryType: null,
        positionIds: [],
      };

      aggregate.lockedRelease = aggregate.lockedRelease.plus(
        position.stakeAmount ?? 0,
      );
      aggregate.credit = aggregate.credit.plus(result.payoutAmount);
      aggregate.positionIds.push(position.id);
      if (result.status === "refunded") {
        aggregate.entryType = REFUND_ENTRY_TYPE;
      } else if (
        result.status === "won" &&
        aggregate.entryType !== REFUND_ENTRY_TYPE
      ) {
        aggregate.entryType = PAYOUT_ENTRY_TYPE;
      }

      userAggregates.set(position.userId, aggregate);
    }

    const orderedUserIds = [...userAggregates.keys()].sort(
      (left, right) => left - right,
    );
    for (const userId of orderedUserIds) {
      const aggregate = userAggregates.get(userId);
      if (!aggregate) {
        throw internalInvariantError(
          "Prediction market user aggregate missing.",
        );
      }

      await settleLockedAsset(
        {
          userId,
          assetCode: PREDICTION_MARKET_ASSET_CODE,
          lockedAmount: toMoneyString(aggregate.lockedRelease),
          payoutAmount: toMoneyString(aggregate.credit),
          entryType: aggregate.entryType ?? PAYOUT_ENTRY_TYPE,
          referenceType: MARKET_REFERENCE_TYPE,
          referenceId: marketId,
          audit: buildPredictionMarketAssetAudit({
            positionIds: aggregate.positionIds,
            roundKey: market.roundKey,
            marketTitle: market.title,
            winningOutcomeKey: input.winningOutcomeKey,
            winningOutcomeLabel: matchingOutcome.label,
            vigBps: market.vigBps,
            feeAmount: settlement.feeAmount,
            payoutPoolAmount: settlement.payoutPoolAmount,
            settlementMode: settlement.mode,
          }),
        },
        tx,
      );
    }

    if (settlement.mode === "payout" && toDecimal(settlement.feeAmount).gt(0)) {
      await applyHouseBankrollDelta(tx, settlement.feeAmount, {
        entryType: VIG_ENTRY_TYPE,
        referenceType: MARKET_REFERENCE_TYPE,
        referenceId: marketId,
        metadata: {
          roundKey: market.roundKey,
          winningOutcomeKey: input.winningOutcomeKey,
          winningOutcomeLabel: matchingOutcome.label,
          vigBps: market.vigBps,
          totalPoolAmount: settlement.totalPoolAmount,
          payoutPoolAmount: settlement.payoutPoolAmount,
          winningPoolAmount: settlement.winningPoolAmount,
        },
      });
    }

    const settledAt = new Date();
    for (const position of openPositions) {
      const result = resultByPositionId.get(position.id);
      if (!result) {
        throw internalInvariantError(
          "Prediction market position result missing.",
        );
      }

      await tx
        .update(predictionPositions)
        .set({
          payoutAmount: result.payoutAmount,
          status: result.status,
          settledAt,
          metadata: {
            ...toRecord(position.metadata),
            settlementMode: settlement.mode,
            vigBps: market.vigBps,
            feeAmount: settlement.feeAmount,
            payoutPoolAmount: settlement.payoutPoolAmount,
          },
        })
        .where(eq(predictionPositions.id, position.id));
    }

    await tx
      .update(predictionMarkets)
      .set({
        status: "resolved",
        winningOutcomeKey: input.winningOutcomeKey,
        winningPoolAmount: settlement.winningPoolAmount,
        oracleSource: input.oracle.source,
        oracleExternalRef: input.oracle.externalRef ?? null,
        oracleReportedAt: input.oracle.reportedAt
          ? new Date(input.oracle.reportedAt)
          : settledAt,
        resolvedAt: settledAt,
        updatedAt: settledAt,
        metadata: {
          ...toRecord(market.metadata),
          oracle: input.oracle,
          settlementMode: settlement.mode,
          vigBps: market.vigBps,
          feeAmount: settlement.feeAmount,
          payoutPoolAmount: settlement.payoutPoolAmount,
          totalPoolAmount: settlement.totalPoolAmount,
        },
      })
      .where(eq(predictionMarkets.id, marketId));

    if (oracleBinding) {
      await tx
        .update(predictionMarketOracles)
        .set({
          status: "resolved",
          lastCheckedAt: settledAt,
          lastReportedAt: input.oracle.reportedAt
            ? new Date(input.oracle.reportedAt)
            : settledAt,
          lastResolvedOutcomeKey: input.winningOutcomeKey,
          lastPayloadHash: input.oracle.payloadHash ?? null,
          lastPayload: input.oracle.payload ?? null,
          lastError: null,
          updatedAt: settledAt,
        })
        .where(eq(predictionMarketOracles.id, oracleBinding.id));
    }
    await resolvePredictionMarketAppealsForMarket(tx, marketId);

    const detail = await getSerializedMarketById(tx, marketId, null);
    if (!detail) {
      throw persistenceError("Failed to reload settled prediction market.");
    }

    return {
      detail,
      notifications: orderedUserIds.map((userId) => {
        const aggregate = userAggregates.get(userId);
        if (!aggregate) {
          throw internalInvariantError(
            "Prediction market notification aggregate missing.",
          );
        }

        return {
          userId,
          marketId,
          marketTitle: market.title,
          winningOutcomeLabel: matchingOutcome.label,
          positionCount: aggregate.positionIds.length,
          payoutAmount: toMoneyString(aggregate.credit),
        };
      }),
    };
  });

  for (const notification of outcome.notifications) {
    try {
      await sendPredictionMarketSettledNotification(notification);
    } catch (error) {
      logger.warning("failed to dispatch prediction market notification", {
        err: error,
        marketId,
        userId: notification.userId,
      });
    }
  }

  return outcome.detail;
}

export async function cancelPredictionMarket(
  marketId: number,
  input: CancelPredictionMarketRequest,
): Promise<PredictionMarketDetail> {
  return db.transaction(async (tx) => {
    const market = await lockPredictionMarket(tx, marketId);
    if (!market) {
      throw notFoundError("Prediction market not found.");
    }
    const oracleBinding = await getPredictionMarketOracleBinding(tx, marketId);

    const effectiveStatus = getEffectivePredictionMarketStatus(market);
    if (effectiveStatus === "resolved" || effectiveStatus === "cancelled") {
      throw conflictError("Prediction market is already finalized.");
    }

    const positions = await tx
      .select()
      .from(predictionPositions)
      .where(eq(predictionPositions.marketId, marketId))
      .orderBy(predictionPositions.id);

    const openPositions = positions.filter(
      (position) => position.status === "open",
    );
    const refundedTotalAmount = openPositions.reduce(
      (sum, position) => sum.plus(position.stakeAmount ?? 0),
      toDecimal(0),
    );
    const userAggregates = new Map<
      number,
      {
        lockedRelease: Decimal;
        credit: Decimal;
        positionIds: number[];
      }
    >();

    for (const position of openPositions) {
      const aggregate = userAggregates.get(position.userId) ?? {
        lockedRelease: toDecimal(0),
        credit: toDecimal(0),
        positionIds: [],
      };

      aggregate.lockedRelease = aggregate.lockedRelease.plus(
        position.stakeAmount ?? 0,
      );
      aggregate.credit = aggregate.credit.plus(position.stakeAmount ?? 0);
      aggregate.positionIds.push(position.id);

      userAggregates.set(position.userId, aggregate);
    }

    const orderedUserIds = [...userAggregates.keys()].sort(
      (left, right) => left - right,
    );
    for (const userId of orderedUserIds) {
      const aggregate = userAggregates.get(userId);
      if (!aggregate) {
        throw internalInvariantError(
          "Prediction market user aggregate missing.",
        );
      }

      await unlockAsset(
        {
          userId,
          assetCode: PREDICTION_MARKET_ASSET_CODE,
          amount: toMoneyString(aggregate.credit),
          entryType: REFUND_ENTRY_TYPE,
          referenceType: MARKET_REFERENCE_TYPE,
          referenceId: marketId,
          audit: buildPredictionMarketAssetAudit({
            positionIds: aggregate.positionIds,
            roundKey: market.roundKey,
            marketTitle: market.title,
            marketStatusBefore: effectiveStatus,
            cancelReason: input.reason,
            cancelOracle: input.oracle ?? null,
            cancellationMetadata: input.metadata ?? null,
            settlementMode: "cancel_refund",
          }),
        },
        tx,
      );
    }

    const settledAt = new Date();
    for (const position of openPositions) {
      await tx
        .update(predictionPositions)
        .set({
          payoutAmount: toMoneyString(position.stakeAmount ?? 0),
          status: "refunded",
          settledAt,
          metadata: {
            ...toRecord(position.metadata),
            settlementMode: "cancel_refund",
            marketStatusBefore: effectiveStatus,
            cancelReason: input.reason,
          },
        })
        .where(eq(predictionPositions.id, position.id));
    }

    await tx
      .update(predictionMarkets)
      .set({
        status: "cancelled",
        winningOutcomeKey: null,
        winningPoolAmount: null,
        oracleSource: input.oracle?.source ?? null,
        oracleExternalRef: input.oracle?.externalRef ?? null,
        oracleReportedAt: input.oracle?.reportedAt
          ? new Date(input.oracle.reportedAt)
          : input.oracle
            ? settledAt
            : null,
        resolvedAt: settledAt,
        updatedAt: settledAt,
        metadata: {
          ...toRecord(market.metadata),
          oracle: input.oracle ?? null,
          cancellation: {
            previousStatus: effectiveStatus,
            reason: input.reason,
            oracle: input.oracle ?? null,
            metadata: input.metadata ?? null,
            refundedPositionCount: openPositions.length,
            refundedTotalAmount: toMoneyString(refundedTotalAmount),
            cancelledAt: settledAt.toISOString(),
          },
          settlementMode: "cancel_refund",
          totalPoolAmount: toMoneyString(market.totalPoolAmount ?? 0),
        },
      })
      .where(eq(predictionMarkets.id, marketId));

    if (oracleBinding) {
      await tx
        .update(predictionMarketOracles)
        .set({
          status: "cancelled",
          lastCheckedAt: settledAt,
          lastReportedAt: input.oracle?.reportedAt
            ? new Date(input.oracle.reportedAt)
            : input.oracle
              ? settledAt
              : null,
          lastPayloadHash: input.oracle?.payloadHash ?? null,
          lastPayload: input.oracle?.payload ?? null,
          lastError: null,
          updatedAt: settledAt,
        })
        .where(eq(predictionMarketOracles.id, oracleBinding.id));
    }
    await resolvePredictionMarketAppealsForMarket(tx, marketId);

    const detail = await getSerializedMarketById(tx, marketId, null);
    if (!detail) {
      throw persistenceError("Failed to reload cancelled prediction market.");
    }

    return detail;
  });
}

export type PredictionMarketOracleSettlementCycleSummary = {
  scanned: number;
  pending: number;
  resolved: number;
  appealed: number;
  failed: number;
};

const applyOracleEvaluationStatus = async (
  oracleBindingId: number,
  evaluation: PredictionMarketOracleEvaluationResult,
) => {
  await db
    .update(predictionMarketOracles)
    .set({
      status: evaluation.bindingStatus,
      lastCheckedAt: new Date(),
      lastReportedAt: evaluation.reportedAt,
      lastPayloadHash: evaluation.payloadHash,
      lastPayload: evaluation.payload,
      lastError: evaluation.status === "appeal" ? evaluation.description : null,
      updatedAt: new Date(),
    })
    .where(eq(predictionMarketOracles.id, oracleBindingId));
};

export async function runPredictionMarketOracleSettlementCycle(
  params: {
    now?: Date;
    limit?: number;
  } = {},
): Promise<PredictionMarketOracleSettlementCycleSummary> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = params.limit ?? config.predictionMarketOracleBatchSize;

  const rows = await db
    .select({
      market: predictionMarkets,
      oracle: predictionMarketOracles,
    })
    .from(predictionMarkets)
    .innerJoin(
      predictionMarketOracles,
      eq(predictionMarketOracles.marketId, predictionMarkets.id),
    )
    .where(
      and(
        inArray(predictionMarkets.status, ["draft", "open", "locked"]),
        inArray(predictionMarketOracles.status, [
          "active",
          "pending",
          "appealed",
        ]),
        sql`coalesce(${predictionMarkets.resolvesAt}, ${predictionMarkets.locksAt}) <= ${nowIso}::timestamptz`,
      ),
    )
    .orderBy(predictionMarkets.resolvesAt, predictionMarkets.id)
    .limit(limit);

  const summary: PredictionMarketOracleSettlementCycleSummary = {
    scanned: rows.length,
    pending: 0,
    resolved: 0,
    appealed: 0,
    failed: 0,
  };

  for (const row of rows) {
    const market = row.market;
    const oracleBinding = row.oracle;

    try {
      const evaluation = await evaluatePredictionMarketOracle({
        market: {
          id: market.id,
          slug: market.slug,
          title: market.title,
          locksAt: market.locksAt,
          resolvesAt: market.resolvesAt,
        },
        binding: {
          id: oracleBinding.id,
          provider: oracleBinding.provider,
          name: oracleBinding.name ?? null,
          config: oracleBinding.config,
          metadata: oracleBinding.metadata,
        },
        timeoutMs: config.predictionMarketOracleRequestTimeoutMs,
      });

      if (evaluation.status === "resolved") {
        await settlePredictionMarket(
          market.id,
          {
            winningOutcomeKey: evaluation.winningOutcomeKey,
            oracle: evaluation.oracle,
          },
          { source: "oracle_worker" },
        );
        summary.resolved += 1;
        continue;
      }

      if (evaluation.status === "pending") {
        await applyOracleEvaluationStatus(oracleBinding.id, evaluation);
        summary.pending += 1;
        continue;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(predictionMarketOracles)
          .set({
            status: evaluation.bindingStatus,
            lastCheckedAt: now,
            lastReportedAt: evaluation.reportedAt,
            lastPayloadHash: evaluation.payloadHash,
            lastPayload: evaluation.payload,
            lastError: evaluation.description,
            updatedAt: now,
          })
          .where(eq(predictionMarketOracles.id, oracleBinding.id));

        await queuePredictionMarketAppeal(tx, {
          marketId: market.id,
          oracleBindingId: oracleBinding.id,
          provider: oracleBinding.provider,
          reason: evaluation.reason,
          title: evaluation.title,
          description: evaluation.description,
          metadata: evaluation.metadata,
        });
      });
      summary.appealed += 1;
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : "Unknown prediction market oracle failure.";

      await db.transaction(async (tx) => {
        await tx
          .update(predictionMarketOracles)
          .set({
            status: "appealed",
            lastCheckedAt: now,
            lastError: description,
            updatedAt: now,
          })
          .where(eq(predictionMarketOracles.id, oracleBinding.id));

        await queuePredictionMarketAppeal(tx, {
          marketId: market.id,
          oracleBindingId: oracleBinding.id,
          provider: oracleBinding.provider,
          reason: "oracle_fetch_failed",
          title: "Oracle polling failed.",
          description,
          metadata: {
            marketId: market.id,
            marketSlug: market.slug,
            oracleBindingId: oracleBinding.id,
          },
        });
      });
      summary.failed += 1;
    }
  }

  return summary;
}
