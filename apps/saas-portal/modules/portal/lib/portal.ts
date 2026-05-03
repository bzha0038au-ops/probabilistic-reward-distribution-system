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

export const portalUsageSubviewOrder = ["overview", "quota"] as const;

export type PortalUsageSubview = (typeof portalUsageSubviewOrder)[number];

export const portalOverviewSubviewOrder = [
  "launcher",
  "sandbox",
  "snippet",
] as const;

export type PortalOverviewSubview =
  (typeof portalOverviewSubviewOrder)[number];

export const portalTenantsSubviewOrder = [
  "directory",
  "access",
  "invites",
  "risk",
] as const;

export type PortalTenantsSubview = (typeof portalTenantsSubviewOrder)[number];

export const portalKeysSubviewOrder = [
  "management",
  "guardrails",
  "handoff",
] as const;

export type PortalKeysSubview = (typeof portalKeysSubviewOrder)[number];

export const portalReportsSubviewOrder = ["queue", "jobs"] as const;

export type PortalReportsSubview = (typeof portalReportsSubviewOrder)[number];

export const portalDocsSubviewOrder = [
  "bootstrap",
  "handoff",
  "snippet",
] as const;

export type PortalDocsSubview = (typeof portalDocsSubviewOrder)[number];

export const portalBillingSubviewOrder = [
  "overview",
  "controls",
  "credits",
  "disputes",
] as const;

export type PortalBillingSubview =
  (typeof portalBillingSubviewOrder)[number];

export const portalPrizesSubviewOrder = [
  "catalog",
  "envelope",
  "summary",
] as const;

export type PortalPrizesSubview = (typeof portalPrizesSubviewOrder)[number];

export type PortalSubview =
  | PortalOverviewSubview
  | PortalUsageSubview
  | PortalTenantsSubview
  | PortalKeysSubview
  | PortalReportsSubview
  | PortalDocsSubview
  | PortalBillingSubview
  | PortalPrizesSubview;

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
  shortLabel: string;
  title: string;
};

type PortalUsageSubviewMeta = {
  description: string;
  label: string;
  navLabel: string;
  segment: string | null;
  title: string;
};

export const portalRouteMeta: Record<PortalView, PortalRouteMeta> = {
  overview: {
    href: "/portal",
    label: "Overview",
    shortLabel: "Overview",
    title: "Zero-friction onboarding and live portal summary",
    description:
      "Start from the provisioned sandbox path, inspect the current surface, and hand developers a working integration route immediately.",
  },
  tenants: {
    href: "/portal/tenants",
    label: "Tenants",
    shortLabel: "Tenants",
    title: "Tenant access, memberships, and project inventory",
    description:
      "Review the tenants attached to the signed-in operator, inspect project coverage, and track pending invite or risk-control context.",
  },
  keys: {
    href: "/portal/keys",
    label: "API keys",
    shortLabel: "Keys",
    title: "Project API key self-service",
    description:
      "Issue, rotate, and revoke project-scoped prize-engine keys without leaving the tenant portal.",
  },
  usage: {
    href: "/portal/usage",
    label: "Usage",
    shortLabel: "Usage",
    title: "Quota windows, metered events, and reward-engine drift",
    description:
      "Track quota pressure, recent usage, and 30-day draw distribution telemetry for the currently selected project.",
  },
  reports: {
    href: "/portal/reports",
    label: "Reports",
    shortLabel: "Reports",
    title: "Tenant-scoped audit exports",
    description:
      "Queue CSV or JSON exports for usage, ledger, and risk-state history across the selected tenant time window.",
  },
  prizes: {
    href: "/portal/prizes",
    label: "Prizes",
    shortLabel: "Prizes",
    title: "Prize catalog operations",
    description:
      "Adjust reward amounts, stock, weights, and active state from a tenant-scoped catalog editor.",
  },
  billing: {
    href: "/portal/billing",
    label: "Billing",
    shortLabel: "Billing",
    title: "Billing profile, invoices, and payment setup",
    description:
      "Inspect the billing profile, credit adjustments, invoices, and any payment actions available for the selected tenant.",
  },
  docs: {
    href: "/portal/docs",
    label: "Docs",
    shortLabel: "Docs",
    title: "SDK handoff and integration bootstrap",
    description:
      "Give downstream developers the install command, base URL, and a copy-ready snippet tied to the current sandbox project.",
  },
};

export const portalUsageSubviewMeta: Record<
  PortalUsageSubview,
  PortalUsageSubviewMeta
