"use client";

import Link from "next/link";
import { useEffect, useTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  SaasApiKey,
  SaasApiKeyIssue,
  SaasApiKeyRotation,
  SaasOverview,
  SaasPortalTenantRegistration,
  SaasProjectPrize,
  SaasReportExportJob,
  SaasTenantBillingInsights,
  SaasTenantInvite,
  SaasTenantInviteDelivery,
  SaasTenantMembership,
} from "@reward/shared-types/saas";
import {
  defaultSaasOverviewUiCopy,
  saasTenantRoleValues,
} from "@reward/shared-types/saas";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildLegalPath, buildLoginPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  buildPortalHref,
  portalRouteMeta,
  portalRouteOrder,
  resolvePortalSelection,
  type PortalView,
} from "@/modules/portal/lib/portal";

type PortalDashboardProps = {
  billingSetupStatus: string | null;
  billingInsights: SaasTenantBillingInsights | null;
  error: string | null;
  inviteToken: string | null;
  overview: SaasOverview | null;
  reportExports: SaasReportExportJob[] | null;
  reportsError: string | null;
  requestedProjectId: number | null;
  requestedTenantId: number | null;
  view: PortalView;
};

type MutationBanner = {
  tone: "success" | "error";
  message: string;
} | null;

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

const API_KEY_SCOPE_OPTIONS = [
  "catalog:read",
  "fairness:read",
  "reward:write",
  "ledger:read",
] as const;

const REPORT_RESOURCE_OPTIONS = [
  {
    value: "saas_usage_events",
    label: "Usage events",
    description: "Metered reward-engine requests, units, and billing context.",
  },
  {
    value: "saas_ledger_entries",
    label: "Ledger entries",
    description: "Player balance mutations, reference ids, and payout history.",
  },
  {
    value: "agent_risk_state",
    label: "Risk state",
    description:
      "Current agent risk records updated during the selected window.",
  },
] as const;

const REPORT_FORMAT_OPTIONS = [
  {
    value: "csv",
    label: "CSV",
    description: "Spreadsheet-friendly flat export for auditors.",
  },
  {
    value: "json",
    label: "JSON",
    description:
      "Structured export with metadata and nested payloads preserved.",
  },
] as const;

const TENANT_ROLE_LABELS = {
  tenant_owner: "Tenant owner",
  tenant_operator: "Tenant operator",
  agent_manager: "Agent manager",
  agent_viewer: "Agent viewer",
} as const;

const TENANT_ROLE_DESCRIPTIONS = {
  tenant_owner: "Full tenant access, including members and billing controls.",
  tenant_operator: "Project, prize, and key operations without member writes.",
  agent_manager: "Operational agent access plus billing controls.",
  agent_viewer: "Read-only visibility into tenant activity.",
} as const;

const toDateTimeInputValue = (value: Date) => {
  const timezoneOffsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
};

type SnippetLanguage = "typescript" | "python";

const ENGINE_BASE_URL =
  process.env.NEXT_PUBLIC_ENGINE_BASE_URL ?? "http://localhost:4000";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
};

const getDefaultReportFromAt = () =>
  toDateTimeInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

const getDefaultReportToAt = () => toDateTimeInputValue(new Date());

const parseDateTimeInputToIso = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const getReportStatusTone = (status: SaasReportExportJob["status"]) => {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }

  if (status === "failed") {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }

  if (status === "processing") {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const formatWindow = (payload?: {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string | Date | null;
}) => {
  if (!payload) {
    return "—";
  }

  return `${payload.used}/${payload.limit} used · ${payload.remaining} left · resets ${formatDate(payload.resetAt)}`;
};

const formatPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
};

const formatPlainPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
};

const formatSignedDelta = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  const scaled = value * 100;
  return `${scaled >= 0 ? "+" : ""}${scaled.toFixed(1)} pts`;
};

const getDistributionBarWidth = (value: number) =>
  `${Math.max(8, Math.min(100, value * 100)).toFixed(1)}%`;

const buildSandboxTypeScriptSnippet = (payload: {
  apiKey: string | null;
  projectSlug: string | null;
}) => {
  const apiKey = payload.apiKey ?? "paste-your-sandbox-key";
  const projectSlug = payload.projectSlug ?? "sandbox-project";
  const agentId = `${projectSlug}-hello-agent`;

  return `import {
  createPrizeEngineClient,
  createPrizeEngineIdempotencyKey,
} from "@reward/prize-engine-sdk";

const apiKey = ${JSON.stringify(apiKey)};
const agentId = ${JSON.stringify(agentId)};
const client = createPrizeEngineClient({
  getApiKey: () => apiKey,
  environment: "sandbox",
  baseUrl: "${ENGINE_BASE_URL}",
});

const overview = await client.getOverview();
if (!overview.ok) {
  throw new Error(overview.error?.message ?? "Overview failed");
}

const reward = await client.reward({
  agent: {
    agentId,
    groupId: "hello-reward-demo",
    metadata: { source: "hello-reward" },
  },
  behavior: {
    actionType: "hello_reward_demo",
    score: 0.92,
    context: { source: "hello-reward" },
  },
  idempotencyKey: createPrizeEngineIdempotencyKey(),
  clientNonce: "hello-reward-portal",
});
if (!reward.ok) {
  throw new Error(reward.error?.message ?? "Reward failed");
}

const ledger = await client.getLedger(agentId);
if (!ledger.ok) {
  throw new Error(ledger.error?.message ?? "Ledger failed");
}

console.log("project", overview.data.project);
console.log("reward", reward.data.result);
console.log("ledger", ledger.data);`;
};

const buildSandboxPythonSnippet = (payload: {
  apiKey: string | null;
  projectSlug: string | null;
}) => {
  const apiKey = payload.apiKey ?? "paste-your-sandbox-key";
  const projectSlug = payload.projectSlug ?? "sandbox-project";
  const agentId = `${projectSlug}-hello-agent`;

  return `from prize_engine_sdk import PrizeEngineClient, create_idempotency_key

api_key = ${JSON.stringify(apiKey)}
agent_id = ${JSON.stringify(agentId)}

client = PrizeEngineClient(
    base_url=${JSON.stringify(ENGINE_BASE_URL)},
    environment="sandbox",
    api_key=api_key,
)

overview = client.get_overview()
if not overview.get("ok"):
    raise RuntimeError(overview.get("error", {}).get("message", "Overview failed"))

reward = client.reward(
    {
        "agent": {
            "agentId": agent_id,
            "groupId": "hello-reward-demo",
            "metadata": {"source": "hello-reward"},
        },
        "behavior": {
            "actionType": "hello_reward_demo",
            "score": 0.92,
            "context": {"source": "hello-reward"},
        },
        "idempotencyKey": create_idempotency_key(),
        "clientNonce": "hello-reward-portal",
    }
)
if not reward.get("ok"):
    raise RuntimeError(reward.get("error", {}).get("message", "Reward failed"))

ledger = client.get_ledger(agent_id)
if not ledger.get("ok"):
    raise RuntimeError(ledger.get("error", {}).get("message", "Ledger failed"))

print("project", overview["data"]["project"])
print("reward", reward["data"]["result"])
print("ledger", ledger["data"])`;
};

const getDriftTone = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "text-slate-500";
  }

  if (Math.abs(value) >= 0.1) {
    return "text-rose-700";
  }

  if (Math.abs(value) >= 0.03) {
    return "text-amber-700";
  }

  return "text-emerald-700";
};

