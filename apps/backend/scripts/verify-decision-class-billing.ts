import 'dotenv/config';

import { parseArgs } from 'node:util';
import {
  adminPermissions,
  admins,
  saasApiKeys,
  saasBillingAccountVersions,
  saasBillingRuns,
  saasProjects,
  saasTenantMemberships,
  saasTenants,
  saasUsageEvents,
  users,
} from '@reward/database';
import { and, asc, desc, eq } from '@reward/database/orm';

import { db, resetDb } from '../src/db';
import { hashPassword } from '../src/modules/auth/password';
import { DEFAULT_ADMIN_PERMISSION_KEYS } from '../src/modules/admin-permission/definitions';
import {
  createBillingRun,
  createProjectApiKey,
  createSaasProject,
  createSaasTenant,
  recordPrizeEngineUsageEvent,
  upsertSaasBillingAccount,
} from '../src/modules/saas/service';

const DEFAULT_ADMIN_EMAIL = 'admin.manual@example.com';
const DEFAULT_ADMIN_PASSWORD = 'Admin123!';
const DEFAULT_TENANT_SLUG = 'f2-decision-billing';
const DEFAULT_TENANT_NAME = 'F2 Decision Billing';
const DEFAULT_PROJECT_SLUG = 'production';
const DEFAULT_PROJECT_NAME = 'Production';
const DEFAULT_API_KEY_LABEL = 'F2 verification live key';
const DEFAULT_BASE_MONTHLY_FEE = '29.00';
const DEFAULT_DRAW_FEE = '0.10';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_VERIFICATION_SOURCE = 'decision_class_billing_verification';

const DEFAULT_DECISION_PRICING = {
  reject: '0.02',
  mute: '0.10',
  payout: '1.25',
} as const;

type VerificationContext = {
  admin: {
    adminId: number;
    email: string;
    password: string;
  };
  tenant: {
    id: number;
    slug: string;
    name: string;
  };
  project: {
    id: number;
    slug: string;
  };
  apiKey: {
    id: number;
    label: string;
  };
  latestBillingVersion: {
    id: number;
    effectiveAt: Date;
  };
};

type CleanupPreview = {
  billingRunIds: number[];
  usageEventIds: number[];
};

type PreviewContext = {
  admin: {
    adminId: number;
    email: string;
  } | null;
  tenant: {
    id: number;
    slug: string;
    name: string;
  } | null;
  project: {
    id: number;
    slug: string;
  } | null;
  apiKey: {
    id: number;
    label: string;
  } | null;
  latestBillingVersion: {
    id: number;
    effectiveAt: Date;
  } | null;
  missingResources: string[];
};

const readCliOptions = () => {
  const parsed = parseArgs({
    options: {
      apply: {
        type: 'boolean',
        default: false,
      },
      tenantSlug: {
        type: 'string',
        default: DEFAULT_TENANT_SLUG,
      },
      tenantName: {
        type: 'string',
        default: DEFAULT_TENANT_NAME,
      },
      adminEmail: {
        type: 'string',
        default: DEFAULT_ADMIN_EMAIL,
      },
      adminPassword: {
        type: 'string',
        default: DEFAULT_ADMIN_PASSWORD,
      },
      verificationSource: {
        type: 'string',
        default: DEFAULT_VERIFICATION_SOURCE,
      },
    },
    allowPositionals: true,
  });

  const applyFromPositionals = parsed.positionals.includes('--apply');

  return {
    apply: parsed.values.apply || applyFromPositionals,
    tenantSlug: parsed.values.tenantSlug,
    tenantName: parsed.values.tenantName,
    adminEmail: parsed.values.adminEmail,
    adminPassword: parsed.values.adminPassword,
    verificationSource: parsed.values.verificationSource,
  };
};

const ensureAdmin = async (email: string, password: string) => {
  const [existing] = await db
    .select({
      userId: users.id,
      adminId: admins.id,
    })
    .from(users)
    .leftJoin(admins, eq(admins.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);

  let userId = existing?.userId ?? null;
  let adminId = existing?.adminId ?? null;

  if (!userId) {
    const [createdUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashPassword(password),
        role: 'admin',
        userPoolBalance: '0.00',
      })
      .returning({
        id: users.id,
      });

    userId = createdUser.id;
  }

  if (!adminId) {
    const [createdAdmin] = await db
      .insert(admins)
      .values({
        userId,
        displayName: 'Manual Test Admin',
        isActive: true,
        mfaEnabled: false,
      })
      .returning({
        id: admins.id,
      });

    adminId = createdAdmin.id;
  }

  for (const permissionKey of DEFAULT_ADMIN_PERMISSION_KEYS) {
    await db
      .insert(adminPermissions)
      .values({
        adminId,
        permissionKey,
      })
      .onConflictDoNothing();
  }

  return {
    adminId,
    email,
    password,
  };
};

