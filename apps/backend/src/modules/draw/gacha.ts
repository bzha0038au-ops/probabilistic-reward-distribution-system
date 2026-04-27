import { prizes, userWallets, users } from "@reward/database";
import { and, asc, eq, inArray, isNull } from "@reward/database/orm";
import type {
  DrawPityState,
  DrawPlayRequest,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
  DrawResult,
} from "@reward/shared-types/draw";
import Decimal from "decimal.js";

import { db } from "../../db";
import { conflictError } from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { getFairnessCommit } from "../fairness/service";
import {
  getDrawCost,
  getDrawSystemConfig,
  getPoolSystemConfig,
  getProbabilityControlConfig,
} from "../system/service";
import { executeDrawInTransaction } from "./execute-draw";

type PrizeCatalogRow = {
  id: number;
  name: string;
  stock: number;
  weight: number;
  rewardAmount: string | number;
};

type DrawRecordSnapshot = {
  id: number;
  userId: number;
  prizeId: number | null;
  drawCost: string;
  rewardAmount: string;
  status: DrawResult["status"];
  createdAt: Date;
  metadata: unknown;
};

const FEATURED_PRIZE_COUNT = 4;
const MULTI_DRAW_TARGET = 10;
const CLIENT_NONCE_MAX_LENGTH = 128;
const RARITY_PRIORITY: Record<DrawPrizeRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

const normalizeMaxBatchCount = (value: unknown) => {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const rankPrizeRows = (rows: PrizeCatalogRow[]) =>
  [...rows].sort((left, right) => {
    const rewardDiff = toDecimal(right.rewardAmount).cmp(
      toDecimal(left.rewardAmount),
    );
    if (rewardDiff !== 0) {
      return rewardDiff;
    }

    const weightDiff = Number(left.weight ?? 0) - Number(right.weight ?? 0);
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return left.id - right.id;
  });

const resolveDisplayRarity = (
  index: number,
  total: number,
): DrawPrizeRarity => {
  if (index === 0) {
    return "legendary";
  }

  const epicCutoff = Math.max(2, Math.ceil(total * 0.3));
  if (index < epicCutoff) {
    return "epic";
  }

  const rareCutoff = Math.max(epicCutoff + 1, Math.ceil(total * 0.65));
  if (index < rareCutoff) {
    return "rare";
  }

  return "common";
};

const buildPrizePresentations = (
  rows: PrizeCatalogRow[],
): DrawPrizePresentation[] => {
  const ranked = rankPrizeRows(rows);
  const featuredIds = new Set(
    ranked.slice(0, FEATURED_PRIZE_COUNT).map((prize) => prize.id),
  );

  return ranked.map((prize, index) => {
    const stock = Math.max(0, Number(prize.stock ?? 0));

    return {
      id: prize.id,
      name: prize.name,
      rewardAmount: toMoneyString(prize.rewardAmount ?? 0),
      displayRarity: resolveDisplayRarity(index, ranked.length),
      stock,
      stockState: stock <= 0 ? "sold_out" : stock <= 3 ? "low" : "available",
      isFeatured: featuredIds.has(prize.id),
    };
  });
};

const buildPityState = (
  probabilityControl: Awaited<ReturnType<typeof getProbabilityControlConfig>>,
  currentStreak: number,
): DrawPityState => {
  const enabled = Boolean(probabilityControl.pityEnabled);
  const threshold = Math.max(0, Number(probabilityControl.pityThreshold ?? 0));
  const boostPct = Number(probabilityControl.pityBoostPct ?? 0);
  const maxBoostPct = Number(probabilityControl.pityMaxBoostPct ?? 0);
  const active = enabled && threshold > 0 && currentStreak >= threshold;

  return {
    enabled,
    currentStreak: Math.max(0, currentStreak),
    threshold,
    boostPct,
    maxBoostPct,
    active,
    drawsUntilBoost:
      !enabled || threshold <= 0
        ? null
        : active
          ? 0
          : Math.max(threshold - currentStreak, 0),
  };
};

const extractFairnessMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return Reflect.get(metadata, "fairness") ?? null;
};

const buildPrizePresentationMap = (prizesView: DrawPrizePresentation[]) =>
  new Map(prizesView.map((prize) => [prize.id, prize] as const));

const serializeDrawResult = (
  record: DrawRecordSnapshot,
  prizeMap: Map<number, DrawPrizePresentation>,
): DrawResult => ({
  id: record.id,
  userId: record.userId,
  prizeId: record.prizeId,
  drawCost: record.drawCost,
  rewardAmount: record.rewardAmount,
  status: record.status,
  createdAt: record.createdAt,
  fairness: extractFairnessMetadata(record.metadata),
  prize: record.prizeId ? (prizeMap.get(record.prizeId) ?? null) : null,
});

const resolveBatchClientNonce = (
  baseClientNonce: string | null | undefined,
  drawIndex: number,
  count: number,
) => {
  const base = baseClientNonce?.trim();
  if (!base) {
    return null;
  }

  const suffix = `:${drawIndex + 1}/${count}`;
  const maxBaseLength = Math.max(1, CLIENT_NONCE_MAX_LENGTH - suffix.length);
  return `${base.slice(0, maxBaseLength)}${suffix}`;
};

const loadPrizeCatalogRows = () =>
  db
    .select({
      id: prizes.id,
      name: prizes.name,
      stock: prizes.stock,
      weight: prizes.weight,
      rewardAmount: prizes.rewardAmount,
    })
    .from(prizes)
    .where(and(eq(prizes.isActive, true), isNull(prizes.deletedAt)))
    .orderBy(asc(prizes.id));

