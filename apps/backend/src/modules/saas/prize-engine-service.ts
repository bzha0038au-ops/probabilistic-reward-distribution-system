import { randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  saasApiKeys,
  saasBillingAccounts,
  saasDrawRecords,
  saasFairnessSeeds,
  saasLedgerEntries,
  saasPlayers,
  saasProjectPrizes,
  saasProjects,
  saasTenants,
  saasUsageEvents,
} from "@reward/database";
import { and, desc, eq, gt, isNull, sql } from "@reward/database/orm";
import type {
  PrizeEngineApiKeyScope,
  PrizeEngineDrawRequest,
  PrizeEngineDrawResponse,
  PrizeEngineOverview,
} from "@reward/shared-types/saas";

import { db, type DbTransaction } from "../../db";
import {
  conflictError,
  forbiddenError,
  notFoundError,
  unauthorizedError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { readSqlRows } from "../../shared/sql-result";
import { deriveRandomPick, pickByWeight } from "../draw/helpers";
import {
  DEFAULT_FAIRNESS_EPOCH_SECONDS,
  buildPrizePresentations,
  currentEpoch,
  type FairnessSeedRow,
  hashValue,
  type LockedPlayerRow,
  type LockedPrizeRow,
  type LockedProjectRow,
  type ProjectApiAuth,
  resolveEpochSeconds,
} from "./prize-engine-domain";
import {
  normalizeMetadata,
  normalizeScopes,
  toPrizeEngineLedgerEntry,
} from "./records";

const loadLockedProject = async (tx: DbTransaction, projectId: number) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      slug,
      name,
      environment,
      status,
      currency,
      draw_cost AS "drawCost",
      prize_pool_balance AS "prizePoolBalance",
      fairness_epoch_seconds AS "fairnessEpochSeconds",
      max_draw_count AS "maxDrawCount",
      miss_weight AS "missWeight"
    FROM ${saasProjects}
    WHERE ${saasProjects.id} = ${projectId}
    FOR UPDATE
  `);

  return readSqlRows<LockedProjectRow>(result)[0] ?? null;
};

const loadLockedPlayer = async (
  tx: DbTransaction,
  projectId: number,
  externalPlayerId: string,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      project_id AS "projectId",
      external_player_id AS "externalPlayerId",
      display_name AS "displayName",
      balance,
      pity_streak AS "pityStreak",
      metadata
    FROM ${saasPlayers}
    WHERE ${saasPlayers.projectId} = ${projectId}
      AND ${saasPlayers.externalPlayerId} = ${externalPlayerId}
    FOR UPDATE
  `);

  return readSqlRows<LockedPlayerRow>(result)[0] ?? null;
};

const loadLockedPrize = async (
  tx: DbTransaction,
  projectId: number,
  prizeId: number,
) => {
  const result = await tx.execute(sql`
    SELECT
      id,
      project_id AS "projectId",
      name,
      stock,
      weight,
      reward_amount AS "rewardAmount",
      is_active AS "isActive",
      deleted_at AS "deletedAt",
      metadata
    FROM ${saasProjectPrizes}
    WHERE ${saasProjectPrizes.id} = ${prizeId}
      AND ${saasProjectPrizes.projectId} = ${projectId}
    FOR UPDATE
  `);

  return readSqlRows<LockedPrizeRow>(result)[0] ?? null;
};

const ensureProjectPlayer = async (
  tx: DbTransaction,
  projectId: number,
  payload: PrizeEngineDrawRequest["player"],
) => {
  let player = await loadLockedPlayer(tx, projectId, payload.playerId);
  const nextMetadata = normalizeMetadata(payload.metadata);

  if (!player) {
    await tx.insert(saasPlayers).values({
      projectId,
      externalPlayerId: payload.playerId,
      displayName: payload.displayName ?? null,
      balance: "0",
      pityStreak: 0,
      metadata: nextMetadata,
    });
    player = await loadLockedPlayer(tx, projectId, payload.playerId);
  } else if (
    payload.displayName !== undefined ||
    payload.metadata !== undefined
  ) {
    const [updated] = await tx
      .update(saasPlayers)
      .set({
        ...(payload.displayName !== undefined
          ? { displayName: payload.displayName ?? null }
          : {}),
        ...(payload.metadata !== undefined ? { metadata: nextMetadata } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasPlayers.id, player.id),
          eq(saasPlayers.projectId, projectId),
        ),
      )
      .returning();

    player = {
      ...player,
      displayName: updated?.displayName ?? player.displayName,
      metadata:
        normalizeMetadata(updated?.metadata) ??
        (payload.metadata !== undefined ? nextMetadata : player.metadata),
    };
  }

  if (!player) {
    throw conflictError("Failed to initialize project player.", {
      code: API_ERROR_CODES.FAILED_TO_INITIALIZE_PROJECT_PLAYER,
    });
  }

  return player;
};

