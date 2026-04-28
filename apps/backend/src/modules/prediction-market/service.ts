import type Decimal from "decimal.js";
import {
  ledgerEntries,
  predictionMarkets,
  predictionPositions,
  userWallets,
} from "@reward/database";
import { desc, eq, inArray, sql } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  type CancelPredictionMarketRequest,
  PredictionMarketDetailSchema,
  PredictionMarketOutcomeSchema,
  PredictionMarketOracleSchema,
  PredictionMarketPortfolioItemSchema,
  PredictionMarketPortfolioStatusSchema,
  PredictionMarketTagsSchema,
  PredictionPositionStatusSchema,
  PredictionMarketStatusSchema,
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
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { parseSchema } from "../../shared/validation";
import { assertKycStakeAllowed } from "../kyc/service";
import { resolvePariMutuelSettlement } from "./settlement";

type DbExecutor = DbClient | DbTransaction;

type StoredMarket = typeof predictionMarkets.$inferSelect;
type StoredPosition = typeof predictionPositions.$inferSelect;

type LockedWalletRow = {
  userId: number;
  withdrawableBalance: string | number | null;
  lockedBalance: string | number | null;
  wageredAmount: string | number | null;
};

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
const PAYOUT_ENTRY_TYPE = "prediction_market_payout";
const REFUND_ENTRY_TYPE = "prediction_market_refund";

const OutcomeArraySchema = PredictionMarketOutcomeSchema.array().min(2);
const TagsArraySchema = PredictionMarketTagsSchema;
const MarketDetailListSchema = PredictionMarketDetailSchema.array();
const MarketPortfolioItemListSchema =
  PredictionMarketPortfolioItemSchema.array();

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
  status: getEffectivePredictionMarketStatus(market),
  outcomes: parseMarketOutcomes(market.outcomes),
  totalPoolAmount: toMoneyString(market.totalPoolAmount ?? 0),
  winningOutcomeKey: market.winningOutcomeKey ?? null,
  winningPoolAmount:
    market.winningPoolAmount === null || market.winningPoolAmount === undefined
      ? null
      : toMoneyString(market.winningPoolAmount),
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

  if (positions.every((position) => position.status === "refunded")) {
    return PredictionMarketPortfolioStatusSchema.parse("refunded");
  }

  return PredictionMarketPortfolioStatusSchema.parse("resolved");
};

