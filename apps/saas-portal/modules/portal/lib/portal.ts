import type { SaasOverview } from "@reward/shared-types/saas";

export const portalRouteOrder = [
  "overview",
  "tenants",
  "keys",
  "usage",
  "reports",
  "prizes",
  "billing",
  "docs",
] as const;

export type PortalView = (typeof portalRouteOrder)[number];

export type PortalPageSearchParams = {
  billingSetup?: string;
  invite?: string;
  project?: string;
  tenant?: string;
};

type PortalRouteMeta = {
  description: string;
  href: string;
  label: string;
  title: string;
};

export const portalRouteMeta: Record<PortalView, PortalRouteMeta> = {
  overview: {
    href: "/portal",
    label: "Overview",
    title: "Zero-friction onboarding and live portal summary",
    description:
      "Start from the provisioned sandbox path, inspect the current surface, and hand developers a working integration route immediately.",
  },
  tenants: {
    href: "/portal/tenants",
    label: "Tenants",
    title: "Tenant access, memberships, and project inventory",
    description:
      "Review the tenants attached to the signed-in operator, inspect project coverage, and track pending invite or risk-control context.",
  },
  keys: {
    href: "/portal/keys",
    label: "API keys",
    title: "Project API key self-service",
    description:
      "Issue, rotate, and revoke project-scoped prize-engine keys without leaving the tenant portal.",
  },
  usage: {
    href: "/portal/usage",
    label: "Usage",
    title: "Quota windows, metered events, and reward-engine drift",
    description:
      "Track quota pressure, recent usage, and 30-day draw distribution telemetry for the currently selected project.",
  },
  reports: {
    href: "/portal/reports",
    label: "Reports",
    title: "Tenant-scoped audit exports",
    description:
      "Queue CSV or JSON exports for usage, ledger, and risk-state history across the selected tenant time window.",
  },
  prizes: {
    href: "/portal/prizes",
    label: "Prizes",
    title: "Prize catalog operations",
    description:
      "Adjust reward amounts, stock, weights, and active state from a tenant-scoped catalog editor.",
  },
  billing: {
    href: "/portal/billing",
    label: "Billing",
    title: "Billing profile, invoices, and payment setup",
    description:
      "Inspect the billing profile, credit adjustments, invoices, and any payment actions available for the selected tenant.",
  },
  docs: {
    href: "/portal/docs",
    label: "Docs",
    title: "SDK handoff and integration bootstrap",
    description:
      "Give downstream developers the install command, base URL, and a copy-ready snippet tied to the current sandbox project.",
  },
};

export const isPortalView = (value: string): value is PortalView =>
  portalRouteOrder.includes(value as PortalView);

export const getPortalViewFromPathname = (
  pathname: string | null,
): PortalView => {
  if (!pathname || pathname === "/portal") {
    return "overview";
  }

  const normalized = pathname.replace(/\/+$/g, "");
  const segment = normalized.split("/").at(-1);
  return segment && isPortalView(segment) ? segment : "overview";
};