const ensureProjectFairnessSeed = async (
  tx: DbTransaction,
  projectId: number,
  epochSeconds: number,
) => {
  const seconds = resolveEpochSeconds(epochSeconds);
  const epoch = currentEpoch(seconds);

  const [existing] = await tx
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, seconds),
      ),
    )
    .limit(1);

  if (existing?.seed && existing.commitHash) {
    return {
      epoch,
      epochSeconds: seconds,
      commitHash: existing.commitHash,
      seed: existing.seed,
    };
  }

  const seed = randomBytes(32).toString("hex");
  const commitHash = hashValue(seed);

  await tx
    .insert(saasFairnessSeeds)
    .values({
      projectId,
      epoch,
      epochSeconds: seconds,
      commitHash,
      seed,
    })
    .onConflictDoNothing();

  const [created] = await tx
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, seconds),
      ),
    )
    .limit(1);

  if (!created?.seed) {
    throw conflictError("Failed to create fairness seed.", {
      code: API_ERROR_CODES.FAILED_TO_CREATE_FAIRNESS_SEED,
    });
  }

  return {
    epoch,
    epochSeconds: seconds,
    commitHash: created.commitHash,
    seed: created.seed,
  };
};

const loadProjectPrizeRows = async (projectId: number) =>
  db
    .select({
      id: saasProjectPrizes.id,
      name: saasProjectPrizes.name,
      stock: saasProjectPrizes.stock,
      weight: saasProjectPrizes.weight,
      rewardAmount: saasProjectPrizes.rewardAmount,
    })
    .from(saasProjectPrizes)
    .where(
      and(
        eq(saasProjectPrizes.projectId, projectId),
        eq(saasProjectPrizes.isActive, true),
        isNull(saasProjectPrizes.deletedAt),
      ),
    )
    .orderBy(desc(saasProjectPrizes.rewardAmount), saasProjectPrizes.id);

const recordUsageEvent = async (
  payload: {
    tenantId: number;
    projectId: number;
    apiKeyId: number;
    playerId?: number | null;
    eventType: PrizeEngineApiKeyScope;
    referenceType?: string | null;
    referenceId?: number | null;
    units?: number;
    amount?: string;
    currency?: string;
    metadata?: Record<string, unknown> | null;
  },
  dbExecutor: Pick<typeof db, "insert"> | DbTransaction = db,
) => {
  await dbExecutor.insert(saasUsageEvents).values({
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    apiKeyId: payload.apiKeyId,
    playerId: payload.playerId ?? null,
    eventType: payload.eventType,
    referenceType: payload.referenceType ?? null,
    referenceId: payload.referenceId ?? null,
    units: payload.units ?? 1,
    amount: payload.amount ?? "0",
    currency: payload.currency ?? "USD",
    metadata: payload.metadata ?? null,
  });
};

const assertProjectScope = (
  auth: ProjectApiAuth,
  scope: PrizeEngineApiKeyScope,
) => {
  if (auth.scopes.includes(scope)) {
    return;
  }

  throw forbiddenError("API key scope does not allow this operation.", {
    code: API_ERROR_CODES.API_KEY_SCOPE_FORBIDDEN,
  });
};

const asProjectFairnessCommit = (seed: FairnessSeedRow) => ({
  epoch: seed.epoch,
  epochSeconds: seed.epochSeconds,
  commitHash: seed.commitHash,
});

