import "dotenv/config";

import { and, eq } from "drizzle-orm";

import {
  admins,
  saasProjects,
  saasTenantMemberships,
  saasTenants,
  users,
} from "@reward/database";
import { db } from "../src/db";
import { toSaasAdminActor } from "../src/modules/saas/records";
import { createSaasProject, createSaasTenant } from "../src/modules/saas/service";

const ADMIN_EMAIL = "admin.manual@example.com";

const DEMO_TENANTS = [
  {
    slug: "portal-demo-alpha",
    name: "Portal Demo Alpha",
    projects: [
      {
        slug: "agent-staging",
        name: "Agent Staging",
      },
    ],
  },
  {
    slug: "portal-demo-beta",
    name: "Portal Demo Beta",
    projects: [],
  },
] as const;

const DEMO_METADATA = {
  seedSource: "saas_portal_demo",
} as const;

type DemoProjectSpec = (typeof DEMO_TENANTS)[number]["projects"][number];

const resolveManualAdmin = async () => {
  const [admin] = await db
    .select({
      adminId: admins.id,
      email: users.email,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (!admin) {
    throw new Error(
      `Missing ${ADMIN_EMAIL}. Run "pnpm db:seed:manual" before seeding SaaS portal demo data.`,
    );
  }

  return admin;
};

const ensureTenant = async (slug: string, name: string) => {
  const [existing] = await db
    .select({
      id: saasTenants.id,
      slug: saasTenants.slug,
      name: saasTenants.name,
    })
    .from(saasTenants)
    .where(eq(saasTenants.slug, slug))
    .limit(1);

  if (existing) {
    return { tenant: existing, created: false };
  }

  const created = await createSaasTenant({
    slug,
    name,
    billingEmail: ADMIN_EMAIL,
    status: "active",
    metadata: DEMO_METADATA,
  });

  return {
    tenant: {
      id: created.id,
      slug: created.slug,
      name: created.name,
    },
    created: true,
  };
};

const ensureTenantOwnerMembership = async (tenantId: number, adminId: number) => {
  const [existing] = await db
    .select({
      id: saasTenantMemberships.id,
      role: saasTenantMemberships.role,
    })
    .from(saasTenantMemberships)
    .where(
      and(
        eq(saasTenantMemberships.tenantId, tenantId),
        eq(saasTenantMemberships.adminId, adminId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(saasTenantMemberships).values({
      tenantId,
      adminId,
      role: "tenant_owner",
      createdByAdminId: adminId,
      metadata: DEMO_METADATA,
    });

    return { created: true, updated: false };
  }

  if (existing.role !== "tenant_owner") {
    await db
      .update(saasTenantMemberships)
      .set({
        role: "tenant_owner",
        createdByAdminId: adminId,
        metadata: DEMO_METADATA,
        updatedAt: new Date(),
      })
      .where(eq(saasTenantMemberships.id, existing.id));

    return { created: false, updated: true };
  }

  return { created: false, updated: false };
};

const ensureSandboxProject = async (
  tenantId: number,
  project: DemoProjectSpec,
  adminId: number,
) => {
  const [existing] = await db
    .select({
      id: saasProjects.id,
      slug: saasProjects.slug,
      name: saasProjects.name,
    })
    .from(saasProjects)
    .where(
      and(
        eq(saasProjects.tenantId, tenantId),
        eq(saasProjects.slug, project.slug),
        eq(saasProjects.environment, "sandbox"),
      ),
    )
    .limit(1);

  if (existing) {
    return { project: existing, created: false };
  }

  const created = await createSaasProject(
    {
      tenantId,
      slug: project.slug,
      name: project.name,
      environment: "sandbox",
      status: "active",
      currency: "USD",
      drawCost: "0.00",
      prizePoolBalance: "250.00",
      metadata: DEMO_METADATA,
    },
    toSaasAdminActor(adminId, undefined, "membership"),
  );

  return {
    project: {
      id: created.id,
      slug: created.slug,
      name: created.name,
    },
    created: true,
  };
};

const main = async () => {
  const admin = await resolveManualAdmin();
  const seededTenants: Array<{
    slug: string;
    name: string;
    created: boolean;
    projects: Array<{ slug: string; created: boolean }>;
  }> = [];

  for (const tenantSpec of DEMO_TENANTS) {
    const ensuredTenant = await ensureTenant(tenantSpec.slug, tenantSpec.name);
    await ensureTenantOwnerMembership(ensuredTenant.tenant.id, admin.adminId);

    const projects = [] as Array<{ slug: string; created: boolean }>;
    for (const project of tenantSpec.projects) {
      const ensuredProject = await ensureSandboxProject(
        ensuredTenant.tenant.id,
        project,
        admin.adminId,
      );
      projects.push({
        slug: ensuredProject.project.slug,
        created: ensuredProject.created,
      });
    }

    seededTenants.push({
      slug: ensuredTenant.tenant.slug,
      name: ensuredTenant.tenant.name,
      created: ensuredTenant.created,
      projects,
    });
  }

  console.log("SaaS portal demo seed ensured.");
  console.log(`Portal login: ${ADMIN_EMAIL} / Admin123!`);
  console.log("Run portal with: pnpm dev:saas-portal");
  console.log(JSON.stringify({ tenants: seededTenants }, null, 2));
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