export const readPositiveInt = (value: string | null | undefined) => {
  const normalized =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

export type PortalHrefState = {
  billingSetupStatus?: string | null;
  inviteToken?: string | null;
  projectId?: number | null;
  tenantId?: number | null;
};

export const buildPortalHref = (
  view: PortalView,
  state: PortalHrefState = {},
) => {
  const pathname = portalRouteMeta[view].href;
  const params = new URLSearchParams();

  if (state.tenantId) {
    params.set("tenant", String(state.tenantId));
  }

  if (state.projectId) {
    params.set("project", String(state.projectId));
  }

  if (state.inviteToken) {
    params.set("invite", state.inviteToken);
  }

  if (state.billingSetupStatus) {
    params.set("billingSetup", state.billingSetupStatus);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export type PortalSelection = {
  agentControls: SaasOverview["agentControls"];
  apiKeys: SaasOverview["apiKeys"];
  currentTenantBillingDisputes: SaasOverview["disputes"];
  billingRuns: SaasOverview["billingRuns"];
  currentProject: SaasOverview["projects"][number] | null;
  currentProjectId: number | null;
  currentProjectKeys: SaasOverview["apiKeys"];
  currentProjectObservability:
    | SaasOverview["projectObservability"][number]
    | null;
  currentProjectPrizes: SaasOverview["projectPrizes"];
  currentProjectUsage: SaasOverview["recentUsage"];
  currentTenant: SaasOverview["tenants"][number] | null;
  currentTenantBillingRuns: SaasOverview["billingRuns"];
  currentTenantId: number | null;
  currentTenantInvites: SaasOverview["invites"];
  currentTenantLinks: SaasOverview["tenantLinks"];
  currentTenantMemberships: SaasOverview["memberships"];
  currentTenantTopUps: SaasOverview["topUps"];
  projects: SaasOverview["projects"];
  sandboxProject: SaasOverview["projects"][number] | null;
  sandboxProjectId: number | null;
  sandboxProjectKeys: SaasOverview["apiKeys"];
  sandboxProjectPrizes: SaasOverview["projectPrizes"];
  tenantEntries: SaasOverview["tenants"];
  tenantProjects: SaasOverview["projects"];
};

export function resolvePortalSelection(
  overview: SaasOverview | null,
  requestedTenantId: number | null,
  requestedProjectId: number | null,
): PortalSelection {
  const tenantEntries = overview?.tenants ?? [];
  const projects = overview?.projects ?? [];
  const apiKeys = overview?.apiKeys ?? [];
  const billingRuns = overview?.billingRuns ?? [];
  const topUps = overview?.topUps ?? [];
  const disputes = overview?.disputes ?? [];
  const invites = overview?.invites ?? [];
  const tenantLinks = overview?.tenantLinks ?? [];
  const agentControls = overview?.agentControls ?? [];
  const memberships = overview?.memberships ?? [];
  const recentUsage = overview?.recentUsage ?? [];
  const projectPrizes = overview?.projectPrizes ?? [];
  const projectObservability = overview?.projectObservability ?? [];

  const currentTenantId =
    requestedTenantId &&
    tenantEntries.some((item) => item.tenant.id === requestedTenantId)
      ? requestedTenantId
      : (tenantEntries[0]?.tenant.id ?? null);

  const tenantProjects = projects.filter(
    (project) => project.tenantId === currentTenantId,
  );

  const currentProjectId =
    requestedProjectId &&
    tenantProjects.some((project) => project.id === requestedProjectId)
      ? requestedProjectId
      : (tenantProjects[0]?.id ?? null);

  const currentTenant =
    tenantEntries.find((item) => item.tenant.id === currentTenantId) ?? null;
  const currentProject =
    tenantProjects.find((project) => project.id === currentProjectId) ?? null;

  const currentProjectKeys = apiKeys.filter(
    (apiKey) => apiKey.projectId === currentProjectId,
  );
  const currentProjectPrizes = projectPrizes.filter(
    (prize) => prize.projectId === currentProjectId,
  );
  const currentProjectUsage = recentUsage.filter(
    (event) => event.projectId === currentProjectId,
  );
  const currentProjectObservability =
    projectObservability.find(
      (entry) => entry.project.id === currentProjectId,
    ) ?? null;

  const currentTenantBillingRuns = billingRuns.filter(
    (run) => run.tenantId === currentTenantId,
  );
  const currentTenantTopUps = topUps.filter(
    (topUp) => topUp.tenantId === currentTenantId,
  );
  const currentTenantBillingDisputes = disputes.filter(
    (dispute) => dispute.tenantId === currentTenantId,
  );
  const currentTenantMemberships = memberships.filter(
    (membership) => membership.tenantId === currentTenantId,
  );
  const currentTenantInvites = invites.filter(
    (invite) => invite.tenantId === currentTenantId,
  );
  const currentTenantLinks = tenantLinks.filter(
    (link) =>
      link.parentTenantId === currentTenantId ||
      link.childTenantId === currentTenantId,
  );

  const currentTenantAgentControls = agentControls.filter(
    (control) => control.tenantId === currentTenantId,
  );

  const sandboxProject =
    tenantProjects.find((project) => project.environment === "sandbox") ?? null;
  const sandboxProjectId = sandboxProject?.id ?? null;
  const sandboxProjectPrizes = projectPrizes.filter(
    (prize) => prize.projectId === sandboxProjectId,
  );
  const sandboxProjectKeys = apiKeys.filter(
    (apiKey) => apiKey.projectId === sandboxProjectId && !apiKey.revokedAt,
  );

  return {
    agentControls: currentTenantAgentControls,
    apiKeys,
    currentTenantBillingDisputes,
    billingRuns,
    currentProject,
    currentProjectId,
    currentProjectKeys,
    currentProjectObservability,
    currentProjectPrizes,
    currentProjectUsage,
    currentTenant,
    currentTenantBillingRuns,
    currentTenantId,
    currentTenantInvites,
    currentTenantLinks,
    currentTenantMemberships,
    currentTenantTopUps,
    projects,
    sandboxProject,
    sandboxProjectId,
    sandboxProjectKeys,
    sandboxProjectPrizes,
    tenantEntries,
    tenantProjects,
  };
}