export async function authenticateProjectApiKey(apiKey: string) {
  const hash = hashValue(apiKey.trim());
  const now = new Date();

  const rows = await db
    .select({
      apiKeyId: saasApiKeys.id,
      projectId: saasProjects.id,
      tenantId: saasTenants.id,
      tenantName: saasTenants.name,
      projectSlug: saasProjects.slug,
      projectName: saasProjects.name,
      environment: saasProjects.environment,
      currency: saasProjects.currency,
      scopes: saasApiKeys.scopes,
      drawFee: saasBillingAccounts.drawFee,
      billingCurrency: saasBillingAccounts.currency,
      apiRateLimitBurst: saasProjects.apiRateLimitBurst,
      apiRateLimitHourly: saasProjects.apiRateLimitHourly,
      apiRateLimitDaily: saasProjects.apiRateLimitDaily,
    })
    .from(saasApiKeys)
    .innerJoin(saasProjects, eq(saasApiKeys.projectId, saasProjects.id))
    .innerJoin(saasTenants, eq(saasProjects.tenantId, saasTenants.id))
    .leftJoin(
      saasBillingAccounts,
      eq(saasBillingAccounts.tenantId, saasTenants.id),
    )
    .where(
      and(
        eq(saasApiKeys.keyHash, hash),
        isNull(saasApiKeys.revokedAt),
        gt(saasApiKeys.expiresAt, now),
        eq(saasProjects.status, "active"),
        eq(saasTenants.status, "active"),
      ),
    )
    .limit(1);

  const auth = rows[0];
  if (!auth) {
    throw unauthorizedError("Invalid API key.", {
      code: API_ERROR_CODES.INVALID_API_KEY,
    });
  }

  await db
    .update(saasApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(saasApiKeys.id, auth.apiKeyId),
        eq(saasApiKeys.projectId, auth.projectId),
      ),
    );

  return {
    tenantId: auth.tenantId,
    tenantName: auth.tenantName,
    projectId: auth.projectId,
    projectSlug: auth.projectSlug,
    projectName: auth.projectName,
    environment: auth.environment,
    currency: auth.currency,
    apiKeyId: auth.apiKeyId,
    scopes: normalizeScopes(auth.scopes),
    drawFee: auth.drawFee ? new Decimal(auth.drawFee).toFixed(4) : "0.0000",
    billingCurrency: auth.billingCurrency ?? auth.currency,
    apiRateLimitBurst: Number(auth.apiRateLimitBurst ?? 120),
    apiRateLimitHourly: Number(auth.apiRateLimitHourly ?? 3600),
    apiRateLimitDaily: Number(auth.apiRateLimitDaily ?? 86400),
  } satisfies ProjectApiAuth;
}

async function getProjectFairnessCommit(projectId: number) {
  const [project] = await db
    .select()
    .from(saasProjects)
    .where(eq(saasProjects.id, projectId))
    .limit(1);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  return db.transaction(async (tx) => {
    const seed = await ensureProjectFairnessSeed(
      tx,
      projectId,
      Number(project.fairnessEpochSeconds ?? DEFAULT_FAIRNESS_EPOCH_SECONDS),
    );
    return asProjectFairnessCommit(seed);
  });
}

async function revealProjectFairnessSeed(projectId: number, epoch: number) {
  const [project] = await db
    .select()
    .from(saasProjects)
    .where(eq(saasProjects.id, projectId))
    .limit(1);

  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const epochSeconds = resolveEpochSeconds(project.fairnessEpochSeconds);
  const current = currentEpoch(epochSeconds);
  if (!Number.isFinite(epoch) || epoch < 0 || epoch >= current) {
    throw notFoundError("Fairness reveal not available for this epoch.", {
      code: API_ERROR_CODES.FAIRNESS_REVEAL_NOT_AVAILABLE,
    });
  }

  const [seed] = await db
    .select()
    .from(saasFairnessSeeds)
    .where(
      and(
        eq(saasFairnessSeeds.projectId, projectId),
        eq(saasFairnessSeeds.epoch, epoch),
        eq(saasFairnessSeeds.epochSeconds, epochSeconds),
      ),
    )
    .limit(1);

  if (!seed) {
    throw notFoundError("Fairness reveal not found.", {
      code: API_ERROR_CODES.FAIRNESS_REVEAL_NOT_FOUND,
    });
  }

  if (!seed.revealedAt) {
    await db
      .update(saasFairnessSeeds)
      .set({ revealedAt: new Date() })
      .where(
        and(
          eq(saasFairnessSeeds.id, seed.id),
          eq(saasFairnessSeeds.projectId, projectId),
        ),
      );
  }

  return {
    epoch: seed.epoch,
    epochSeconds: seed.epochSeconds,
    commitHash: seed.commitHash,
    seed: seed.seed,
    revealedAt: seed.revealedAt ?? new Date(),
  };
}