const buildPortfolioItem = (params: {
  market: StoredMarket;
  positions: StoredPosition[];
}): PredictionMarketPortfolioItem => {
  const { market, positions } = params;
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

    if (position.status === "refunded") {
      refundedAmount = refundedAmount.plus(position.payoutAmount ?? 0);
      continue;
    }

    settledPayoutAmount = settledPayoutAmount.plus(position.payoutAmount ?? 0);
  }

  return {
    portfolioStatus,
    market: serializePortfolioMarket(market),
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

    return [buildPortfolioItem({ market, positions })];
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

const ensureWalletRow = async (tx: DbTransaction, userId: number) => {
  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();
};

const lockWallet = async (
  tx: DbTransaction,
  userId: number,
): Promise<LockedWalletRow | null> => {
  await ensureWalletRow(tx, userId);

  const result = await tx.execute(sql`
    SELECT user_id AS "userId",
           withdrawable_balance AS "withdrawableBalance",
           locked_balance AS "lockedBalance",
           wagered_amount AS "wageredAmount"
    FROM ${userWallets}
    WHERE ${userWallets.userId} = ${userId}
    FOR UPDATE
  `);

  return readSqlRows<LockedWalletRow>(result)[0] ?? null;
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

  const [market] = await db
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

  const detail = await getSerializedMarketById(db, market.id, null);
  if (!detail) {
    throw persistenceError("Failed to load prediction market.");
  }

  return detail;
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
    const wallet = await lockWallet(tx, userId);
    if (!wallet) {
      throw notFoundError("User wallet not found.");
    }

    const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
    const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
    const wageredBefore = toDecimal(wallet.wageredAmount ?? 0);

    if (withdrawableBefore.lt(stakeAmount)) {
      throw conflictError("Insufficient balance.", {
        code: API_ERROR_CODES.INSUFFICIENT_BALANCE,
      });
    }

    const withdrawableAfter = withdrawableBefore.minus(stakeAmount);
    const lockedAfter = lockedBefore.plus(stakeAmount);
    const wageredAfter = wageredBefore.plus(stakeAmount);

    await tx
      .update(userWallets)
      .set({
        withdrawableBalance: toMoneyString(withdrawableAfter),
        lockedBalance: toMoneyString(lockedAfter),
        wageredAmount: toMoneyString(wageredAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWallets.userId, userId));

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

    await tx.insert(ledgerEntries).values({
      userId,
      entryType: STAKE_ENTRY_TYPE,
      amount: toMoneyString(stakeAmount.negated()),
      balanceBefore: toMoneyString(withdrawableBefore),
      balanceAfter: toMoneyString(withdrawableAfter),
      referenceType: MARKET_REFERENCE_TYPE,
      referenceId: marketId,
      metadata: {
        positionId: position.id,
        roundKey: market.roundKey,
        outcomeKey: matchingOutcome.key,
        outcomeLabel: matchingOutcome.label,
        lockedBalanceBefore: toMoneyString(lockedBefore),
        lockedBalanceAfter: toMoneyString(lockedAfter),
      },
    });

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

export async function settlePredictionMarket(
  marketId: number,
  input: SettlePredictionMarketRequest,
): Promise<PredictionMarketDetail> {
  return db.transaction(async (tx) => {
    const market = await lockPredictionMarket(tx, marketId);
    if (!market) {
      throw notFoundError("Prediction market not found.");
    }

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
      const wallet = await lockWallet(tx, userId);
      if (!wallet) {
        throw notFoundError("User wallet not found.");
      }

      const aggregate = userAggregates.get(userId);
      if (!aggregate) {
        throw internalInvariantError(
          "Prediction market user aggregate missing.",
        );
      }

      const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
      const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
      if (lockedBefore.lt(aggregate.lockedRelease)) {
        throw conflictError("Locked balance is insufficient.");
      }

      const withdrawableAfter = withdrawableBefore.plus(aggregate.credit);
      const lockedAfter = lockedBefore.minus(aggregate.lockedRelease);

      await tx
        .update(userWallets)
        .set({
          withdrawableBalance: toMoneyString(withdrawableAfter),
          lockedBalance: toMoneyString(lockedAfter),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, userId));

      if (aggregate.credit.gt(0) && aggregate.entryType) {
        await tx.insert(ledgerEntries).values({
          userId,
          entryType: aggregate.entryType,
          amount: toMoneyString(aggregate.credit),
          balanceBefore: toMoneyString(withdrawableBefore),
          balanceAfter: toMoneyString(withdrawableAfter),
          referenceType: MARKET_REFERENCE_TYPE,
          referenceId: marketId,
          metadata: {
            positionIds: aggregate.positionIds,
            roundKey: market.roundKey,
            winningOutcomeKey: input.winningOutcomeKey,
            winningOutcomeLabel: matchingOutcome.label,
            lockedBalanceBefore: toMoneyString(lockedBefore),
            lockedBalanceAfter: toMoneyString(lockedAfter),
          },
        });
      }
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
          totalPoolAmount: settlement.totalPoolAmount,
        },
      })
      .where(eq(predictionMarkets.id, marketId));

    const detail = await getSerializedMarketById(tx, marketId, null);
    if (!detail) {
      throw persistenceError("Failed to reload settled prediction market.");
    }

    return detail;
  });
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
      const wallet = await lockWallet(tx, userId);
      if (!wallet) {
        throw notFoundError("User wallet not found.");
      }

      const aggregate = userAggregates.get(userId);
      if (!aggregate) {
        throw internalInvariantError(
          "Prediction market user aggregate missing.",
        );
      }

      const withdrawableBefore = toDecimal(wallet.withdrawableBalance ?? 0);
      const lockedBefore = toDecimal(wallet.lockedBalance ?? 0);
      if (lockedBefore.lt(aggregate.lockedRelease)) {
        throw conflictError("Locked balance is insufficient.");
      }

      const withdrawableAfter = withdrawableBefore.plus(aggregate.credit);
      const lockedAfter = lockedBefore.minus(aggregate.lockedRelease);

      await tx
        .update(userWallets)
        .set({
          withdrawableBalance: toMoneyString(withdrawableAfter),
          lockedBalance: toMoneyString(lockedAfter),
          updatedAt: new Date(),
        })
        .where(eq(userWallets.userId, userId));

      if (aggregate.credit.gt(0)) {
        await tx.insert(ledgerEntries).values({
          userId,
          entryType: REFUND_ENTRY_TYPE,
          amount: toMoneyString(aggregate.credit),
          balanceBefore: toMoneyString(withdrawableBefore),
          balanceAfter: toMoneyString(withdrawableAfter),
          referenceType: MARKET_REFERENCE_TYPE,
          referenceId: marketId,
          metadata: {
            positionIds: aggregate.positionIds,
            roundKey: market.roundKey,
            marketStatusBefore: effectiveStatus,
            cancelReason: input.reason,
            cancelOracle: input.oracle ?? null,
            cancellationMetadata: input.metadata ?? null,
            lockedBalanceBefore: toMoneyString(lockedBefore),
            lockedBalanceAfter: toMoneyString(lockedAfter),
          },
        });
      }
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

    const detail = await getSerializedMarketById(tx, marketId, null);
    if (!detail) {
      throw persistenceError("Failed to reload cancelled prediction market.");
    }

    return detail;
  });
}