> = {
  overview: {
    label: "Usage",
    navLabel: "Quota check",
    segment: null,
    title: "Usage and quota",
    description:
      "Read current aggregate quota pressure from active keys and inspect the latest metered events.",
  },
  quota: {
    label: "30-day draw",
    navLabel: "30d drift",
    segment: "quota",
    title: "30-day draw observability",
    description:
      "Project-level draw distribution, payout drift, and player concentration from the aggregated overview payload.",
  },
};

export const portalOverviewSubviewMeta: Record<
  PortalOverviewSubview,
  PortalUsageSubviewMeta
> = {
  launcher: {
    label: "Launcher",
    navLabel: "Choose task",
    segment: null,
    title: "Portal task launcher",
    description:
      "Choose the single portal workflow you want to work on next instead of stacking multiple control surfaces on the landing page.",
  },
  sandbox: {
    label: "Sandbox",
    navLabel: "Prep sandbox",
    segment: "sandbox",
    title: "Sandbox onboarding",
    description:
      "Prepare the provisioned sandbox project, check readiness, and issue the first starter key for the current tenant.",
  },
  snippet: {
    label: "Snippet",
    navLabel: "Copy snippet",
    segment: "snippet",
    title: "Copy-and-run integration snippet",
    description:
      "Hand off one runnable SDK snippet tied to the selected sandbox project and current key state.",
  },
};

export const portalTenantsSubviewMeta: Record<
  PortalTenantsSubview,
  PortalUsageSubviewMeta
> = {
  directory: {
    label: "Directory",
    navLabel: "Browse tenants",
    segment: null,
    title: "Tenant directory",
    description:
      "Review the tenants attached to the signed-in operator and move scope to the one you want to work inside.",
  },
  access: {
    label: "Access",
    navLabel: "Manage access",
    segment: "access",
    title: "Membership and project inventory",
    description:
      "Manage operator memberships and inspect the project inventory exposed by the selected tenant.",
  },
  invites: {
    label: "Invites",
    navLabel: "Send invites",
    segment: "invites",
    title: "Pending invites",
    description:
      "Send new tenant invites, copy the latest invite link, and review invite expiry or pending delivery state.",
  },
  risk: {
    label: "Risk",
    navLabel: "Review risk",
    segment: "risk",
    title: "Risk and tenant links",
    description:
      "Read the overview-exposed agent controls and tenant link relationships before modifying project scope.",
  },
};

export const portalKeysSubviewMeta: Record<
  PortalKeysSubview,
  PortalUsageSubviewMeta
> = {
  management: {
    label: "Management",
    navLabel: "Issue keys",
    segment: null,
    title: "API key management",
    description:
      "Generate, rotate, and revoke project-scoped keys without entering the internal admin plane.",
  },
  guardrails: {
    label: "Guardrails",
    navLabel: "Read limits",
    segment: "guardrails",
    title: "Current project guardrails",
    description:
      "Read the active quota windows before handing the key to an integrator or automation worker.",
  },
  handoff: {
    label: "Handoff",
    navLabel: "Share handoff",
    segment: "handoff",
    title: "Key handoff notes",
    description:
      "Keep project-scoped secrets aligned to the selected environment and deployment workflow before sharing them downstream.",
  },
};

export const portalReportsSubviewMeta: Record<
  PortalReportsSubview,
  PortalUsageSubviewMeta
> = {
  queue: {
    label: "Queue export",
    navLabel: "Queue export",
    segment: null,
    title: "Queue audit export",
    description:
      "Generate tenant-scoped CSV or JSON exports for compliance reviews and scoped operational checks.",
  },
  jobs: {
    label: "Recent jobs",
    navLabel: "View jobs",
    segment: "jobs",
    title: "Recent export jobs",
    description:
      "Track pending jobs, inspect export status, and mint a fresh signed link once processing completes.",
  },
};

export const portalDocsSubviewMeta: Record<
  PortalDocsSubview,
  PortalUsageSubviewMeta
> = {
  bootstrap: {
    label: "Bootstrap",
    navLabel: "Bootstrap",
    segment: null,
    title: "Sandbox bootstrap",
    description:
      "Keep the first integration loop inside the tenant portal and prepare the current sandbox project for handoff.",
  },
  handoff: {
    label: "SDK handoff",
    navLabel: "SDK handoff",
    segment: "handoff",
    title: "Docs and SDK handoff",
    description:
      "Give developers a working install command, base URL, and first request without redirecting into internal tooling.",
  },
  snippet: {
    label: "Snippet",
    navLabel: "Run snippet",
    segment: "snippet",
    title: "Copy-and-run sandbox snippet",
    description:
      "Use the currently selected sandbox project and latest key state to hand off a runnable integration snippet.",
  },
};

