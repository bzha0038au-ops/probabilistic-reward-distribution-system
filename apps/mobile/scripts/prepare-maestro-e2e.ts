/// <reference path="../../backend/src/http/fastify.d.ts" />

import { config as loadEnv } from "dotenv";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

loadEnv({
  path: fileURLToPath(new URL("../../backend/.env", import.meta.url)),
});

import {
  holdemTableMessages,
  holdemTableSeats,
  holdemTables,
  kycProfiles,
  predictionMarkets,
  tableEvents,
  userWallets,
  users,
} from "../../database/src/index";
import { and, eq, inArray } from "../../database/src/orm";

import { db, resetDb } from "../../backend/src/db";
import { createHoldemTable, joinHoldemTable } from "../../backend/src/modules/holdem/service";
import {
  getCurrentEffectiveLegalDocuments,
  recordLegalAcceptancesInTransaction,
} from "../../backend/src/modules/legal/service";
import { createPredictionMarket } from "../../backend/src/modules/prediction-market/service";
import { hashPassword } from "../../backend/src/modules/auth/password";
import { closeRedis } from "../../backend/src/shared/redis";

const HOLD_EM_TABLE_NAME = "Mobile Maestro E2E Holdem";
const HOLD_EM_BUY_IN = "100.00";
const PREDICTION_MARKET_SLUG = "mobile-maestro-e2e-market";
const PREDICTION_MARKET_TITLE = "Mobile Maestro E2E Market";
const E2E_PASSWORD = "User123!";

const E2E_USERS = {
  alice: {
    email: "mobile.e2e.alice@example.com",
    phone: "+61490010001",
  },
  bob: {
    email: "mobile.e2e.bob@example.com",
    phone: "+61490010002",
  },
} as const;

