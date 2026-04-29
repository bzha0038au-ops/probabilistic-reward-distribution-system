import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  admins,
  notificationDeliveries,
  saasBillingAccounts,
  saasBillingAccountVersions,
  saasApiKeys,
  saasBillingRuns,
  saasProjectPrizes,
  saasProjects,
  saasTenantMemberships,
  saasTenants,
  saasUsageEvents,
  users,
} from "@reward/database";
import { desc, eq } from "@reward/database/orm";

import { db, resetDb } from "../src/db";
import { getSaasTenantBillingInsights } from "../src/modules/saas/billing-budget-service";
import { readSaasBillingBudgetPolicy } from "../src/modules/saas/billing-budget";
import { toSaasAdminActor } from "../src/modules/saas/records";
import { createPrizeEngineClient } from "../../../packages/prize-engine-sdk/src/api";

const CONTEXT_PATH = "/tmp/reward-e2-context.json";
const ADMIN_EMAIL = "admin.manual@example.com";
const ADMIN_PASSWORD = "Admin123!";
const WEBHOOK_URL = "http://127.0.0.1:8787/billing-alert";
const WEBHOOK_SECRET = "billing-secret-123";
const USAGE_SEED_SOURCE = "e2_cost_forecast_validation";

type Context = {
  adminEmail: string;
  adminPassword: string;
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  projectId: number;
  projectSlug: string;
  apiKeyId: number;
  apiKey: string;
  billingInsights: unknown;
};

const emptyBudgetState = () => ({
  month: null,
  thresholdAlertedAt: null,
  forecast7dAlertedAt: null,
  forecast30dAlertedAt: null,
  hardCapReachedAt: null,
  hardCapAlertedAt: null,
});

const readContext = async (): Promise<Context> =>
  JSON.parse(await readFile(CONTEXT_PATH, "utf8")) as Context;

const hashValue = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const buildBillingMetadata = () => ({
  seedSource: USAGE_SEED_SOURCE,
  billingMode: "decision_class",
  decisionPricing: {
    reject: "0.02",
    mute: "0.10",
    payout: "1.25",
  },
  budgetPolicy: {
    monthlyBudget: "32.70",
    alertThresholdPct: 80,
    hardCap: "33.00",
    alertEmailEnabled: true,
    alertWebhookUrl: WEBHOOK_URL,
    alertWebhookSecret: WEBHOOK_SECRET,
  },
  budgetState: emptyBudgetState(),
});

const resolveAdmin = async () => {
  const [admin] = await db
    .select({ adminId: admins.id, email: users.email })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (!admin) {
    throw new Error(`Missing ${ADMIN_EMAIL}.`);
  }

  return admin;
};

const setup = async () => {
  const admin = await resolveAdmin();
  const now = new Date();
  const slugSuffix = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const tenantSlug = `e2-cost-forecast-${slugSuffix}`;
  const tenantName = `E2 Cost Forecast ${slugSuffix}`;

  const [tenant] = await db
    .insert(saasTenants)
    .values({
      slug: tenantSlug,
      name: tenantName,
      billingEmail: ADMIN_EMAIL,
      status: "active",
      metadata: { seedSource: USAGE_SEED_SOURCE },
    })
    .returning({
      id: saasTenants.id,
      slug: saasTenants.slug,
      name: saasTenants.name,
    });

  await db.insert(saasTenantMemberships).values({
    tenantId: tenant.id,
    adminId: admin.adminId,
    role: "tenant_owner",
    createdByAdminId: admin.adminId,
    metadata: { seedSource: USAGE_SEED_SOURCE },
  });

  const [project] = await db
    .insert(saasProjects)
    .values({
      tenantId: tenant.id,
      slug: "production",
      name: "Production",
      environment: "live",
      status: "active",
      currency: "USD",
      drawCost: "0.00",
      prizePoolBalance: "100.00",
      strategy: "weighted_gacha",
      strategyParams: {},
      fairnessEpochSeconds: 3600,
      maxDrawCount: 1,
      missWeight: 0,
      apiRateLimitBurst: 120,
      apiRateLimitHourly: 3600,
      apiRateLimitDaily: 86400,
      metadata: { seedSource: USAGE_SEED_SOURCE },
    })
    .returning({
      id: saasProjects.id,
      slug: saasProjects.slug,
    });

  await db.insert(saasProjectPrizes).values({
    projectId: project.id,
    name: "Cap Test Prize",
    stock: 100,
    weight: 1,
    rewardAmount: "5.00",
    isActive: true,
    metadata: { seedSource: USAGE_SEED_SOURCE },
  });

  const apiKey = `rk_live_${slugSuffix}_${randomUUID().replace(/-/g, "")}`;
  const [apiKeyRow] = await db
    .insert(saasApiKeys)
    .values({
      projectId: project.id,
      label: `e2-live-${slugSuffix}`,
      keyPrefix: apiKey.slice(0, 40),
      keyHash: hashValue(apiKey),
      scopes: ["catalog:read", "fairness:read", "reward:write", "ledger:read"],
      createdByAdminId: admin.adminId,
      expiresAt: new Date(Date.UTC(2036, 0, 1, 0, 0, 0, 0)),
    })
    .returning({
      id: saasApiKeys.id,
    });

  const [billingAccount] = await db
    .insert(saasBillingAccounts)
    .values({
      tenantId: tenant.id,
      planCode: "starter",
      collectionMethod: "send_invoice",
      autoBillingEnabled: false,
      portalConfigurationId: null,
      baseMonthlyFee: "29.00",
      drawFee: "0.1000",
      currency: "USD",
      isBillable: true,
      metadata: buildBillingMetadata(),
    })
    .returning({
      id: saasBillingAccounts.id,
    });

  await db.insert(saasBillingAccountVersions).values({
    tenantId: tenant.id,
    billingAccountId: billingAccount.id,
    planCode: "starter",
    collectionMethod: "send_invoice",
    autoBillingEnabled: false,
    portalConfigurationId: null,
    baseMonthlyFee: "29.00",
    drawFee: "0.1000",
    currency: "USD",
    isBillable: true,
    metadata: buildBillingMetadata(),
    effectiveAt: now,
    createdByAdminId: admin.adminId,
  });

  for (let daysAgo = 8; daysAgo >= 0; daysAgo -= 1) {
    const createdAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        12,
        0,
        0,
        0,
      ),
    );

    await db.insert(saasUsageEvents).values({
      tenantId: tenant.id,
      projectId: project.id,
      apiKeyId: apiKeyRow.id,
      environment: "live",
      eventType: "reward:write",
      decisionType: "mute",
      units: 1,
      amount: "0.4000",
      currency: "USD",
      metadata: {
        billable: true,
        seedSource: USAGE_SEED_SOURCE,
        scenario: `history-${daysAgo}`,
      },
      createdAt,
    });
  }

  const actor = toSaasAdminActor(admin.adminId, undefined, "membership");
  const billingInsights = await getSaasTenantBillingInsights(tenant.id, actor);

  const context: Context = {
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    projectId: project.id,
    projectSlug: project.slug,
    apiKeyId: apiKeyRow.id,
    apiKey,
    billingInsights,
  };

  await writeFile(CONTEXT_PATH, JSON.stringify(context, null, 2));
  console.log(JSON.stringify(context, null, 2));
};