export const portalBillingSubviewMeta: Record<
  PortalBillingSubview,
  PortalUsageSubviewMeta
> = {
  overview: {
    label: "Overview",
    navLabel: "Spend view",
    segment: null,
    title: "Billing, forecast, and invoices",
    description:
      "Inspect billing profile, spend forecasts, invoice runs, and environment-specific payment actions for the selected tenant.",
  },
  controls: {
    label: "Controls",
    navLabel: "Budget caps",
    segment: "controls",
    title: "Budget controls",
    description:
      "Configure budget targets, alert thresholds, webhook destinations, and hard caps for the selected tenant.",
  },
  credits: {
    label: "Credits",
    navLabel: "Credits",
    segment: "credits",
    title: "Credit adjustments",
    description:
      "Review the recent credit adjustments or top-up history that affects the tenant billing budget.",
  },
  disputes: {
    label: "Disputes",
    navLabel: "Disputes",
    segment: "disputes",
    title: "Billing disputes",
    description:
      "Submit invoice disputes and review refund or resolution history from the tenant-scoped billing record.",
  },
};

export const portalPrizesSubviewMeta: Record<
  PortalPrizesSubview,
  PortalUsageSubviewMeta
> = {
  catalog: {
    label: "Catalog",
    navLabel: "Edit catalog",
    segment: null,
    title: "Prize catalog editor",
    description:
      "Create, update, archive, and rebalance prizes inside the selected project catalog.",
  },
  envelope: {
    label: "Envelope",
    navLabel: "Reward cap",
    segment: "envelope",
    title: "Project reward envelope",
    description:
      "Inspect project strategy, pool balance, draw cap, and miss-weight context while tuning the catalog.",
  },
  summary: {
    label: "Summary",
    navLabel: "View counts",
    segment: "summary",
    title: "Catalog summary",
    description:
      "Read fast counts for active and total prizes in the currently selected project catalog.",
  },
};

export const isPortalView = (value: string): value is PortalView =>
  portalRouteOrder.includes(value as PortalView);

export const isPortalUsageSubview = (
  value: string,
): value is PortalUsageSubview =>
  portalUsageSubviewOrder.includes(value as PortalUsageSubview);

export const isPortalOverviewSubview = (
  value: string,
): value is PortalOverviewSubview =>
  portalOverviewSubviewOrder.includes(value as PortalOverviewSubview);

export const isPortalTenantsSubview = (
  value: string,
): value is PortalTenantsSubview =>
  portalTenantsSubviewOrder.includes(value as PortalTenantsSubview);

export const isPortalKeysSubview = (
  value: string,
): value is PortalKeysSubview =>
  portalKeysSubviewOrder.includes(value as PortalKeysSubview);

export const isPortalReportsSubview = (
  value: string,
): value is PortalReportsSubview =>
  portalReportsSubviewOrder.includes(value as PortalReportsSubview);

export const isPortalDocsSubview = (
  value: string,
): value is PortalDocsSubview =>
  portalDocsSubviewOrder.includes(value as PortalDocsSubview);

export const isPortalBillingSubview = (
  value: string,
): value is PortalBillingSubview =>
  portalBillingSubviewOrder.includes(value as PortalBillingSubview);

export const isPortalPrizesSubview = (
  value: string,
): value is PortalPrizesSubview =>
  portalPrizesSubviewOrder.includes(value as PortalPrizesSubview);

export const getPortalViewFromPathname = (
  pathname: string | null,
): PortalView => {
  if (!pathname || pathname === "/portal") {
    return "overview";
  }

  const segments = pathname.replace(/\/+$/g, "").split("/").filter(Boolean);
  const view = segments[1];
  return view && isPortalView(view) ? view : "overview";
};

export const getPortalUsageSubviewFromPathname = (
  pathname: string | null,
): PortalUsageSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "usage") {
    return "overview";
  }

  const subview = segments[2];
  return subview && isPortalUsageSubview(subview) ? subview : "overview";
};