const loadPrizePresentationsByIds = async (prizeIds: number[]) => {
  if (prizeIds.length === 0) {
    return new Map<number, DrawPrizePresentation>();
  }

  const rows = await db
    .select({
      id: prizes.id,
      name: prizes.name,
      stock: prizes.stock,
      weight: prizes.weight,
      rewardAmount: prizes.rewardAmount,
    })
    .from(prizes)
    .where(inArray(prizes.id, prizeIds));

  return buildPrizePresentationMap(buildPrizePresentations(rows));
};

export async function getDrawCatalog(userId: number) {
  const [
    walletRow,
    userRow,
    drawCost,
    drawSystem,
    probabilityControl,
    poolSystem,
    prizeRows,
  ] = await Promise.all([
    db
      .select({ balance: userWallets.withdrawableBalance })
      .from(userWallets)
      .where(eq(userWallets.userId, userId))
      .limit(1),
    db
      .select({ pityStreak: users.pityStreak })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    getDrawCost(db),
    getDrawSystemConfig(db),
    getProbabilityControlConfig(db),
    getPoolSystemConfig(db),
    loadPrizeCatalogRows(),
  ]);

  const fairness = await getFairnessCommit(
    db,
    Number(poolSystem.epochSeconds ?? 0),
  );
  const prizesView = buildPrizePresentations(prizeRows);
  const maxBatchCount = normalizeMaxBatchCount(drawSystem.maxDrawPerRequest);

  return {
    drawEnabled: drawSystem.drawEnabled,
    balance: walletRow[0]?.balance ?? "0.00",
    drawCost: toMoneyString(drawCost),
    maxBatchCount,
    recommendedBatchCount: Math.min(maxBatchCount, MULTI_DRAW_TARGET),
    pity: buildPityState(
      probabilityControl,
      Number(userRow[0]?.pityStreak ?? 0),
    ),
    fairness,
    prizes: prizesView,
    featuredPrizes: prizesView.filter((prize) => prize.isFeatured),
  };
}

export async function executeDrawPlay(
  userId: number,
  request: DrawPlayRequest,
): Promise<DrawPlayResponse> {
  const requestedCount = Math.floor(Number(request.count ?? 0));
  if (!Number.isFinite(requestedCount) || requestedCount <= 0) {
    throw conflictError("Invalid draw count.");
  }

  const { records, endingBalance, pityState } = await db.transaction(
    async (tx) => {
      const [drawSystem, probabilityControl] = await Promise.all([
        getDrawSystemConfig(tx),
        getProbabilityControlConfig(tx),
      ]);

      const maxBatchCount = normalizeMaxBatchCount(
        drawSystem.maxDrawPerRequest,
      );
      if (requestedCount > maxBatchCount) {
        throw conflictError(
          "Requested batch size exceeds the configured maximum.",
        );
      }

      const results: DrawRecordSnapshot[] = [];

      for (let index = 0; index < requestedCount; index += 1) {
        const record = await executeDrawInTransaction(tx, userId, {
          clientNonce: resolveBatchClientNonce(
            request.clientNonce,
            index,
            requestedCount,
          ),
        });

        results.push({
          id: record.id,
          userId: record.userId,
          prizeId: record.prizeId,
          drawCost: record.drawCost,
          rewardAmount: record.rewardAmount,
          status: record.status,
          createdAt: record.createdAt,
          metadata: record.metadata,
        });
      }

      const [walletRow, userRow] = await Promise.all([
        tx
          .select({ balance: userWallets.withdrawableBalance })
          .from(userWallets)
          .where(eq(userWallets.userId, userId))
          .limit(1),
        tx
          .select({ pityStreak: users.pityStreak })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
      ]);

      return {
        records: results,
        endingBalance: walletRow[0]?.balance ?? "0.00",
        pityState: buildPityState(
          probabilityControl,
          Number(userRow[0]?.pityStreak ?? 0),
        ),
      };
    },
  );

  const prizeIds = [
    ...new Set(
      records.flatMap((record) => (record.prizeId ? [record.prizeId] : [])),
    ),
  ];
  const prizeMap = await loadPrizePresentationsByIds(prizeIds);
  const results = records.map((record) =>
    serializeDrawResult(record, prizeMap),
  );

  const totalCost = records.reduce(
    (sum, record) => sum.plus(record.drawCost),
    new Decimal(0),
  );
  const totalReward = records.reduce(
    (sum, record) => sum.plus(record.rewardAmount),
    new Decimal(0),
  );
  const highestRarity = results.reduce<DrawPrizeRarity | null>(
    (current, record) => {
      const rarity = record.prize?.displayRarity ?? null;
      if (!rarity) {
        return current;
      }
      if (!current || RARITY_PRIORITY[rarity] > RARITY_PRIORITY[current]) {
        return rarity;
      }
      return current;
    },
    null,
  );

  return {
    count: requestedCount,
    totalCost: toMoneyString(totalCost),
    totalReward: toMoneyString(totalReward),
    winCount: results.filter((record) => record.status === "won").length,
    endingBalance,
    highestRarity,
    pity: pityState,
    results,
  };
}

export const serializeDrawRecordForResponse = async (
  record: DrawRecordSnapshot,
) => {
  const prizeMap = await loadPrizePresentationsByIds(
    record.prizeId ? [record.prizeId] : [],
  );
  return serializeDrawResult(record, prizeMap);
};