export async function getPrizeEngineOverview(
  auth: ProjectApiAuth,
): Promise<PrizeEngineOverview> {
  assertProjectScope(auth, "catalog:read");

  const [projectRows, prizes, fairness] = await Promise.all([
    db
      .select()
      .from(saasProjects)
      .where(
        and(
          eq(saasProjects.id, auth.projectId),
          eq(saasProjects.tenantId, auth.tenantId),
        ),
      )
      .limit(1),
    loadProjectPrizeRows(auth.projectId),
    getProjectFairnessCommit(auth.projectId),
  ]);

  const project = projectRows[0];
  if (!project) {
    throw notFoundError("Project not found.", {
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
    });
  }

  const presentations = buildPrizePresentations(
    prizes.map((row) => ({
      id: row.id,
      name: row.name,
      stock: Number(row.stock ?? 0),
      weight: Number(row.weight ?? 1),
      rewardAmount: toMoneyString(row.rewardAmount),
    })),
  );

  await recordUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    eventType: "catalog:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: { route: "overview" },
  });

  return {
    project: {
      id: project.id,
      tenantId: project.tenantId,
      slug: project.slug,
      name: project.name,
      environment: project.environment,
      status: project.status,
      currency: project.currency,
      drawCost: toMoneyString(project.drawCost),
      prizePoolBalance: toMoneyString(project.prizePoolBalance),
      fairnessEpochSeconds: Number(project.fairnessEpochSeconds),
      maxDrawCount: Number(project.maxDrawCount),
      missWeight: Number(project.missWeight),
    },
    fairness,
    prizes: presentations,
    featuredPrizes: presentations.filter((item) => item.isFeatured),
  };
}

export async function getPrizeEngineFairnessCommit(auth: ProjectApiAuth) {
  assertProjectScope(auth, "fairness:read");

  const commit = await getProjectFairnessCommit(auth.projectId);
  await recordUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    eventType: "fairness:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: { route: "commit" },
  });

  return commit;
}

export async function revealPrizeEngineFairnessSeed(
  auth: ProjectApiAuth,
  epoch: number,
) {
  assertProjectScope(auth, "fairness:read");

  const reveal = await revealProjectFairnessSeed(auth.projectId, epoch);
  await recordUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    eventType: "fairness:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: { route: "reveal", epoch },
  });

  return reveal;
}