const reward = async () => {
  const context = await readContext();

  const client = createPrizeEngineClient({
    baseUrl: "http://127.0.0.1:4000",
    environment: "live",
    getApiKey: () => context.apiKey,
    fetchImpl: fetch,
    retry: false,
  });

  const result = await client.reward({
    environment: "live",
    idempotencyKey: `e2-hard-cap-${Date.now()}`,
    clientNonce: `e2-hard-cap-${Date.now()}`,
    agent: {
      agentId: `tenant-${context.tenantId}-agent`,
      groupId: "e2-hard-cap",
      metadata: { source: USAGE_SEED_SOURCE },
    },
    behavior: {
      actionType: "e2.billing.hard_cap",
      score: 0.95,
      novelty: 0.5,
      risk: 0,
      context: { source: USAGE_SEED_SOURCE },
    },
    player: {
      externalPlayerId: `e2-player-${context.tenantId}`,
      displayName: "E2 Billing Player",
    },
  });

  const admin = await resolveAdmin();
  const actor = toSaasAdminActor(admin.adminId, undefined, "membership");
  const billingInsights = await getSaasTenantBillingInsights(
    context.tenantId,
    actor,
  );
  const [billingAccount] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.tenantId, context.tenantId))
    .limit(1);
  const latestUsage = await db
    .select()
    .from(saasUsageEvents)
    .where(eq(saasUsageEvents.tenantId, context.tenantId))
    .orderBy(desc(saasUsageEvents.id))
    .limit(3);

  console.log(
    JSON.stringify(
      {
        result,
        billingPolicy: billingAccount
          ? readSaasBillingBudgetPolicy(billingAccount.metadata)
          : null,
        billingInsights,
        latestUsage,
      },
      null,
      2,
    ),
  );
};

const inspect = async () => {
  const context = await readContext();
  const [billingAccount] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.tenantId, context.tenantId))
    .limit(1);
  const latestUsage = await db
    .select()
    .from(saasUsageEvents)
    .where(eq(saasUsageEvents.tenantId, context.tenantId))
    .orderBy(desc(saasUsageEvents.id))
    .limit(10);
  const deliveries = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.kind, "saas_billing_budget_alert"))
    .orderBy(desc(notificationDeliveries.id))
    .limit(10);
  const runs = await db
    .select()
    .from(saasBillingRuns)
    .where(eq(saasBillingRuns.tenantId, context.tenantId))
    .orderBy(desc(saasBillingRuns.id))
    .limit(5);

  console.log(
    JSON.stringify(
      {
        context,
        billingPolicy: billingAccount
          ? readSaasBillingBudgetPolicy(billingAccount.metadata)
          : null,
        latestUsage,
        deliveries,
        runs,
      },
      null,
      2,
    ),
  );
};

const resetBudget = async () => {
  const context = await readContext();
  const [billingAccount] = await db
    .select()
    .from(saasBillingAccounts)
    .where(eq(saasBillingAccounts.tenantId, context.tenantId))
    .limit(1);

  if (!billingAccount) {
    throw new Error("Billing account missing.");
  }

  const metadata = buildBillingMetadata();
  await db
    .update(saasTenants)
    .set({
      billingEmail: `billing.e2.${context.tenantId}@example.com`,
      updatedAt: new Date(),
    })
    .where(eq(saasTenants.id, context.tenantId));
  await db
    .update(saasBillingAccounts)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(saasBillingAccounts.id, billingAccount.id));

  console.log("ok");
};

const main = async () => {
  const mode = process.argv[2] ?? "setup";

  try {
    if (mode === "setup") {
      await setup();
      return;
    }
    if (mode === "reward") {
      await reward();
      return;
    }
    if (mode === "inspect") {
      await inspect();
      return;
    }
    if (mode === "reset-budget") {
      await resetBudget();
      return;
    }
    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await resetDb();
  }
};

void main();