async function upsertE2eUser(spec: { email: string; phone: string }) {
  const now = new Date();
  const passwordHash = hashPassword(E2E_PASSWORD);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, spec.email))
    .limit(1);

  const [user] = existing
    ? await db
        .update(users)
        .set({
          phone: spec.phone,
          passwordHash,
          emailVerifiedAt: now,
          phoneVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning({ id: users.id, email: users.email })
    : await db
        .insert(users)
        .values({
          email: spec.email,
          phone: spec.phone,
          passwordHash,
          role: "user",
          emailVerifiedAt: now,
          phoneVerifiedAt: now,
        })
        .returning({ id: users.id, email: users.email });

  if (!user) {
    throw new Error(`Failed to provision E2E user ${spec.email}.`);
  }

  await db
    .insert(userWallets)
    .values({
      userId: user.id,
      withdrawableBalance: "500.00",
      bonusBalance: "500.00",
      lockedBalance: "0.00",
      wageredAmount: "0.00",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userWallets.userId,
      set: {
        withdrawableBalance: "500.00",
        bonusBalance: "500.00",
        lockedBalance: "0.00",
        wageredAmount: "0.00",
        updatedAt: now,
      },
    });

  const [existingKycProfile] = await db
    .select({ id: kycProfiles.id })
    .from(kycProfiles)
    .where(eq(kycProfiles.userId, user.id))
    .limit(1);

  if (!existingKycProfile) {
    await db.insert(kycProfiles).values({
      userId: user.id,
      currentTier: "tier_2",
      status: "approved",
      submittedAt: now,
      reviewedAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(kycProfiles)
      .set({
        currentTier: "tier_2",
        requestedTier: null,
        status: "approved",
        rejectionReason: null,
        freezeRecordId: null,
        reviewedByAdminId: null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(kycProfiles.id, existingKycProfile.id));
  }

  const currentDocuments = await getCurrentEffectiveLegalDocuments(db);
  await db.transaction(async (tx) => {
    await recordLegalAcceptancesInTransaction(tx, {
      userId: user.id,
      documents: currentDocuments,
      source: "maestro_e2e",
    });
  });

  return user;
}

async function assertDatabaseReady() {
  try {
    await db.select({ id: users.id }).from(users).limit(1);
  } catch (error) {
    throw new Error(
      "Postgres is not ready for mobile Maestro fixtures. Run `pnpm db:up`, `pnpm db:migrate`, and verify `apps/backend/.env` points at the local database.",
      { cause: error as Error },
    );
  }
}

async function cleanupHoldem(userIds: number[]) {
  const seatedTables = await db
    .select({ tableId: holdemTableSeats.tableId })
    .from(holdemTableSeats)
    .where(inArray(holdemTableSeats.userId, userIds));

  const namedTables = await db
    .select({ id: holdemTables.id })
    .from(holdemTables)
    .where(eq(holdemTables.name, HOLD_EM_TABLE_NAME));

  const tableIds = [...new Set([
    ...seatedTables.map((row) => row.tableId),
    ...namedTables.map((row) => row.id),
  ])];

  if (tableIds.length === 0) {
    return;
  }

  await db
    .delete(tableEvents)
    .where(
      and(
        eq(tableEvents.tableType, "holdem"),
        inArray(tableEvents.tableId, tableIds),
      ),
    );
  await db
    .delete(holdemTableMessages)
    .where(inArray(holdemTableMessages.tableId, tableIds));
  await db.delete(holdemTables).where(inArray(holdemTables.id, tableIds));
}

async function cleanupPredictionMarket() {
  const markets = await db
    .select({ id: predictionMarkets.id })
    .from(predictionMarkets)
    .where(eq(predictionMarkets.slug, PREDICTION_MARKET_SLUG));

  if (markets.length === 0) {
    return;
  }

  await db
    .delete(predictionMarkets)
    .where(inArray(predictionMarkets.id, markets.map((market) => market.id)));
}

async function prepareHoldem(params: { aliceId: number; bobId: number }) {
  await cleanupHoldem([params.aliceId, params.bobId]);

  const created = await createHoldemTable(params.bobId, {
    tableName: HOLD_EM_TABLE_NAME,
    buyInAmount: HOLD_EM_BUY_IN,
    tableType: "casual",
    maxSeats: 2,
  });

  const now = new Date();
  const disconnectGraceExpiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const seatLeaseExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

  // Leave seat 0 open so Alice joins from mobile into the dealer/small-blind seat
  // and can take the first preflop action in the Maestro flow.
  await db
    .update(holdemTableSeats)
    .set({
      seatIndex: 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(holdemTableSeats.tableId, created.table.id),
        eq(holdemTableSeats.userId, params.bobId),
      ),
    );

  await db
    .update(holdemTableSeats)
    .set({
      presenceHeartbeatAt: now,
      disconnectGraceExpiresAt,
      seatLeaseExpiresAt,
      autoCashOutPending: false,
      updatedAt: now,
    })
    .where(eq(holdemTableSeats.tableId, created.table.id));

  return created.table.id;
}

async function preparePredictionMarket() {
  await cleanupPredictionMarket();

  const now = new Date();
  const locksAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const resolvesAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const market = await createPredictionMarket({
    slug: PREDICTION_MARKET_SLUG,
    roundKey: "mobile-maestro-e2e-round",
    title: PREDICTION_MARKET_TITLE,
    description: "Native mobile e2e validation market.",
    resolutionRules:
      "The market resolves manually for native e2e validation only.",
    sourceOfTruth: "Mobile Maestro E2E harness",
    category: "technology",
    tags: ["mobile", "e2e", "maestro"],
    invalidPolicy: "refund_all",
    vigBps: 500,
    outcomes: [
      { key: "up", label: "Up" },
      { key: "down", label: "Down" },
    ],
    opensAt: new Date(now.getTime() - 60 * 1000),
    locksAt,
    resolvesAt,
  });

  return market.id;
}

export async function prepareMaestroE2E() {
  await assertDatabaseReady();

  const alice = await upsertE2eUser(E2E_USERS.alice);
  const bob = await upsertE2eUser(E2E_USERS.bob);

  const holdemTableId = await prepareHoldem({
    aliceId: alice.id,
    bobId: bob.id,
  });
  const predictionMarketId = await preparePredictionMarket();

  console.log("Prepared mobile Maestro e2e fixtures.");
  console.log(`Holdem table: ${HOLD_EM_TABLE_NAME} (#${holdemTableId})`);
  console.log(`Prediction market: ${PREDICTION_MARKET_TITLE} (#${predictionMarketId})`);
  console.log(`Login: ${alice.email} / ${E2E_PASSWORD}`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  prepareMaestroE2E()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeRedis();
      await resetDb();
    });
}