export async function createPrizeEngineDraw(
  auth: ProjectApiAuth,
  payload: PrizeEngineDrawRequest,
): Promise<PrizeEngineDrawResponse> {
  assertProjectScope(auth, "draw:write");

  const response = await db.transaction(async (tx) => {
    const project = await loadLockedProject(tx, auth.projectId);
    if (!project || project.status !== "active") {
      throw notFoundError("Project not found.", {
        code: API_ERROR_CODES.PROJECT_NOT_FOUND,
      });
    }

    const player = await ensureProjectPlayer(tx, project.id, payload.player);
    const fairnessSeed = await ensureProjectFairnessSeed(
      tx,
      project.id,
      project.fairnessEpochSeconds,
    );
    const prizeRows = await tx
      .select({
        id: saasProjectPrizes.id,
        projectId: saasProjectPrizes.projectId,
        name: saasProjectPrizes.name,
        stock: saasProjectPrizes.stock,
        weight: saasProjectPrizes.weight,
        rewardAmount: saasProjectPrizes.rewardAmount,
        isActive: saasProjectPrizes.isActive,
        deletedAt: saasProjectPrizes.deletedAt,
        metadata: saasProjectPrizes.metadata,
      })
      .from(saasProjectPrizes)
      .where(
        and(
          eq(saasProjectPrizes.projectId, project.id),
          eq(saasProjectPrizes.isActive, true),
          isNull(saasProjectPrizes.deletedAt),
        ),
      );

    const availablePrizes = prizeRows.filter(
      (row) => Number(row.stock ?? 0) > 0 && Number(row.weight ?? 0) > 0,
    );

    const clientNonce = payload.clientNonce?.trim() || null;
    const serverNonce = randomBytes(12).toString("hex");
    const fairnessNonce = clientNonce
      ? `${clientNonce}:${serverNonce}`
      : serverNonce;

    const weightedItems = [
      ...availablePrizes.map((row) => ({
        kind: "prize" as const,
        id: row.id,
        weight: Number(row.weight ?? 0),
      })),
      ...(Number(project.missWeight ?? 0) > 0
        ? [
            {
              kind: "miss" as const,
              id: 0,
              weight: Number(project.missWeight ?? 0),
            },
          ]
        : []),
    ];

    const totalWeight = weightedItems.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    const pickSeed =
      totalWeight > 0
        ? deriveRandomPick(totalWeight, fairnessSeed.seed, fairnessNonce)
        : null;
    const selection =
      totalWeight > 0 && pickSeed
        ? pickByWeight(weightedItems, () => pickSeed.pick)
        : null;

    let selectedPrize: LockedPrizeRow | null = null;
    if (selection?.item.kind === "prize") {
      selectedPrize = await loadLockedPrize(tx, project.id, selection.item.id);
      if (
        !selectedPrize ||
        selectedPrize.projectId !== project.id ||
        !selectedPrize.isActive ||
        selectedPrize.deletedAt ||
        selectedPrize.stock <= 0 ||
        toDecimal(selectedPrize.rewardAmount).gt(project.prizePoolBalance)
      ) {
        selectedPrize = null;
      }
    }

    const drawCost = toDecimal(project.drawCost);
    const rewardAmount = selectedPrize
      ? toDecimal(selectedPrize.rewardAmount)
      : new Decimal(0);
    const startingBalance = toDecimal(player.balance);
    const endingBalance = startingBalance.minus(drawCost).plus(rewardAmount);
    const endingPoolBalance = Decimal.max(
      toDecimal(project.prizePoolBalance).plus(drawCost).minus(rewardAmount),
      0,
    );
    const won = rewardAmount.gt(0);
    const nextPityStreak = won ? 0 : Number(player.pityStreak ?? 0) + 1;

    if (selectedPrize) {
      await tx
        .update(saasProjectPrizes)
        .set({
          stock: selectedPrize.stock - 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(saasProjectPrizes.id, selectedPrize.id),
            eq(saasProjectPrizes.projectId, project.id),
          ),
        );
    }

    const [updatedPlayer] = await tx
      .update(saasPlayers)
      .set({
        balance: endingBalance.toFixed(2),
        pityStreak: nextPityStreak,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasPlayers.id, player.id),
          eq(saasPlayers.projectId, project.id),
        ),
      )
      .returning();

    if (!updatedPlayer) {
      throw conflictError("Failed to update project player.", {
        code: API_ERROR_CODES.FAILED_TO_UPDATE_PROJECT_PLAYER,
      });
    }

    await tx
      .update(saasProjects)
      .set({
        prizePoolBalance: endingPoolBalance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(saasProjects.id, project.id));

    if (!drawCost.eq(0)) {
      await tx.insert(saasLedgerEntries).values({
        projectId: project.id,
        playerId: player.id,
        entryType: "draw_cost",
        amount: drawCost.negated().toFixed(2),
        balanceBefore: startingBalance.toFixed(2),
        balanceAfter: startingBalance.minus(drawCost).toFixed(2),
        referenceType: "draw",
        metadata: {
          externalPlayerId: player.externalPlayerId,
        },
      });
    }

    const fairnessMetadata = {
      epoch: fairnessSeed.epoch,
      epochSeconds: fairnessSeed.epochSeconds,
      commitHash: fairnessSeed.commitHash,
      clientNonce,
      serverNonce,
      nonceSource: (clientNonce ? "client" : "server") as "client" | "server",
      rngDigest: pickSeed?.digest ?? null,
      totalWeight: pickSeed?.pick ? totalWeight : null,
      randomPick: pickSeed?.pick ?? null,
      algorithm: "sha256(seed:nonce:totalWeight)%totalWeight+1",
    };

    const [record] = await tx
      .insert(saasDrawRecords)
      .values({
        projectId: project.id,
        playerId: player.id,
        prizeId: selectedPrize?.id ?? null,
        drawCost: drawCost.toFixed(2),
        rewardAmount: rewardAmount.toFixed(2),
        status: won ? "won" : "miss",
        metadata: {
          fairness: fairnessMetadata,
          playerBalanceBefore: startingBalance.toFixed(2),
          playerBalanceAfter: endingBalance.toFixed(2),
          prizePoolBalanceBefore: toMoneyString(project.prizePoolBalance),
          prizePoolBalanceAfter: endingPoolBalance.toFixed(2),
        },
      })
      .returning();

    if (!rewardAmount.eq(0)) {
      await tx.insert(saasLedgerEntries).values({
        projectId: project.id,
        playerId: player.id,
        entryType: "prize_reward",
        amount: rewardAmount.toFixed(2),
        balanceBefore: startingBalance.minus(drawCost).toFixed(2),
        balanceAfter: endingBalance.toFixed(2),
        referenceType: "draw",
        referenceId: record.id,
        metadata: {
          prizeId: selectedPrize?.id ?? null,
          prizeName: selectedPrize?.name ?? null,
        },
      });
    }

    await recordUsageEvent(
      {
        tenantId: auth.tenantId,
        projectId: auth.projectId,
        apiKeyId: auth.apiKeyId,
        playerId: updatedPlayer.id,
        eventType: "draw:write",
        referenceType: "draw",
        referenceId: record.id,
        amount: auth.drawFee,
        currency: auth.billingCurrency,
        metadata: {
          externalPlayerId: updatedPlayer.externalPlayerId,
          status: record.status,
          prizeId: record.prizeId,
        },
      },
      tx,
    );

    return {
      player: {
        id: updatedPlayer.id,
        projectId: updatedPlayer.projectId,
        externalPlayerId: updatedPlayer.externalPlayerId,
        displayName: updatedPlayer.displayName,
        balance: toMoneyString(updatedPlayer.balance),
        pityStreak: updatedPlayer.pityStreak,
        metadata: normalizeMetadata(updatedPlayer.metadata),
        createdAt: updatedPlayer.createdAt,
        updatedAt: updatedPlayer.updatedAt,
      },
      result: {
        id: record.id,
        playerId: player.id,
        prizeId: selectedPrize?.id ?? null,
        drawCost: toMoneyString(record.drawCost),
        rewardAmount: toMoneyString(record.rewardAmount),
        status: record.status,
        createdAt: record.createdAt,
        fairness: fairnessMetadata,
        prize: selectedPrize
          ? buildPrizePresentations([
              {
                id: selectedPrize.id,
                name: selectedPrize.name,
                stock: Math.max(selectedPrize.stock - 1, 0),
                weight: selectedPrize.weight,
                rewardAmount: toMoneyString(selectedPrize.rewardAmount),
              },
            ])[0]
          : null,
      },
    };
  });

  return response;
}