export function PortalDashboard({
  billingSetupStatus,
  billingInsights,
  error,
  inviteToken,
  overview,
  reportExports,
  reportsError,
  requestedProjectId,
  requestedTenantId,
  view,
}: PortalDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<MutationBanner>(null);
  const [issuedKey, setIssuedKey] = useState<SaasApiKeyIssue | null>(null);
  const [rotatedKey, setRotatedKey] = useState<SaasApiKeyRotation | null>(null);
  const [createdInvite, setCreatedInvite] =
    useState<SaasTenantInviteDelivery | null>(null);
  const [snippetLanguage, setSnippetLanguage] =
    useState<SnippetLanguage>("typescript");
  const [isPending, startTransition] = useTransition();

  const {
    agentControls,
    currentProject,
    currentProjectId,
    currentProjectKeys,
    currentProjectObservability,
    currentProjectPrizes,
    currentProjectUsage,
    currentTenant,
    currentTenantBillingDisputes,
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
  } = resolvePortalSelection(overview, requestedTenantId, requestedProjectId);
  const overviewUiCopy = overview?.uiCopy.overview ?? defaultSaasOverviewUiCopy.overview;

  const visibleReportExports = reportExports ?? [];
  const hasPendingReportExports = visibleReportExports.some(
    (job) => job.status === "pending" || job.status === "processing",
  );

  const latestSandboxSecret =
    issuedKey?.projectId === sandboxProjectId
      ? issuedKey.apiKey
      : rotatedKey?.issuedKey.projectId === sandboxProjectId
        ? rotatedKey.issuedKey.apiKey
        : null;

  const sandboxSnippets = {
    typescript: buildSandboxTypeScriptSnippet({
      apiKey: latestSandboxSecret,
      projectSlug: sandboxProject?.slug ?? null,
    }),
    python: buildSandboxPythonSnippet({
      apiKey: latestSandboxSecret,
      projectSlug: sandboxProject?.slug ?? null,
    }),
  } as const;
  const sandboxSnippet = sandboxSnippets[snippetLanguage];
  const snippetBootstrap =
    snippetLanguage === "typescript"
      ? "pnpm add @reward/prize-engine-sdk"
      : "from prize_engine_sdk import PrizeEngineClient, create_idempotency_key";

  const renderSnippetLanguagePicker = () => (
    <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/80 p-1">
      {(
        [
          ["typescript", "TypeScript"],
          ["python", "Python"],
        ] as const
      ).map(([language, label]) => (
        <button
          key={language}
          type="button"
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            snippetLanguage === language
              ? "bg-white text-slate-950"
              : "text-slate-300 hover:text-white",
          )}
          onClick={() => {
            setSnippetLanguage(language);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const currentHrefState = {
    billingSetupStatus,
    inviteToken,
    projectId: currentProjectId,
    tenantId: currentTenantId,
  };
  const currentRoute = (() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();

  useEffect(() => {
    if (view !== "reports" || !hasPendingReportExports) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 5_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasPendingReportExports, router, startTransition, view]);

  const currentViewMeta = portalRouteMeta[view];
  const currentBudgetPolicy = currentTenant?.billing?.budgetPolicy ?? null;
  const billingCurrency =
    billingInsights?.currency ?? currentTenant?.billing?.currency ?? "USD";

  const refreshOverview = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const navigateWithScope = (
    nextTenantId: number | null,
    nextProjectId: number | null,
  ) => {
    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          ...currentHrefState,
          projectId: nextProjectId,
          tenantId: nextTenantId,
        }),
      );
    });
  };

  const readEnvelope = async <T,>(
    response: Response,
  ): Promise<ApiEnvelope<T> | null> =>
    (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  const setErrorBanner = (message: string) => {
    setBanner({ tone: "error", message });
  };

  const setSuccessBanner = (message: string) => {
    setBanner({ tone: "success", message });
  };

  const redirectForAccessError = (code?: string, status?: number) => {
    if (code === API_ERROR_CODES.LEGAL_ACCEPTANCE_REQUIRED) {
      startTransition(() => {
        router.replace(buildLegalPath(currentRoute));
      });
      return true;
    }

    if (code === API_ERROR_CODES.UNAUTHORIZED || status === 401) {
      window.location.assign(buildLoginPath(currentRoute));
      return true;
    }

    return false;
  };

  const postJson = async <T,>(
    path: string,
    body: Record<string, unknown>,
    successMessage?: string,
  ) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    if (successMessage) {
      setSuccessBanner(successMessage);
    }

    return payload.data;
  };

  const patchJson = async <T,>(
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    setSuccessBanner(successMessage);
    return payload.data;
  };

  const deleteRequest = async <T,>(path: string, successMessage: string) => {
    setBanner(null);

    const response = await fetch(`/api/backend${path}`, {
      method: "DELETE",
    });
    const payload = await readEnvelope<T>(response);
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && payload.ok === false ? payload.error?.code : undefined;
      if (redirectForAccessError(code, response.status)) {
        return null;
      }
      const message =
        payload && payload.ok === false
          ? (payload.error?.message ?? "Request failed.")
          : "Request failed.";
      setErrorBanner(message);
      return null;
    }

    setSuccessBanner(successMessage);
    return payload.data;
  };

  const handleAcceptInvite = async () => {
    if (!inviteToken) {
      return;
    }

    const result = await postJson(
      "/portal/saas/invites/accept",
      {
        token: inviteToken,
      },
      "Tenant invite accepted.",
    );
    if (!result) {
      return;
    }

    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          billingSetupStatus,
          projectId: currentProjectId,
          tenantId: currentTenantId,
        }),
      );
      router.refresh();
    });
  };

  const handleCreateTenant = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const billingEmail = String(formData.get("billingEmail") ?? "").trim();

    const result = await postJson<SaasPortalTenantRegistration>(
      "/portal/saas/tenants",
      {
        name,
        ...(billingEmail ? { billingEmail } : {}),
      },
      "Workspace created. Your sandbox starter key is ready.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result.issuedKey);
    setRotatedKey(null);
    setCreatedInvite(null);
    form.reset();
    startTransition(() => {
      router.replace(
        buildPortalHref("overview", {
          billingSetupStatus,
          tenantId: result.tenant.id,
          projectId: result.tenant.bootstrap.sandboxProject.id,
        }),
      );
      router.refresh();
    });
  };

  const handleSaveMembership = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before saving a membership.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const adminEmail = String(formData.get("adminEmail") ?? "").trim();
    const role = String(formData.get("role") ?? "tenant_operator").trim();

    const result = await postJson<SaasTenantMembership>(
      `/portal/saas/tenants/${currentTenantId}/memberships`,
      {
        adminEmail,
        role,
      },
      "Tenant membership saved.",
    );
    if (!result) {
      return;
    }

    setCreatedInvite(null);
    form.reset();
    refreshOverview();
  };

  const handleDeleteMembership = async (membership: SaasTenantMembership) => {
    if (!currentTenantId) {
      return;
    }

    const result = await deleteRequest<SaasTenantMembership>(
      `/portal/saas/tenants/${currentTenantId}/memberships/${membership.id}`,
      `Removed ${
        membership.adminDisplayName ?? membership.adminEmail ?? "operator"
      } from tenant access.`,
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleCreateTenantInvite = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before sending an invite.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "tenant_operator").trim();

    const result = await postJson<SaasTenantInviteDelivery>(
      `/portal/saas/tenants/${currentTenantId}/invites`,
      {
        email,
        role,
      },
      "Tenant invite sent.",
    );
    if (!result) {
      return;
    }

    setCreatedInvite(result);
    form.reset();
    refreshOverview();
  };

  const handleRevokeInvite = async (invite: SaasTenantInvite) => {
    if (!currentTenantId) {
      return;
    }

    const result = await postJson<SaasTenantInvite>(
      `/portal/saas/tenants/${currentTenantId}/invites/${invite.id}/revoke`,
      {},
      `Revoked invite for ${invite.email}.`,
    );
    if (!result) {
      return;
    }

    if (createdInvite?.invite.id === invite.id) {
      setCreatedInvite(null);
    }
    refreshOverview();
  };

  const handleIssueKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProjectId) {
      setErrorBanner("Select a project before issuing a key.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const label = String(formData.get("label") ?? "").trim();
    const scopes = formData
      .getAll("scopes")
      .map((value) => String(value))
      .filter(Boolean);
    const expiresAt = String(formData.get("expiresAt") ?? "").trim();

    const result = await postJson<SaasApiKeyIssue>(
      `/portal/saas/projects/${currentProjectId}/keys`,
      {
        label,
        scopes,
        ...(expiresAt ? { expiresAt } : {}),
      },
      "API key issued.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result);
    setRotatedKey(null);
    form.reset();
    refreshOverview();
  };

  const handleSelectSandboxProject = () => {
    if (!sandboxProjectId) {
      setErrorBanner("This tenant does not have a sandbox project yet.");
      return;
    }

    navigateWithScope(currentTenantId, sandboxProjectId);
    setSuccessBanner("Sandbox project selected.");
  };

  const handleIssueSandboxStarterKey = async () => {
    if (!sandboxProjectId || !sandboxProject) {
      setErrorBanner("This tenant does not have a sandbox project yet.");
      return;
    }

    const result = await postJson<SaasApiKeyIssue>(
      `/portal/saas/projects/${sandboxProjectId}/keys`,
      {
        label: `${sandboxProject.slug}-starter`,
        scopes: [...API_KEY_SCOPE_OPTIONS],
      },
      "Sandbox API key issued.",
    );
    if (!result) {
      return;
    }

    setIssuedKey(result);
    setRotatedKey(null);
    startTransition(() => {
      router.replace(
        buildPortalHref(view, {
          ...currentHrefState,
          projectId: sandboxProjectId,
        }),
      );
      router.refresh();
    });
  };

  const handleCopySandboxSnippet = async () => {
    if (!navigator.clipboard) {
      setErrorBanner("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(sandboxSnippet);
      setSuccessBanner("Copied the sandbox SDK snippet.");
    } catch {
      setErrorBanner("Failed to copy the sandbox SDK snippet.");
    }
  };

  const handleCopyInviteLink = async () => {
    if (!createdInvite?.inviteUrl) {
      return;
    }

    if (!navigator.clipboard) {
      setErrorBanner("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(createdInvite.inviteUrl);
      setSuccessBanner("Copied the tenant invite link.");
    } catch {
      setErrorBanner("Failed to copy the tenant invite link.");
    }
  };

  const handleRotateKey = async (apiKey: SaasApiKey) => {
    if (!currentProjectId) {
      return;
    }

    const result = await postJson<SaasApiKeyRotation>(
      `/portal/saas/projects/${currentProjectId}/keys/${apiKey.id}/rotate`,
      {
        reason: "portal_rotation",
        overlapSeconds: 3600,
      },
      `Rotated ${apiKey.label}.`,
    );
    if (!result) {
      return;
    }

    setRotatedKey(result);
    setIssuedKey(null);
    refreshOverview();
  };

  const handleRevokeKey = async (apiKey: SaasApiKey) => {
    if (!currentProjectId) {
      return;
    }

    const result = await postJson<SaasApiKey>(
      `/portal/saas/projects/${currentProjectId}/keys/${apiKey.id}/revoke`,
      {
        reason: "portal_revocation",
      },
      `Revoked ${apiKey.label}.`,
    );
    if (!result) {
      return;
    }

    setIssuedKey(null);
    setRotatedKey(null);
    refreshOverview();
  };

  const handleCreatePrize = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProjectId) {
      setErrorBanner("Select a project before creating a prize.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await postJson<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes`,
      {
        name: String(formData.get("name") ?? "").trim(),
        stock: Number(formData.get("stock") ?? 0),
        weight: Number(formData.get("weight") ?? 1),
        rewardAmount: String(formData.get("rewardAmount") ?? "0").trim(),
        isActive: formData.get("isActive") === "on",
      },
      "Prize created.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  const handleUpdatePrize = async (
    event: React.FormEvent<HTMLFormElement>,
    prizeId: number,
  ) => {
    event.preventDefault();
    if (!currentProjectId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = await patchJson<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes/${prizeId}`,
      {
        name: String(formData.get("name") ?? "").trim(),
        stock: Number(formData.get("stock") ?? 0),
        weight: Number(formData.get("weight") ?? 1),
        rewardAmount: String(formData.get("rewardAmount") ?? "0").trim(),
        isActive: formData.get("isActive") === "on",
      },
      "Prize updated.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleDeletePrize = async (prizeId: number) => {
    if (!currentProjectId) {
      return;
    }

    const result = await deleteRequest<SaasProjectPrize>(
      `/portal/saas/projects/${currentProjectId}/prizes/${prizeId}`,
      "Prize archived.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleBillingRedirect = async (
    path: string,
    successMessage: string,
  ) => {
    const response = await postJson<{ url: string }>(path, {}, successMessage);
    if (!response?.url) {
      return;
    }

    window.location.assign(response.url);
  };

  const handleQueueReportExport = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before queuing a report export.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fromAt = parseDateTimeInputToIso(formData.get("fromAt"));
    const toAt = parseDateTimeInputToIso(formData.get("toAt"));
    if (!fromAt || !toAt) {
      setErrorBanner("Enter a valid report export time range.");
      return;
    }

    const projectScope = String(formData.get("projectScope") ?? "all").trim();
    const projectId =
      projectScope !== "all" && Number.isInteger(Number(projectScope))
        ? Number(projectScope)
        : null;

    const result = await postJson<SaasReportExportJob>(
      `/portal/saas/tenants/${currentTenantId}/reports/exports`,
      {
        projectId,
        resource: String(formData.get("resource") ?? "").trim(),
        format: String(formData.get("format") ?? "").trim(),
        fromAt,
        toAt,
      },
      "Report export queued.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  const handleUpdateBudgetPolicy = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before updating budget controls.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const monthlyBudget = String(formData.get("monthlyBudget") ?? "").trim();
    const alertThresholdRaw = String(
      formData.get("alertThresholdPct") ?? "",
    ).trim();
    const hardCap = String(formData.get("hardCap") ?? "").trim();
    const alertWebhookUrl = String(
      formData.get("alertWebhookUrl") ?? "",
    ).trim();
    const alertWebhookSecret = String(
      formData.get("alertWebhookSecret") ?? "",
    ).trim();
    const alertThresholdPct = alertThresholdRaw
      ? Number(alertThresholdRaw)
      : null;

    if (alertThresholdRaw && !Number.isFinite(alertThresholdPct)) {
      setErrorBanner("Alert threshold must be a number.");
      return;
    }

    const result = await patchJson(
      `/portal/saas/tenants/${currentTenantId}/billing/budget-policy`,
      {
        monthlyBudget: monthlyBudget || null,
        alertThresholdPct,
        hardCap: hardCap || null,
        alertEmailEnabled: formData.get("alertEmailEnabled") === "on",
        alertWebhookUrl: alertWebhookUrl || null,
        ...(alertWebhookSecret ? { alertWebhookSecret } : {}),
        clearAlertWebhook: formData.get("clearAlertWebhook") === "on",
      },
      "Billing budget controls updated.",
    );
    if (!result) {
      return;
    }

    refreshOverview();
  };

  const handleCreateBillingDispute = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!currentTenantId) {
      setErrorBanner("Select a tenant before submitting a billing dispute.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const billingRunId = Number(formData.get("billingRunId") ?? 0);
    if (!Number.isInteger(billingRunId) || billingRunId <= 0) {
      setErrorBanner("Choose the invoice run you want to dispute.");
      return;
    }

    const result = await postJson(
      `/portal/saas/tenants/${currentTenantId}/disputes`,
      {
        billingRunId,
        reason: String(formData.get("reason") ?? "other"),
        summary: String(formData.get("summary") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        requestedRefundAmount: String(
          formData.get("requestedRefundAmount") ?? "0",
        ).trim(),
      },
      "Billing dispute submitted.",
    );
    if (!result) {
      return;
    }

    form.reset();
    refreshOverview();
  };

  const renderOverviewPage = () => (
    <>
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {portalRouteOrder
          .filter((route) => route !== "overview")
          .map((route) => {
            const metric =
              route === "tenants"
                ? `${tenantEntries.length} accessible`
                : route === "keys"
                  ? `${currentProjectKeys.length} in project`
                  : route === "usage"
                    ? `${currentProjectUsage.length} recent events`
                    : route === "reports"
                      ? "Signed downloads"
                      : route === "prizes"
                        ? `${currentProjectPrizes.length} prizes`
                        : route === "billing"
                          ? `${currentTenantBillingRuns.length} invoice runs`
                          : sandboxProject
                            ? "Sandbox handoff ready"
                            : "Waiting for sandbox";

            return (
              <Link
                key={route}
                href={buildPortalHref(route, currentHrefState)}
                className="group"
              >
                <Card className="h-full border-slate-200 bg-white/90 transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                  <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xl text-slate-950">
                        {portalRouteMeta[route].label}
                      </CardTitle>
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {metric}
                      </Badge>
                    </div>
                    <CardDescription>
                      {portalRouteMeta[route].description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                {overviewUiCopy.sandbox.badgePrimary}
              </Badge>
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                {overviewUiCopy.sandbox.badgeSecondary}
              </Badge>
            </div>
            <CardTitle>{overviewUiCopy.sandbox.title}</CardTitle>
            <CardDescription>
              {overviewUiCopy.sandbox.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {sandboxProject ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Project
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProject.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {sandboxProject.slug}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Seed prizes
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProjectPrizes.length}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Ready for first-run hello-reward calls
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Active keys
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProjectKeys.length}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Starter key can be re-issued at any time
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {sandboxProject.environment}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      Draw cost {sandboxProject.drawCost}{" "}
                      {sandboxProject.currency}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Seed catalog:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sandboxProjectPrizes.length > 0 ? (
                      sandboxProjectPrizes.slice(0, 6).map((prize) => (
                        <Badge
                          key={prize.id}
                          className="rounded-full bg-white text-slate-700 hover:bg-white"
                        >
                          {prize.name} · {prize.rewardAmount}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">
                        No sandbox prizes are visible yet.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSelectSandboxProject}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.focusActionLabel}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleIssueSandboxStarterKey}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.issueStarterKeyLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCopySandboxSnippet()}
                  >
                    {overviewUiCopy.sandbox.copySnippetLabel}
                  </Button>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {latestSandboxSecret
                    ? overviewUiCopy.sandbox.latestSecretMessage
                    : overviewUiCopy.sandbox.placeholderSecretMessage}
                </p>
                {currentTenant?.tenant.onboardedAt ? (
                  <p className="text-sm leading-6 text-emerald-700">
                    First successful call completed{" "}
                    {formatDate(currentTenant.tenant.onboardedAt)}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {overviewUiCopy.sandbox.emptyStateMessage}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-white">
                {overviewUiCopy.snippet.title}
              </CardTitle>
              {renderSnippetLanguagePicker()}
            </div>
            <CardDescription className="text-slate-400">
              {overviewUiCopy.snippet.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre className="overflow-x-auto rounded-3xl bg-black/30 p-5 text-sm text-slate-100">
              <code>{sandboxSnippet}</code>
            </pre>
            <p className="text-sm leading-6 text-slate-400">
              Base URL {ENGINE_BASE_URL} · project{" "}
              {sandboxProject ? sandboxProject.slug : "not provisioned"} ·{" "}
              {latestSandboxSecret
                ? "fresh secret embedded from the latest key issue or rotation response"
                : "replace the placeholder key before running"}
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );

  const renderTenantsPage = () => (
    <>
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {tenantEntries.length > 0 ? (
          tenantEntries.map((entry) => {
            const sandboxCount = projects.filter(
              (project) =>
                project.tenantId === entry.tenant.id &&
                project.environment === "sandbox",
            ).length;
            const liveCount = projects.filter(
              (project) =>
                project.tenantId === entry.tenant.id &&
                project.environment === "live",
            ).length;

            return (
              <Card
                key={entry.tenant.id}
                className={cn(
                  "border-slate-200 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]",
                  entry.tenant.id === currentTenantId && "border-sky-200",
                )}
              >
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl text-slate-950">
                      {entry.tenant.name}
                    </CardTitle>
                    <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                      {entry.tenant.status}
                    </Badge>
                    {entry.billing ? (
                      <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                        {entry.billing.planCode}
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription>
                    {entry.tenant.slug} · {entry.projectCount} projects ·{" "}
                    {entry.apiKeyCount} keys · {entry.drawCount30d} draws in the
                    last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Sandbox projects
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {sandboxCount}
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Live projects
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {liveCount}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {projects
                      .filter((project) => project.tenantId === entry.tenant.id)
                      .slice(0, 5)
                      .map((project) => (
                        <Badge
                          key={project.id}
                          className="rounded-full bg-white text-slate-700 hover:bg-white"
                        >
                          {project.name} · {project.environment}
                        </Badge>
                      ))}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const nextProjectId =
                          projects.find(
                            (project) => project.tenantId === entry.tenant.id,
                          )?.id ?? null;
                        navigateWithScope(entry.tenant.id, nextProjectId);
                      }}
                    >
                      Focus tenant
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-dashed border-slate-300 bg-white/70 lg:col-span-2 xl:col-span-3">
            <CardContent className="pt-6 text-sm text-slate-600">
              No accessible tenant memberships are attached to this account yet.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Membership and project inventory</CardTitle>
            <CardDescription>
              Current-tenant membership coverage plus the projects exposed by
              the signed-in operator profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {currentTenant ? (
              <form
                onSubmit={handleSaveMembership}
                className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[1.1fr_0.9fr_auto]"
              >
                <div className="grid gap-2">
                  <Label htmlFor="membership-adminEmail">
                    Existing operator email
                  </Label>
                  <Input
                    id="membership-adminEmail"
                    name="adminEmail"
                    type="email"
                    placeholder="operator@tenant.example"
                    required
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    Memberships attach to an existing admin profile tied to this
                    email.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="membership-role">Tenant role</Label>
                  <select
                    id="membership-role"
                    name="role"
                    defaultValue="tenant_operator"
                    className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  >
                    {saasTenantRoleValues.map((role) => (
                      <option key={role} value={role}>
                        {TENANT_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-slate-500">
                    {TENANT_ROLE_DESCRIPTIONS.tenant_operator}
                  </p>
                </div>

                <div className="flex items-end">
                  <Button type="submit" disabled={isPending}>
                    Save membership
                  </Button>
                </div>
              </form>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentTenantMemberships.length > 0 ? (
                  currentTenantMemberships.map((membership) => (
                    <TableRow key={membership.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-900">
                            {membership.adminDisplayName ??
                              membership.adminEmail ??
                              "Unknown"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {membership.adminEmail ?? "No email on record"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{TENANT_ROLE_LABELS[membership.role]}</TableCell>
                      <TableCell>{formatDate(membership.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void handleDeleteMembership(membership);
                            }}
                            disabled={isPending}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-slate-500"
                    >
                      No memberships are visible for the selected tenant.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="grid gap-4">
              {tenantProjects.length > 0 ? (
                tenantProjects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">
                          {project.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {project.slug} · {project.environment} · draw cost{" "}
                          {project.drawCost} {project.currency}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {project.status}
                        </Badge>
                        <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                          {project.strategy}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ["Burst", String(project.apiRateLimitBurst)],
                        ["Hourly", String(project.apiRateLimitHourly)],
                        ["Daily", String(project.apiRateLimitDaily)],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-slate-200 bg-white p-3"
                        >
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                            {label}
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No projects are visible for the selected tenant yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="border-slate-200 bg-white/90">
            <CardHeader className="gap-2">
              <CardTitle>Pending invites</CardTitle>
              <CardDescription>
                Invite status visible from the aggregated portal overview.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {currentTenant ? (
                <form
                  onSubmit={handleCreateTenantInvite}
                  className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="invite-email">Invite email</Label>
                    <Input
                      id="invite-email"
                      name="email"
                      type="email"
                      placeholder="new-operator@tenant.example"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="invite-role">Tenant role</Label>
                    <select
                      id="invite-role"
                      name="role"
                      defaultValue="tenant_operator"
                      className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {saasTenantRoleValues.map((role) => (
                        <option key={role} value={role}>
                          {TENANT_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isPending}>
                      Send invite
                    </Button>
                  </div>
                </form>
              ) : null}

              {createdInvite ? (
                <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">
                        Invite link ready
                      </p>
                      <p className="mt-1 text-sm text-emerald-800">
                        {createdInvite.invite.email} ·{" "}
                        {TENANT_ROLE_LABELS[createdInvite.invite.role]}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void handleCopyInviteLink();
                        }}
                      >
                        Copy link
                      </Button>
                      <Button asChild size="sm">
                        <a href={createdInvite.inviteUrl} target="_blank" rel="noreferrer">
                          Open link
                        </a>
                      </Button>
                    </div>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-3 text-xs text-emerald-200">
                    <code>{createdInvite.inviteUrl}</code>
                  </pre>
                </div>
              ) : null}

              {currentTenantInvites.length > 0 ? (
                currentTenantInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {invite.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {invite.status}
                        </Badge>
                        {invite.status === "pending" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void handleRevokeInvite(invite);
                            }}
                            disabled={isPending}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {TENANT_ROLE_LABELS[invite.role]} · expires{" "}
                      {formatDate(invite.expiresAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No tenant invites are visible for the selected scope.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/90">
            <CardHeader className="gap-2">
              <CardTitle>Risk and tenant links</CardTitle>
              <CardDescription>
                Read-only operational context already exposed by the overview
                payload.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">
                  Active agent controls
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {agentControls.length > 0
                    ? `${agentControls.length} control(s) active for this tenant.`
                    : "No agent controls are currently attached to this tenant."}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">
                  Tenant links
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {currentTenantLinks.length > 0
                    ? `${currentTenantLinks.length} tenant link relationship(s) are visible.`
                    : "No tenant link relationships are visible for the selected tenant."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );

  const renderKeysPage = () => (
    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>API key management</CardTitle>
          <CardDescription>
            Generate, rotate, and revoke project keys without entering the
            internal admin plane.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={handleIssueKey}
            className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="key-label">Key label</Label>
              <Input
                id="key-label"
                name="label"
                placeholder="Production server"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="key-expiry">Expiry</Label>
              <Input id="key-expiry" name="expiresAt" type="datetime-local" />
            </div>

            <div className="grid gap-2">
              <Label>Scopes</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {API_KEY_SCOPE_OPTIONS.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      className="size-4 rounded border-slate-300"
                      defaultChecked
                      type="checkbox"
                      name="scopes"
                      value={scope}
                    />
                    <span>{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!currentProjectId || isPending}>
                Issue key
              </Button>
            </div>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentProjectKeys.length > 0 ? (
                currentProjectKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">
                          {apiKey.label}
                        </span>
                        <span className="text-xs text-slate-500">
                          {apiKey.scopes.join(", ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{apiKey.keyPrefix}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          apiKey.revokedAt
                            ? "rounded-full bg-rose-100 text-rose-700 hover:bg-rose-100"
                            : "rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        }
                      >
                        {apiKey.revokedAt ? "revoked" : "active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-xs leading-5 text-slate-600">
                      {formatWindow(apiKey.apiRateLimitUsage?.burst)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDate(apiKey.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {!apiKey.revokedAt ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRotateKey(apiKey)}
                              disabled={isPending}
                            >
                              Rotate
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevokeKey(apiKey)}
                              disabled={isPending}
                            >
                              Revoke
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {formatDate(apiKey.revokedAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    No keys issued for the current project yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">
              Current project guardrails
            </CardTitle>
            <CardDescription className="text-slate-400">
              Read the active quota windows before handing the key to an
              integrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              [
                "Burst",
                formatWindow(
                  currentProject?.apiRateLimitUsage?.aggregate.burst,
                ),
              ],
              [
                "Hourly",
                formatWindow(
                  currentProject?.apiRateLimitUsage?.aggregate.hourly,
                ),
              ],
              [
                "Daily",
                formatWindow(
                  currentProject?.apiRateLimitUsage?.aggregate.daily,
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Key handoff notes</CardTitle>
            <CardDescription>
              Project-scoped secrets should stay aligned to the selected
              environment and deployment workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-6 text-slate-600">
            <p>
              Use sandbox keys against sandbox projects and rotate them after
              deployment or any credential exposure drill.
            </p>
            <p>
              The portal only shows a fresh secret in the issue or rotation
              response. After that, storage drops back to the masked prefix.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!sandboxProjectId || isPending}
                onClick={handleSelectSandboxProject}
              >
                {overviewUiCopy.sandbox.focusActionLabel}
              </Button>
              <Button
                type="button"
                disabled={!sandboxProjectId || isPending}
                onClick={handleIssueSandboxStarterKey}
              >
                {overviewUiCopy.sandbox.issueStarterKeyLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );

  const renderUsagePage = () => (
    <>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Usage and quota</CardTitle>
            <CardDescription>
              Read current aggregate quota pressure from active keys and inspect
              the latest metered events.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {currentProject ? (
              <>
                <div className="grid gap-3">
                  {[
                    [
                      "Burst",
                      formatWindow(
                        currentProject.apiRateLimitUsage?.aggregate.burst,
                      ),
                    ],
                    [
                      "Hourly",
                      formatWindow(
                        currentProject.apiRateLimitUsage?.aggregate.hourly,
                      ),
                    ],
                    [
                      "Daily",
                      formatWindow(
                        currentProject.apiRateLimitUsage?.aggregate.daily,
                      ),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                      {currentProject.environment}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      Draw cost {currentProject.drawCost}{" "}
                      {currentProject.currency}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Project-level limits: burst{" "}
                    {currentProject.apiRateLimitBurst}, hourly{" "}
                    {currentProject.apiRateLimitHourly}, daily{" "}
                    {currentProject.apiRateLimitDaily}. Active keys{" "}
                    {currentProject.apiRateLimitUsage?.activeKeyCount ?? 0}.
                  </p>
                </div>

                <div className="grid gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Recent usage events
                  </h3>
                  {currentProjectUsage.length > 0 ? (
                    currentProjectUsage.slice(0, 6).map((event) => (
                      <div
                        key={event.id}
                        className="rounded-3xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {event.eventType}
                          </p>
                          <span className="text-xs text-slate-500">
                            {formatDate(event.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {event.units} unit(s) · {event.amount}{" "}
                          {event.currency}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      No usage events are visible for the current project yet.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Select a project to inspect quota windows and metered usage.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">
              30-day draw observability
            </CardTitle>
            <CardDescription className="text-slate-400">
              Project-level draw distribution, payout drift, and player
              concentration from the aggregated overview payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {currentProjectObservability ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [
                      "Draws",
                      String(
                        currentProjectObservability.summary.totalDrawCount,
                      ),
                    ],
                    [
                      "Players",
                      String(
                        currentProjectObservability.summary.uniquePlayerCount,
                      ),
                    ],
                    [
                      "Hit rate",
                      formatPercent(
                        currentProjectObservability.summary.hitRate,
                      ),
                    ],
                    [
                      "Payout drift",
                      formatSignedDelta(
                        currentProjectObservability.summary.payoutRateDrift,
                      ),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">
                  Hit rate drift{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      getDriftTone(
                        currentProjectObservability.summary.hitRateDrift,
                      ),
                    )}
                  >
                    {formatSignedDelta(
                      currentProjectObservability.summary.hitRateDrift,
                    )}
                  </span>
                  {" · "}
                  Expected payout{" "}
                  {currentProjectObservability.summary.expectedRewardAmount}
                  {" · "}
                  Actual payout{" "}
                  {currentProjectObservability.summary.actualRewardAmount}
                </div>

                <div className="grid gap-3">
                  {currentProjectObservability.distribution
                    .slice(0, 6)
                    .map((bucket) => (
                      <div
                        key={bucket.bucketKey}
                        className="rounded-3xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white">
                            {bucket.label}
                          </p>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              getDriftTone(bucket.probabilityDrift),
                            )}
                          >
                            {formatSignedDelta(bucket.probabilityDrift)}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2">
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>Actual probability</span>
                              <span>
                                {formatPercent(bucket.actualProbability)}
                              </span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10">
                              <div
                                className="h-2 rounded-full bg-sky-400"
                                style={{
                                  width: getDistributionBarWidth(
                                    bucket.actualProbability,
                                  ),
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>Expected probability</span>
                              <span>
                                {formatPercent(bucket.expectedProbability)}
                              </span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10">
                              <div
                                className="h-2 rounded-full bg-white/40"
                                style={{
                                  width: getDistributionBarWidth(
                                    bucket.expectedProbability,
                                  ),
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-slate-400">
                          {bucket.actualDrawCount} draws · configured weight{" "}
                          {bucket.configuredWeight}
                        </p>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No observability snapshot is visible for the selected project
                yet.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );

  const renderReportsPage = () => (
    <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <CardHeader className="gap-2">
          <CardTitle>Queue audit export</CardTitle>
          <CardDescription>
            Generate tenant-scoped CSV or JSON exports for compliance reviews.
            Completed downloads use short-lived signed links and remain
            available for 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {currentTenant ? (
            <>
              <div className="grid gap-3">
                {REPORT_RESOURCE_OPTIONS.map((resource) => (
                  <div
                    key={resource.value}
                    className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {resource.label}
                      </p>
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {resource.value}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {resource.description}
                    </p>
                  </div>
                ))}
              </div>

              <form className="grid gap-4" onSubmit={handleQueueReportExport}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="report-resource">Dataset</Label>
                    <select
                      id="report-resource"
                      name="resource"
                      defaultValue="saas_usage_events"
                      className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {REPORT_RESOURCE_OPTIONS.map((resource) => (
                        <option key={resource.value} value={resource.value}>
                          {resource.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="report-format">Format</Label>
                    <select
                      id="report-format"
                      name="format"
                      defaultValue="csv"
                      className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {REPORT_FORMAT_OPTIONS.map((format) => (
                        <option key={format.value} value={format.value}>
                          {format.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="report-fromAt">From</Label>
                    <Input
                      id="report-fromAt"
                      name="fromAt"
                      type="datetime-local"
                      defaultValue={getDefaultReportFromAt()}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="report-toAt">To</Label>
                    <Input
                      id="report-toAt"
                      name="toAt"
                      type="datetime-local"
                      defaultValue={getDefaultReportToAt()}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="report-projectScope">Project scope</Label>
                  <select
                    id="report-projectScope"
                    name="projectScope"
                    defaultValue="all"
                    className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">
                      All projects in {currentTenant.tenant.name}
                    </option>
                    {tenantProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} · {project.environment}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                  JSON keeps nested metadata intact. CSV flattens nested
                  payloads into JSON-encoded cells. `agent_risk_state` exports
                  records whose `updatedAt` changed inside the selected window.
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    Signed links rotate when the page refreshes.
                  </p>
                  <Button type="submit" disabled={isPending}>
                    Queue export
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Select a tenant before creating audit exports.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-white">Recent export jobs</CardTitle>
              <CardDescription className="text-slate-400">
                Track pending jobs and pull signed downloads once processing
                completes.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={refreshOverview}
              disabled={isPending}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {reportsError ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-700">
              {reportsError}
            </div>
          ) : null}

          {hasPendingReportExports ? (
            <div className="rounded-3xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">
              Pending jobs refresh automatically every 5 seconds.
            </div>
          ) : null}

          {visibleReportExports.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/0">
                    <TableHead className="text-slate-300">Dataset</TableHead>
                    <TableHead className="text-slate-300">Scope</TableHead>
                    <TableHead className="text-slate-300">Range</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Rows</TableHead>
                    <TableHead className="text-slate-300">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReportExports.map((job) => (
                    <TableRow
                      key={job.id}
                      className="border-white/10 hover:bg-white/[0.04]"
                    >
                      <TableCell className="align-top text-slate-100">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{job.resource}</span>
                          <span className="text-xs text-slate-400">
                            {job.format.toUpperCase()} · queued{" "}
                            {formatDate(job.createdAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-slate-300">
                        {job.projectId
                          ? (tenantProjects.find(
                              (project) => project.id === job.projectId,
                            )?.name ?? `Project #${job.projectId}`)
                          : (currentTenant?.tenant.name ??
                            `Tenant #${job.tenantId}`)}
                      </TableCell>
                      <TableCell className="align-top text-slate-300">
                        <div className="flex flex-col gap-1 text-xs leading-5">
                          <span>{formatDate(job.fromAt)}</span>
                          <span>{formatDate(job.toAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2">
                          <Badge
                            className={cn(
                              "rounded-full",
                              getReportStatusTone(job.status),
                            )}
                          >
                            {job.status}
                          </Badge>
                          {job.lastError ? (
                            <p className="max-w-xs text-xs leading-5 text-rose-300">
                              {job.lastError}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-slate-300">
                        {job.rowCount ?? "—"}
                      </TableCell>
                      <TableCell className="align-top text-slate-300">
                        {job.downloadUrl ? (
                          <Button asChild size="sm">
                            <a href={job.downloadUrl}>Download</a>
                          </Button>
                        ) : job.status === "completed" ? (
                          <span className="text-xs text-slate-400">
                            Refresh to mint a new link
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Waiting for worker
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.04] p-6 text-sm leading-6 text-slate-400">
              No export jobs are visible for the selected tenant yet. Queue one
              from the form to generate a signed CSV or JSON download.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );

  const renderPrizesPage = () => (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>Prize catalog editor</CardTitle>
          <CardDescription>
            Adjust weights, stock, activation, and reward amounts within the
            selected project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={handleCreatePrize}
            className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="prize-name">Prize name</Label>
              <Input
                id="prize-name"
                name="name"
                placeholder="Gold capsule"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-reward">Reward amount</Label>
              <Input
                id="prize-reward"
                name="rewardAmount"
                placeholder="25.00"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-stock">Stock</Label>
              <Input
                id="prize-stock"
                name="stock"
                type="number"
                min="0"
                defaultValue="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-weight">Weight</Label>
              <Input
                id="prize-weight"
                name="weight"
                type="number"
                min="1"
                defaultValue="1"
              />
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 md:col-span-2">
              <input
                className="size-4 rounded border-slate-300"
                type="checkbox"
                name="isActive"
                defaultChecked
              />
              <span>Active prize</span>
            </label>
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" disabled={!currentProjectId || isPending}>
                Create prize
              </Button>
            </div>
          </form>

          <div className="flex flex-col gap-4">
            {currentProjectPrizes.length > 0 ? (
              currentProjectPrizes.map((prize) => (
                <form
                  key={prize.id}
                  onSubmit={(event) => handleUpdatePrize(event, prize.id)}
                  className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 md:grid-cols-[1.3fr_repeat(3,minmax(0,0.7fr))_auto]"
                >
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-name-${prize.id}`}>Name</Label>
                    <Input
                      id={`prize-name-${prize.id}`}
                      name="name"
                      defaultValue={prize.name}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-stock-${prize.id}`}>Stock</Label>
                    <Input
                      id={`prize-stock-${prize.id}`}
                      name="stock"
                      type="number"
                      min="0"
                      defaultValue={String(prize.stock)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-weight-${prize.id}`}>Weight</Label>
                    <Input
                      id={`prize-weight-${prize.id}`}
                      name="weight"
                      type="number"
                      min="1"
                      defaultValue={String(prize.weight)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-reward-${prize.id}`}>Reward</Label>
                    <Input
                      id={`prize-reward-${prize.id}`}
                      name="rewardAmount"
                      defaultValue={prize.rewardAmount}
                    />
                  </div>
                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        className="size-4 rounded border-slate-300"
                        type="checkbox"
                        name="isActive"
                        defaultChecked={prize.isActive}
                      />
                      <span>Active</span>
                    </label>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={isPending}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeletePrize(prize.id)}
                        disabled={isPending}
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                </form>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No prizes are configured for the selected project yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">
              Project reward envelope
            </CardTitle>
            <CardDescription className="text-slate-400">
              Reference the current project mechanics while editing the catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {currentProject ? (
              <>
                {[
                  ["Strategy", currentProject.strategy],
                  [
                    "Pool balance",
                    `${currentProject.prizePoolBalance} ${currentProject.currency}`,
                  ],
                  ["Draw cap", String(currentProject.maxDrawCount)],
                  ["Miss weight", String(currentProject.missWeight)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Select a project to inspect its reward configuration.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Catalog summary</CardTitle>
            <CardDescription>
              Fast counts for the selected project catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "Active prizes",
                String(
                  currentProjectPrizes.filter((prize) => prize.isActive).length,
                ),
              ],
              ["Total prizes", String(currentProjectPrizes.length)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {value}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );

  const renderBillingPage = () => (
    <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>Billing, forecast, and invoices</CardTitle>
          <CardDescription>
            Open the Stripe customer portal, attach a payment method, inspect
            the daily spend curve, and compare trailing 7/30 day month-end
            projections before usage turns into an invoice surprise.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {currentTenant ? (
            <>
              <div className="grid gap-3">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-medium text-slate-900">
                    Billing profile
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {currentTenant.billing
                      ? `${currentTenant.billing.planCode} · ${currentTenant.billing.currency} · base ${currentTenant.billing.baseMonthlyFee} · draw ${currentTenant.billing.drawFee}`
                      : "No billing profile is attached to this tenant yet."}
                  </p>
                </div>

                {billingInsights ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Current month
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {billingInsights.summary.currentTotalAmount}{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Base {billingInsights.summary.baseMonthlyFee} + usage{" "}
                        {billingInsights.summary.currentUsageAmount}
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        7d forecast
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {
                          billingInsights.forecasts.trailing7d
                            .projectedTotalAmount
                        }{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Run rate{" "}
                        {billingInsights.forecasts.trailing7d.dailyRunRate}/day
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        30d forecast
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {
                          billingInsights.forecasts.trailing30d
                            .projectedTotalAmount
                        }{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Run rate{" "}
                        {billingInsights.forecasts.trailing30d.dailyRunRate}/day
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Budget state
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {billingInsights.summary.monthlyBudget
                          ? `${billingInsights.summary.remainingBudgetAmount} left`
                          : "No target"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Threshold{" "}
                        {billingInsights.summary.budgetThresholdAmount
                          ? `${billingInsights.summary.budgetThresholdAmount} ${billingCurrency}`
                          : "not configured"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Budget forecasting becomes available as soon as the tenant
                    has a billing profile and usage history.
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={!currentTenantId || isPending}
                    onClick={() =>
                      handleBillingRedirect(
                        `/portal/saas/tenants/${currentTenantId}/billing/portal`,
                        "Opening Stripe customer portal…",
                      )
                    }
                  >
                    Open billing portal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!currentTenantId || isPending}
                    onClick={() =>
                      handleBillingRedirect(
                        `/portal/saas/tenants/${currentTenantId}/billing/setup-session`,
                        "Opening payment setup session…",
                      )
                    }
                  >
                    Add payment method
                  </Button>
                </div>
              </div>

              {billingInsights ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Daily spend report
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Trailing 14 days. Forecasts extrapolate the current
                        month using trailing 7/30 day slope.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.thresholdExceeded
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        threshold{" "}
                        {billingInsights.alerts.thresholdExceeded
                          ? "hit"
                          : "clear"}
                      </Badge>
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.forecast7dExceeded ||
                            billingInsights.alerts.forecast30dExceeded
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        forecast{" "}
                        {billingInsights.alerts.forecast7dExceeded ||
                        billingInsights.alerts.forecast30dExceeded
                          ? "over budget"
                          : "within budget"}
                      </Badge>
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.hardCapReached
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        hard cap{" "}
                        {billingInsights.alerts.hardCapReached
                          ? "active"
                          : "idle"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {billingInsights.dailyReport
                      .slice()
                      .reverse()
                      .map((point) => (
                        <div
                          key={String(point.date)}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {formatDate(point.date)}
                          </p>
                          <p className="text-sm text-slate-600">
                            usage {point.usageAmount} {billingCurrency}
                          </p>
                          <p className="text-sm font-medium text-slate-900">
                            total {point.totalAmount} {billingCurrency}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {currentTenantBillingRuns.length > 0 ? (
                  currentTenantBillingRuns.slice(0, 6).map((run) => (
                    <div
                      key={run.id}
                      className="rounded-3xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {run.status}
                          </Badge>
                          <span className="text-sm font-medium text-slate-900">
                            {run.totalAmount} {run.currency}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDate(run.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Base {run.baseFeeAmount} · usage {run.usageFeeAmount} ·
                        draws {run.drawCount}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        {run.stripeHostedInvoiceUrl ? (
                          <a
                            className="font-medium text-sky-700 underline-offset-4 hover:underline"
                            href={run.stripeHostedInvoiceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Hosted invoice
                          </a>
                        ) : null}
                        {run.stripeInvoicePdf ? (
                          <a
                            className="font-medium text-sky-700 underline-offset-4 hover:underline"
                            href={run.stripeInvoicePdf}
                            rel="noreferrer"
                            target="_blank"
                          >
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No invoice runs are visible for the selected tenant yet.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Select a tenant to open billing portal links and inspect recent
              invoice runs.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">Budget controls</CardTitle>
            <CardDescription className="text-slate-400">
              Configure the tenant budget target, alert threshold, webhook
              destination, and the hard cap that flips the engine into a
              non-billable throttle instead of letting the invoice keep
              climbing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {currentTenant?.billing ? (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Plan", currentTenant.billing.planCode],
                    ["Collection", currentTenant.billing.collectionMethod],
                    [
                      "Auto billing",
                      currentTenant.billing.autoBillingEnabled
                        ? "enabled"
                        : "disabled",
                    ],
                    ["Currency", currentTenant.billing.currency],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      alert email{" "}
                      {currentBudgetPolicy?.alertEmailEnabled ? "on" : "off"}
                    </Badge>
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      webhook{" "}
                      {currentBudgetPolicy?.alertWebhookConfigured
                        ? "configured"
                        : "off"}
                    </Badge>
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      threshold{" "}
                      {formatPlainPercent(
                        currentBudgetPolicy?.alertThresholdPct,
                      )}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Budget target{" "}
                    {currentBudgetPolicy?.monthlyBudget
                      ? `${currentBudgetPolicy.monthlyBudget} ${billingCurrency}`
                      : "not configured"}
                    {" · "}Hard cap{" "}
                    {currentBudgetPolicy?.hardCap
                      ? `${currentBudgetPolicy.hardCap} ${billingCurrency}`
                      : "not configured"}
                    {currentBudgetPolicy?.state.hardCapReachedAt
                      ? ` · cap reached ${formatDate(
                          currentBudgetPolicy.state.hardCapReachedAt,
                        )}`
                      : ""}
                  </p>
                </div>

                <form
                  className="grid gap-4"
                  onSubmit={handleUpdateBudgetPolicy}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="monthlyBudget" className="text-slate-200">
                        Monthly budget target
                      </Label>
                      <Input
                        id="monthlyBudget"
                        name="monthlyBudget"
                        defaultValue={currentBudgetPolicy?.monthlyBudget ?? ""}
                        placeholder="1500.00"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="alertThresholdPct"
                        className="text-slate-200"
                      >
                        Alert threshold %
                      </Label>
                      <Input
                        id="alertThresholdPct"
                        name="alertThresholdPct"
                        defaultValue={
                          currentBudgetPolicy?.alertThresholdPct ?? ""
                        }
                        placeholder="80"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="hardCap" className="text-slate-200">
                        Hard cap
                      </Label>
                      <Input
                        id="hardCap"
                        name="hardCap"
                        defaultValue={currentBudgetPolicy?.hardCap ?? ""}
                        placeholder="1800.00"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="alertWebhookUrl"
                        className="text-slate-200"
                      >
                        Alert webhook URL
                      </Label>
                      <Input
                        id="alertWebhookUrl"
                        name="alertWebhookUrl"
                        defaultValue={
                          currentBudgetPolicy?.alertWebhookUrl ?? ""
                        }
                        placeholder="https://example.com/reward/billing-alert"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label
                      htmlFor="alertWebhookSecret"
                      className="text-slate-200"
                    >
                      Webhook secret
                    </Label>
                    <Input
                      id="alertWebhookSecret"
                      name="alertWebhookSecret"
                      type="password"
                      placeholder={
                        currentBudgetPolicy?.alertWebhookConfigured
                          ? "Leave blank to keep the existing secret"
                          : "Required when configuring a webhook"
                      }
                      className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="grid gap-3 text-sm text-slate-300">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name="alertEmailEnabled"
                        defaultChecked={
                          currentBudgetPolicy?.alertEmailEnabled ?? true
                        }
                      />
                      Send alert emails to{" "}
                      {currentTenant.tenant.billingEmail ??
                        "the billing contact once set"}
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" name="clearAlertWebhook" />
                      Remove the alert webhook and stored signing secret
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isPending}>
                      Save budget policy
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No billing account is currently visible for this tenant.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Top-ups</CardTitle>
            <CardDescription>
              Recent balance adjustments already present in the overview
              payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {currentTenantTopUps.length > 0 ? (
              currentTenantTopUps.slice(0, 6).map((topUp) => (
                <div
                  key={topUp.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {topUp.amount} {topUp.currency}
                    </p>
                    <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                      {topUp.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {topUp.note || "No note"} · {formatDate(topUp.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No top-up records are visible for the selected tenant yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Billing disputes</CardTitle>
            <CardDescription>
              Submit a formal invoice dispute tied to a specific billing run and
              track the resolution state from the tenant portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {currentTenant ? (
              <>
                <form
                  className="grid gap-4"
                  onSubmit={handleCreateBillingDispute}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="billingRunId">Invoice run</Label>
                    <select
                      id="billingRunId"
                      name="billingRunId"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Select an invoice run
                      </option>
                      {currentTenantBillingRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          #{run.id} · {run.totalAmount} {run.currency} ·{" "}
                          {run.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <select
                      id="reason"
                      name="reason"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue="invoice_amount"
                    >
                      <option value="invoice_amount">Invoice amount</option>
                      <option value="duplicate_charge">Duplicate charge</option>
                      <option value="service_quality">Service quality</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                    <div className="grid gap-2">
                      <Label htmlFor="summary">Summary</Label>
                      <Input
                        id="summary"
                        name="summary"
                        maxLength={160}
                        placeholder="Brief statement of the billing concern"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="requestedRefundAmount">
                        Requested refund
                      </Label>
                      <Input
                        id="requestedRefundAmount"
                        name="requestedRefundAmount"
                        placeholder="25.00"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Detail</Label>
                    <textarea
                      id="description"
                      name="description"
                      className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      placeholder="Describe the invoice line, period, or service issue behind this dispute."
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={!currentTenantBillingRuns.length || isPending}
                    >
                      Submit dispute
                    </Button>
                  </div>
                </form>

                <div className="flex flex-col gap-3">
                  {currentTenantBillingDisputes.length > 0 ? (
                    currentTenantBillingDisputes.slice(0, 6).map((dispute) => (
                      <div
                        key={dispute.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                              {dispute.status}
                            </Badge>
                            <span className="text-sm font-medium text-slate-900">
                              {dispute.requestedRefundAmount} {dispute.currency}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {formatDate(dispute.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {dispute.summary}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Run #{dispute.billingRunId} ·{" "}
                          {dispute.reason.replaceAll("_", " ")}
                          {dispute.approvedRefundAmount
                            ? ` · approved ${dispute.approvedRefundAmount} ${dispute.currency}`
                            : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      No billing disputes have been submitted for this tenant
                      yet.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Select a tenant before submitting or reviewing billing disputes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );

  const renderDocsPage = () => (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="grid gap-6">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-2">
            <CardTitle>Sandbox bootstrap</CardTitle>
            <CardDescription>
              Keep the first integration loop inside the tenant portal instead
              of redirecting developers into internal tooling.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-900">
                Current sandbox
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {sandboxProject
                  ? `${sandboxProject.name} · ${sandboxProject.slug} · ${sandboxProject.currency}`
                  : overviewUiCopy.sandbox.emptyStateMessage}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!sandboxProjectId || isPending}
                onClick={handleSelectSandboxProject}
              >
                {overviewUiCopy.sandbox.focusActionLabel}
              </Button>
              <Button
                type="button"
                disabled={!sandboxProjectId || isPending}
                onClick={handleIssueSandboxStarterKey}
              >
                {overviewUiCopy.sandbox.issueStarterKeyLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopySandboxSnippet()}
              >
                {overviewUiCopy.sandbox.copySnippetLabel}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Docs and SDK handoff</CardTitle>
              {renderSnippetLanguagePicker()}
            </div>
            <CardDescription>
              Give your developers a working base path, install command, and
              first request without redirecting them through the internal admin
              product.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">
                  Client bootstrap
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                  <code>{snippetBootstrap}</code>
                </pre>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">Base URL</p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                  <code>{ENGINE_BASE_URL}</code>
                </pre>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                Keys are project-scoped. Use sandbox keys against sandbox
                projects and rotate them as part of deployment or credential
                exposure drills.
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-sm text-slate-100">
              <pre className="overflow-x-auto">
                <code>{sandboxSnippet}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <CardHeader className="gap-2">
          <CardTitle className="text-white">
            Copy-and-run sandbox snippet
          </CardTitle>
          <CardDescription className="text-slate-400">
            This snippet uses the current sandbox selection and can embed a
            fresh secret from the latest issue or rotation response.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="overflow-x-auto rounded-3xl bg-black/30 p-5 text-sm text-slate-100">
            <code>{sandboxSnippet}</code>
          </pre>
          <p className="text-sm leading-6 text-slate-400">
            {latestSandboxSecret
              ? "A fresh secret is embedded in this snippet from the current browser session."
              : "Issue or rotate a sandbox key to replace the placeholder token automatically."}
          </p>
        </CardContent>
      </Card>
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="pt-6">
            <p className="text-sm text-rose-700">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {billingSetupStatus === "success" ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-6">
            <p className="text-sm text-emerald-700">
              Payment method setup completed. Future automated collection will
              use the Stripe default method for this tenant.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {billingSetupStatus === "cancelled" ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-700">
              Payment method setup was cancelled before completion.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {inviteToken ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="gap-2">
            <CardTitle className="text-xl text-amber-950">
              Pending tenant invite
            </CardTitle>
            <CardDescription className="text-amber-800">
              This session includes a tenant invite token. Accept it with the
              account that should join the tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAcceptInvite} disabled={isPending}>
              Accept invite
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {banner ? (
        <Card
          className={
            banner.tone === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }
        >
          <CardContent className="pt-6">
            <p
              className={
                banner.tone === "success"
                  ? "text-sm text-emerald-700"
                  : "text-sm text-rose-700"
              }
            >
              {banner.message}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {issuedKey ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="gap-2">
            <CardTitle className="text-xl text-emerald-950">
              Newly issued API key
            </CardTitle>
            <CardDescription className="text-emerald-800">
              Copy the secret now. Only the masked prefix is stored after this
              response.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-900">
              <span>{issuedKey.label}</span>
              <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                {issuedKey.keyPrefix}
              </Badge>
              <span>expires {formatDate(issuedKey.expiresAt)}</span>
            </div>
            <pre className="overflow-x-auto rounded-3xl bg-slate-950 p-4 text-sm text-emerald-200">
              <code>{issuedKey.apiKey}</code>
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {rotatedKey ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardHeader className="gap-2">
            <CardTitle className="text-xl text-sky-950">
              Rotated API key
            </CardTitle>
            <CardDescription className="text-sky-800">
              The previous key remains valid until the overlap window closes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-sky-900">
            <p>
              Previous key {rotatedKey.previousKey.keyPrefix} expires{" "}
              {formatDate(rotatedKey.overlapEndsAt)}.
            </p>
            <p>
              New key {rotatedKey.issuedKey.keyPrefix} expires{" "}
              {formatDate(rotatedKey.issuedKey.expiresAt)}.
            </p>
            <pre className="overflow-x-auto rounded-3xl bg-slate-950 p-4 text-sm text-sky-200">
              <code>{rotatedKey.issuedKey.apiKey}</code>
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 text-sky-900 hover:bg-sky-100">
                {portalRouteMeta[view].label}
              </Badge>
              {currentTenant ? (
                <Badge className="rounded-full bg-white/10 text-slate-200 hover:bg-white/10">
                  {currentTenant.tenant.name}
                </Badge>
              ) : null}
              {currentProject ? (
                <Badge className="rounded-full bg-white/10 text-slate-200 hover:bg-white/10">
                  {currentProject.name} · {currentProject.environment}
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-white">
              {currentViewMeta.title}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {currentViewMeta.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Tenants", String(overview?.summary.tenantCount ?? 0)],
              ["Projects", String(overview?.summary.projectCount ?? 0)],
              ["Keys", String(overview?.summary.apiKeyCount ?? 0)],
              ["Players", String(overview?.summary.playerCount ?? 0)],
              ["Draws 30d", String(overview?.summary.drawCount30d ?? 0)],
              ["Billable", String(overview?.summary.billableTenantCount ?? 0)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  {label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {value}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-2">
            <CardTitle>Tenant and project scope</CardTitle>
            <CardDescription>
              Every action in the portal is constrained by the signed-in
              operator membership set.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tenantId">Tenant</Label>
              <select
                id="tenantId"
                className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                value={currentTenantId ?? ""}
                disabled={tenantEntries.length === 0}
                onChange={(event) => {
                  const nextTenantId = Number(event.target.value);
                  const normalizedTenantId = Number.isFinite(nextTenantId)
                    ? nextTenantId
                    : null;
                  const nextProjectId =
                    projects.find(
                      (project) => project.tenantId === normalizedTenantId,
                    )?.id ?? null;
                  navigateWithScope(normalizedTenantId, nextProjectId);
                }}
              >
                {tenantEntries.length === 0 ? (
                  <option value="">Create a workspace to begin</option>
                ) : null}
                {tenantEntries.map((item) => (
                  <option key={item.tenant.id} value={item.tenant.id}>
                    {item.tenant.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="projectId">Project</Label>
              <select
                id="projectId"
                className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                value={currentProjectId ?? ""}
                disabled={tenantProjects.length === 0}
                onChange={(event) => {
                  const nextProjectId = Number(event.target.value);
                  navigateWithScope(
                    currentTenantId,
                    Number.isFinite(nextProjectId) ? nextProjectId : null,
                  );
                }}
              >
                {tenantProjects.length === 0 ? (
                  <option value="">Sandbox will appear here</option>
                ) : null}
                {tenantProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.environment}
                  </option>
                ))}
              </select>
            </div>

            {currentTenant ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 md:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-slate-950">
                    {currentTenant.tenant.name}
                  </p>
                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {currentTenant.tenant.status}
                  </Badge>
                  {currentTenant.billing ? (
                    <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                      {currentTenant.billing.planCode}
                    </Badge>
                  ) : null}
                  {currentTenant.tenant.onboardedAt ? (
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      onboarded {formatDate(currentTenant.tenant.onboardedAt)}
                    </Badge>
                  ) : (
                    <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
                      awaiting first hello-reward
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {currentTenant.tenant.slug} · {currentTenant.projectCount}{" "}
                  projects · {currentTenant.apiKeyCount} keys ·{" "}
                  {currentTenant.drawCount30d} draws in the last 30 days
                </p>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-4 md:col-span-2">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Create your first workspace
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      We will provision a sandbox project, 3 sample prizes, test
                      reward envelopes, and a starter key for the copy-and-run
                      hello-reward snippet.
                    </p>
                  </div>
                  <form
                    className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                    onSubmit={(event) => {
                      void handleCreateTenant(event);
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="createTenantName">Workspace name</Label>
                      <Input
                        id="createTenantName"
                        name="name"
                        placeholder="Acme Rewards Sandbox"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="createTenantBillingEmail">
                        Billing email
                      </Label>
                      <Input
                        id="createTenantBillingEmail"
                        name="billingEmail"
                        type="email"
                        placeholder="ops@acme.example"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" disabled={isPending}>
                        Create workspace
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {view === "overview" ? renderOverviewPage() : null}
      {view === "tenants" ? renderTenantsPage() : null}
      {view === "keys" ? renderKeysPage() : null}
      {view === "usage" ? renderUsagePage() : null}
      {view === "reports" ? renderReportsPage() : null}
      {view === "prizes" ? renderPrizesPage() : null}
      {view === "billing" ? renderBillingPage() : null}
      {view === "docs" ? renderDocsPage() : null}
    </div>
  );
}