export const getPortalOverviewSubviewFromPathname = (
  pathname: string | null,
): PortalOverviewSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "overview") {
    return "launcher";
  }

  const subview = segments[2];
  return subview && isPortalOverviewSubview(subview) ? subview : "launcher";
};

export const getPortalTenantsSubviewFromPathname = (
  pathname: string | null,
): PortalTenantsSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "tenants") {
    return "directory";
  }

  const subview = segments[2];
  return subview && isPortalTenantsSubview(subview) ? subview : "directory";
};

export const getPortalKeysSubviewFromPathname = (
  pathname: string | null,
): PortalKeysSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "keys") {
    return "management";
  }

  const subview = segments[2];
  return subview && isPortalKeysSubview(subview) ? subview : "management";
};

export const getPortalReportsSubviewFromPathname = (
  pathname: string | null,
): PortalReportsSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "reports") {
    return "queue";
  }

  const subview = segments[2];
  return subview && isPortalReportsSubview(subview) ? subview : "queue";
};

export const getPortalDocsSubviewFromPathname = (
  pathname: string | null,
): PortalDocsSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "docs") {
    return "bootstrap";
  }

  const subview = segments[2];
  return subview && isPortalDocsSubview(subview) ? subview : "bootstrap";
};

export const getPortalBillingSubviewFromPathname = (
  pathname: string | null,
): PortalBillingSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "billing") {
    return "overview";
  }

  const subview = segments[2];
  return subview && isPortalBillingSubview(subview) ? subview : "overview";
};

export const getPortalPrizesSubviewFromPathname = (
  pathname: string | null,
): PortalPrizesSubview => {
  const segments = pathname?.replace(/\/+$/g, "").split("/").filter(Boolean);

  if (!segments || segments[1] !== "prizes") {
    return "catalog";
  }

  const subview = segments[2];
  return subview && isPortalPrizesSubview(subview) ? subview : "catalog";
};

export const isPortalSubviewForView = (
  view: PortalView,
  subview: string,
): subview is PortalSubview => {
  if (view === "overview") {
    return isPortalOverviewSubview(subview);
  }

  if (view === "tenants") {
    return isPortalTenantsSubview(subview);
  }

  if (view === "keys") {
    return isPortalKeysSubview(subview);
  }

  if (view === "usage") {
    return isPortalUsageSubview(subview);
  }

  if (view === "reports") {
    return isPortalReportsSubview(subview);
  }

  if (view === "docs") {
    return isPortalDocsSubview(subview);
  }

  if (view === "billing") {
    return isPortalBillingSubview(subview);
  }

  if (view === "prizes") {
    return isPortalPrizesSubview(subview);
  }

  return false;
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
  return buildPortalRouteHref(view, null, state);
};

export const buildPortalRouteHref = (
  view: PortalView,
  subview: PortalSubview | null,
  state: PortalHrefState = {},
) => {
  const pathname =
    view === "overview" &&
    subview &&
    isPortalOverviewSubview(subview) &&
    subview !== "launcher"
      ? `/portal/overview/${portalOverviewSubviewMeta[subview].segment}`
      : view === "tenants" &&
          subview &&
          isPortalTenantsSubview(subview) &&
          subview !== "directory"
      ? `/portal/tenants/${portalTenantsSubviewMeta[subview].segment}`
      : view === "keys" &&
          subview &&
          isPortalKeysSubview(subview) &&
          subview !== "management"
      ? `/portal/keys/${portalKeysSubviewMeta[subview].segment}`
      : view === "usage" &&
          subview &&
          isPortalUsageSubview(subview) &&
          subview !== "overview"
      ? `/portal/usage/${portalUsageSubviewMeta[subview].segment}`
      : view === "reports" &&
          subview &&
          isPortalReportsSubview(subview) &&
          subview !== "queue"
        ? `/portal/reports/${portalReportsSubviewMeta[subview].segment}`
        : view === "docs" &&
            subview &&
            isPortalDocsSubview(subview) &&
            subview !== "bootstrap"
          ? `/portal/docs/${portalDocsSubviewMeta[subview].segment}`
          : view === "billing" &&
              subview &&
              isPortalBillingSubview(subview) &&
              subview !== "overview"
            ? `/portal/billing/${portalBillingSubviewMeta[subview].segment}`
            : view === "prizes" &&
                subview &&
                isPortalPrizesSubview(subview) &&
                subview !== "catalog"
              ? `/portal/prizes/${portalPrizesSubviewMeta[subview].segment}`
        : portalRouteMeta[view].href;
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