const findAdmin = async (email: string) => {
  const [existing] = await db
    .select({
      adminId: admins.id,
      email: users.email,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);

  return existing
    ? {
        adminId: existing.adminId,
        email: existing.email,
      }
    : null;
};

const ensureTenant = async (params: {
  tenantSlug: string;
  tenantName: string;
  adminEmail: string;
  verificationSource: string;
}) => {
  const [existing] = await db
    .select({
      id: saasTenants.id,
      slug: saasTenants.slug,
      name: saasTenants.name,
    })
    .from(saasTenants)
    .where(eq(saasTenants.slug, params.tenantSlug))
    .limit(1);

  if (existing) {
    return existing;
  }

  const created = await createSaasTenant({
    slug: params.tenantSlug,
    name: params.tenantName,
    billingEmail: params.adminEmail,
    status: 'active',
    metadata: {
      seedSource: params.verificationSource,
    },
  });

  return {
    id: created.id,
    slug: created.slug,
    name: created.name,
  };
};

const findTenant = async (tenantSlug: string) => {
  const [tenant] = await db
    .select({
      id: saasTenants.id,
      slug: saasTenants.slug,
      name: saasTenants.name,
    })
    .from(saasTenants)
    .where(eq(saasTenants.slug, tenantSlug))
    .limit(1);

  return tenant ?? null;
};

const ensureTenantOwnerMembership = async (
  tenantId: number,
  adminId: number,
  verificationSource: string,
) => {
  await db
    .insert(saasTenantMemberships)
    .values({
      tenantId,
      adminId,
      role: 'tenant_owner',
      createdByAdminId: adminId,
      metadata: {
        seedSource: verificationSource,
      },
    })
    .onConflictDoNothing();
};

const ensureLiveProject = async (tenantId: number, verificationSource: string) => {
  const [existing] = await db
    .select({
      id: saasProjects.id,
      slug: saasProjects.slug,
    })
    .from(saasProjects)
    .where(
      and(
        eq(saasProjects.tenantId, tenantId),
        eq(saasProjects.slug, DEFAULT_PROJECT_SLUG),
        eq(saasProjects.environment, 'live'),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const created = await createSaasProject({
    tenantId,
    slug: DEFAULT_PROJECT_SLUG,
    name: DEFAULT_PROJECT_NAME,
    environment: 'live',
    status: 'active',
    currency: DEFAULT_CURRENCY,
    drawCost: '0.00',
    prizePoolBalance: '100.00',
    metadata: {
      seedSource: verificationSource,
    },
  });

  return {
    id: created.id,
    slug: created.slug,
  };
};

const findLiveProject = async (tenantId: number) => {
  const [project] = await db
    .select({
      id: saasProjects.id,
      slug: saasProjects.slug,
    })
    .from(saasProjects)
    .where(
      and(
        eq(saasProjects.tenantId, tenantId),
        eq(saasProjects.slug, DEFAULT_PROJECT_SLUG),
        eq(saasProjects.environment, 'live'),
      ),
    )
    .limit(1);

  return project ?? null;
};

const ensureApiKey = async (projectId: number) => {
  const [existing] = await db
    .select({
      id: saasApiKeys.id,
      label: saasApiKeys.label,
    })
    .from(saasApiKeys)
    .where(
      and(
        eq(saasApiKeys.projectId, projectId),
        eq(saasApiKeys.label, DEFAULT_API_KEY_LABEL),
      ),
    )
    .orderBy(asc(saasApiKeys.id))
    .limit(1);

  if (existing) {
    return existing;
  }

  const created = await createProjectApiKey({
    projectId,
    label: DEFAULT_API_KEY_LABEL,
    scopes: ['draw:write'],
  });

  return {
    id: created.id,
    label: created.label,
  };
};

const findApiKey = async (projectId: number) => {
  const [apiKey] = await db
    .select({
      id: saasApiKeys.id,
      label: saasApiKeys.label,
    })
    .from(saasApiKeys)
    .where(
      and(
        eq(saasApiKeys.projectId, projectId),
        eq(saasApiKeys.label, DEFAULT_API_KEY_LABEL),
      ),
    )
    .orderBy(asc(saasApiKeys.id))
    .limit(1);

  return apiKey ?? null;
};

const ensureBillingConfig = async (tenantId: number, verificationSource: string) => {
  await upsertSaasBillingAccount({
    tenantId,
    planCode: 'starter',
    baseMonthlyFee: DEFAULT_BASE_MONTHLY_FEE,
    drawFee: DEFAULT_DRAW_FEE,
    decisionPricing: DEFAULT_DECISION_PRICING,
    currency: DEFAULT_CURRENCY,
    isBillable: true,
    metadata: {
      seedSource: verificationSource,
      billingMode: 'decision_class',
    },
  });

  const [latestVersion] = await db
    .select({
      id: saasBillingAccountVersions.id,
      effectiveAt: saasBillingAccountVersions.effectiveAt,
    })
    .from(saasBillingAccountVersions)
    .where(eq(saasBillingAccountVersions.tenantId, tenantId))
    .orderBy(
      desc(saasBillingAccountVersions.effectiveAt),
      desc(saasBillingAccountVersions.id),
    )
    .limit(1);

  if (!latestVersion) {
    throw new Error('Billing account version was not created.');
  }

  return latestVersion;
};

const findLatestBillingVersion = async (tenantId: number) => {
  const [latestVersion] = await db
    .select({
      id: saasBillingAccountVersions.id,
      effectiveAt: saasBillingAccountVersions.effectiveAt,
    })
    .from(saasBillingAccountVersions)
    .where(eq(saasBillingAccountVersions.tenantId, tenantId))
    .orderBy(
      desc(saasBillingAccountVersions.effectiveAt),
      desc(saasBillingAccountVersions.id),
    )
    .limit(1);

  return latestVersion ?? null;
};

const previewCleanup = async (tenantId: number): Promise<CleanupPreview> => {
  const [billingRuns, usageEvents] = await Promise.all([
    db
      .select({
        id: saasBillingRuns.id,
      })
      .from(saasBillingRuns)
      .where(eq(saasBillingRuns.tenantId, tenantId))
      .orderBy(asc(saasBillingRuns.id)),
    db
      .select({
        id: saasUsageEvents.id,
      })
      .from(saasUsageEvents)
      .where(eq(saasUsageEvents.tenantId, tenantId))
      .orderBy(asc(saasUsageEvents.id)),
  ]);

  return {
    billingRunIds: billingRuns.map((row) => row.id),
    usageEventIds: usageEvents.map((row) => row.id),
  };
};

const cleanupVerificationData = async (tenantId: number) => {
  await db.transaction(async (tx) => {
    await tx
      .delete(saasUsageEvents)
      .where(eq(saasUsageEvents.tenantId, tenantId));

    await tx
      .delete(saasBillingRuns)
      .where(eq(saasBillingRuns.tenantId, tenantId));
  });
};

const insertVerificationUsage = async (params: {
  tenantId: number;
  projectId: number;
  apiKeyId: number;
  verificationSource: string;
}) => {
  const sampleEvents = [
    {
      decisionType: 'reject' as const,
      amount: DEFAULT_DECISION_PRICING.reject,
      scenario: 'reject-1',
    },
    {
      decisionType: 'mute' as const,
      amount: DEFAULT_DECISION_PRICING.mute,
      scenario: 'mute-1',
    },
    {
      decisionType: 'mute' as const,
      amount: DEFAULT_DECISION_PRICING.mute,
      scenario: 'mute-2',
    },
    {
      decisionType: 'payout' as const,
      amount: DEFAULT_DECISION_PRICING.payout,
      scenario: 'payout-1',
    },
  ];

  for (const sampleEvent of sampleEvents) {
    await recordPrizeEngineUsageEvent({
      tenantId: params.tenantId,
      projectId: params.projectId,
      apiKeyId: params.apiKeyId,
      environment: 'live',
      eventType: 'draw:write',
      decisionType: sampleEvent.decisionType,
      amount: sampleEvent.amount,
      currency: DEFAULT_CURRENCY,
      metadata: {
        billable: true,
        seedSource: params.verificationSource,
        scenario: sampleEvent.scenario,
      },
    });
  }

  return sampleEvents;
};

const buildVerificationContext = async (options: ReturnType<typeof readCliOptions>) => {
  const admin = await ensureAdmin(options.adminEmail, options.adminPassword);
  const tenant = await ensureTenant({
    tenantSlug: options.tenantSlug,
    tenantName: options.tenantName,
    adminEmail: options.adminEmail,
    verificationSource: options.verificationSource,
  });

  await ensureTenantOwnerMembership(
    tenant.id,
    admin.adminId,
    options.verificationSource,
  );

  const project = await ensureLiveProject(tenant.id, options.verificationSource);
  const apiKey = await ensureApiKey(project.id);
  const latestBillingVersion = await ensureBillingConfig(
    tenant.id,
    options.verificationSource,
  );

  return {
    admin,
    tenant,
    project,
    apiKey,
    latestBillingVersion,
  } satisfies VerificationContext;
};

const buildPreviewContext = async (
  options: ReturnType<typeof readCliOptions>,
): Promise<PreviewContext> => {
  const admin = await findAdmin(options.adminEmail);
  const tenant = await findTenant(options.tenantSlug);
  const project = tenant ? await findLiveProject(tenant.id) : null;
  const apiKey = project ? await findApiKey(project.id) : null;
  const latestBillingVersion = tenant
    ? await findLatestBillingVersion(tenant.id)
    : null;
  const missingResources = [
    ...(admin ? [] : ['admin']),
    ...(tenant ? [] : ['tenant']),
    ...(project ? [] : ['live_project']),
    ...(apiKey ? [] : ['api_key']),
    ...(latestBillingVersion ? [] : ['billing_version']),
  ];

  return {
    admin,
    tenant,
    project,
    apiKey,
    latestBillingVersion,
    missingResources,
  };
};

const main = async () => {
  const options = readCliOptions();

  if (!options.apply) {
    const preview = await buildPreviewContext(options);
    const cleanup = preview.tenant
      ? await previewCleanup(preview.tenant.id)
      : {
          billingRunIds: [],
          usageEventIds: [],
        };

    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          tenant: preview.tenant,
          project: preview.project,
          apiKey: preview.apiKey,
          admin: preview.admin
            ? {
                email: preview.admin.email,
              }
            : null,
          latestBillingVersion: preview.latestBillingVersion
            ? {
                id: preview.latestBillingVersion.id,
                effectiveAt: preview.latestBillingVersion.effectiveAt.toISOString(),
              }
            : null,
          missingResources: preview.missingResources,
          cleanup,
          expectedDecisionPricing: DEFAULT_DECISION_PRICING,
          expectedRun: {
            drawCount: 4,
            usageFeeAmount: '1.47',
            totalAmount: '30.47',
            decisionBreakdown: [
              {
                decisionType: 'reject',
                units: 1,
                unitAmount: '0.0200',
                totalAmount: '0.02',
              },
              {
                decisionType: 'mute',
                units: 2,
                unitAmount: '0.1000',
                totalAmount: '0.20',
              },
              {
                decisionType: 'payout',
                units: 1,
                unitAmount: '1.2500',
                totalAmount: '1.25',
              },
            ],
          },
          nextCommand: 'pnpm verify:saas-decision-billing -- --apply',
        },
        null,
        2,
      ),
    );
    return;
  }

  const context = await buildVerificationContext(options);
  const cleanup = await previewCleanup(context.tenant.id);

  await cleanupVerificationData(context.tenant.id);

  const periodStart = new Date(context.latestBillingVersion.effectiveAt.getTime() + 1);
  const insertedEvents = await insertVerificationUsage({
    tenantId: context.tenant.id,
    projectId: context.project.id,
    apiKeyId: context.apiKey.id,
    verificationSource: options.verificationSource,
  });
  const periodEnd = new Date(Date.now() + 60_000);

  const billingRun = await createBillingRun({
    tenantId: context.tenant.id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        admin: context.admin,
        tenant: context.tenant,
        project: context.project,
        apiKey: context.apiKey,
        cleanup,
        insertedEvents,
        billingRun: {
          id: billingRun.id,
          drawCount: billingRun.drawCount,
          usageFeeAmount: billingRun.usageFeeAmount,
          totalAmount: billingRun.totalAmount,
          decisionBreakdown: billingRun.decisionBreakdown,
          periodStart: billingRun.periodStart,
          periodEnd: billingRun.periodEnd,
        },
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await resetDb();
  });