export async function getPrizeEngineLedger(
  auth: ProjectApiAuth,
  externalPlayerId: string,
  limit = 50,
) {
  assertProjectScope(auth, "ledger:read");

  const [player] = await db
    .select()
    .from(saasPlayers)
    .where(
      and(
        eq(saasPlayers.projectId, auth.projectId),
        eq(saasPlayers.externalPlayerId, externalPlayerId),
      ),
    )
    .limit(1);

  if (!player) {
    throw notFoundError("Project player not found.", {
      code: API_ERROR_CODES.PROJECT_PLAYER_NOT_FOUND,
    });
  }

  const entries = await db
    .select()
    .from(saasLedgerEntries)
    .where(
      and(
        eq(saasLedgerEntries.projectId, auth.projectId),
        eq(saasLedgerEntries.playerId, player.id),
      ),
    )
    .orderBy(desc(saasLedgerEntries.id))
    .limit(Math.min(Math.max(limit, 1), 200));

  await recordUsageEvent({
    tenantId: auth.tenantId,
    projectId: auth.projectId,
    apiKeyId: auth.apiKeyId,
    playerId: player.id,
    eventType: "ledger:read",
    amount: "0",
    currency: auth.billingCurrency,
    metadata: {
      externalPlayerId,
      limit: Math.min(Math.max(limit, 1), 200),
    },
  });

  return {
    player: {
      id: player.id,
      projectId: player.projectId,
      externalPlayerId: player.externalPlayerId,
      displayName: player.displayName,
      balance: toMoneyString(player.balance),
      pityStreak: player.pityStreak,
      metadata: normalizeMetadata(player.metadata),
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    },
    entries: entries.map(toPrizeEngineLedgerEntry),
  };
}

export type { ProjectApiAuth } from "./prize-engine-domain";
