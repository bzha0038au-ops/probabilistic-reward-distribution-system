"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  SaasApiKey,
  SaasApiKeyIssue,
  SaasApiKeyRotation,
  SaasOverview,
  SaasProjectPrize,
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

type PortalDashboardProps = {
  overview: SaasOverview | null;
  error: string | null;
  inviteToken: string | null;
  billingSetupStatus: string | null;
};

type MutationBanner =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: {
        message?: string;
      };
    };

const API_KEY_SCOPE_OPTIONS = [
  "catalog:read",
  "fairness:read",
  "draw:write",
  "ledger:read",
] as const;

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

const getInitialTenantId = (overview: SaasOverview | null) =>
  overview?.tenants[0]?.tenant.id ?? null;

const getInitialProjectId = (
  overview: SaasOverview | null,
  tenantId: number | null,
) =>
  overview?.projects.find((project) => project.tenantId === tenantId)?.id ?? null;

const ENGINE_BASE_URL =
  process.env.NEXT_PUBLIC_ENGINE_BASE_URL ?? "http://localhost:4000";

const buildSandboxSnippet = (payload: {
  apiKey: string | null;
  projectSlug: string | null;
}) => {
  const apiKey = payload.apiKey ?? "paste-your-sandbox-key";
  const projectSlug = payload.projectSlug ?? "sandbox-project";

  return `import { createPrizeEngineClient } from "@reward/prize-engine-sdk";

const apiKey = ${JSON.stringify(apiKey)};
const client = createPrizeEngineClient({
  getApiKey: () => apiKey,
  environment: "sandbox",
  baseUrl: "${ENGINE_BASE_URL}",
});

const result = await client.draw({
  player: {
    playerId: "${projectSlug}-player-001",
    displayName: "Portal Sandbox Player",
  },
  clientNonce: "${projectSlug}-portal-seed",
});

console.log(result);`;
};

export function PortalDashboard({
  overview,
  error,
  inviteToken,
  billingSetupStatus,
}: PortalDashboardProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<MutationBanner>(null);
  const [issuedKey, setIssuedKey] = useState<SaasApiKeyIssue | null>(null);
  const [rotatedKey, setRotatedKey] = useState<SaasApiKeyRotation | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(() =>
    getInitialTenantId(overview),
  );
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() =>
    getInitialProjectId(overview, getInitialTenantId(overview)),
  );

  const tenantEntries = overview?.tenants ?? [];
  const projects = overview?.projects ?? [];
  const apiKeys = overview?.apiKeys ?? [];
  const prizes = overview?.projectPrizes ?? [];
  const usageEvents = overview?.recentUsage ?? [];
  const billingRuns = overview?.billingRuns ?? [];
  const currentTenantId = selectedTenantId ?? tenantEntries[0]?.tenant.id ?? null;
  const currentTenant =
    tenantEntries.find((item) => item.tenant.id === currentTenantId) ?? null;
  const tenantProjects = projects.filter(
    (project) => project.tenantId === currentTenantId,
  );

  useEffect(() => {
    if (!overview) {
      setSelectedTenantId(null);
      setSelectedProjectId(null);
      return;
    }

    const nextTenantEntries = overview.tenants;
    const nextProjects = overview.projects;

    const nextTenantId =
      currentTenantId &&
      nextTenantEntries.some((item) => item.tenant.id === currentTenantId)
        ? currentTenantId
        : getInitialTenantId(overview);
    if (nextTenantId !== selectedTenantId) {
      setSelectedTenantId(nextTenantId);
    }

    const nextProjectId =
      nextProjects.find(
        (project) =>
          project.id === selectedProjectId && project.tenantId === nextTenantId,
      )?.id ?? getInitialProjectId(overview, nextTenantId);
    if (nextProjectId !== selectedProjectId) {
      setSelectedProjectId(nextProjectId);
    }
  }, [overview, currentTenantId, selectedProjectId, selectedTenantId]);

  const currentProject =
    tenantProjects.find((project) => project.id === selectedProjectId) ??
    tenantProjects[0] ??
    null;
  const currentProjectId = currentProject?.id ?? null;
  const currentProjectKeys = apiKeys.filter(
    (apiKey) => apiKey.projectId === currentProjectId,
  );
  const currentProjectPrizes = prizes.filter(
    (prize) => prize.projectId === currentProjectId,
  );
  const currentTenantBillingRuns = billingRuns.filter(
    (run) => run.tenantId === currentTenantId,
  );
  const currentProjectUsage = usageEvents.filter(
    (event) => event.projectId === currentProjectId,
  );
  const sandboxProject =
    tenantProjects.find((project) => project.environment === "sandbox") ?? null;
  const sandboxProjectId = sandboxProject?.id ?? null;
  const sandboxProjectPrizes = prizes.filter(
    (prize) => prize.projectId === sandboxProjectId,
  );
  const sandboxProjectKeys = apiKeys.filter(
    (apiKey) => apiKey.projectId === sandboxProjectId && !apiKey.revokedAt,
  );
  const latestSandboxSecret =
    issuedKey?.projectId === sandboxProjectId
      ? issuedKey.apiKey
      : rotatedKey?.issuedKey.projectId === sandboxProjectId
        ? rotatedKey.issuedKey.apiKey
        : null;
  const sandboxSnippet = buildSandboxSnippet({
    apiKey: latestSandboxSecret,
    projectSlug: sandboxProject?.slug ?? null,
  });

  const refreshOverview = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const readEnvelope = async <T,>(response: Response): Promise<ApiEnvelope<T> | null> =>
    (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  const setErrorBanner = (message: string) => {
    setBanner({ tone: "error", message });
  };

  const setSuccessBanner = (message: string) => {
    setBanner({ tone: "success", message });
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
      const message =
        payload && payload.ok === false
          ? payload.error?.message ?? "Request failed."
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
      const message =
        payload && payload.ok === false
          ? payload.error?.message ?? "Request failed."
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
      const message =
        payload && payload.ok === false
          ? payload.error?.message ?? "Request failed."
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

    const result = await postJson("/portal/saas/invites/accept", {
      token: inviteToken,
    }, "Tenant invite accepted.");
    if (!result) {
      return;
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

    setSelectedProjectId(sandboxProjectId);
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
    setSelectedProjectId(sandboxProjectId);
    refreshOverview();
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

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-2">
            <CardTitle>Tenant and project scope</CardTitle>
            <CardDescription>
              Every action in the portal is constrained by your current
              membership set.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tenantId">Tenant</Label>
              <select
                id="tenantId"
                className="flex h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                value={currentTenantId ?? ""}
                onChange={(event) => {
                  const nextTenantId = Number(event.target.value);
                  setSelectedTenantId(Number.isFinite(nextTenantId) ? nextTenantId : null);
                }}
              >
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
                onChange={(event) => {
                  const nextProjectId = Number(event.target.value);
                  setSelectedProjectId(Number.isFinite(nextProjectId) ? nextProjectId : null);
                }}
              >
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
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {currentTenant.tenant.slug} · {currentTenant.projectCount} projects ·{" "}
                  {currentTenant.apiKeyCount} keys · {currentTenant.drawCount30d} draws in
                  the last 30 days
                </p>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600 md:col-span-2">
                No accessible tenant membership is currently attached to this
                account. Sign in via an invite link or ask a tenant owner to
                grant access.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">Live summary</CardTitle>
            <CardDescription className="text-slate-400">
              Current scope totals for your portal-accessible surface.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
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
                <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                D2 sandbox
              </Badge>
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                zero-friction onboarding
              </Badge>
            </div>
            <CardTitle>Sandbox is already provisioned</CardTitle>
            <CardDescription>
              New tenants land with a sandbox project, seeded sample prizes, and
              a copy-ready SDK path. This card exposes those bootstrap assets
              immediately instead of sending operators through multiple portal
              sections first.
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
                      Ready for first-run draws
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
                      Issue one if you want to run the snippet right now
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {sandboxProject.environment}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      Draw cost {sandboxProject.drawCost} {sandboxProject.currency}
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
                    Focus sandbox project
                  </Button>
                  <Button
                    type="button"
                    onClick={handleIssueSandboxStarterKey}
                    disabled={isPending}
                  >
                    Issue starter key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCopySandboxSnippet()}
                  >
                    Copy SDK snippet
                  </Button>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {latestSandboxSecret
                    ? "A fresh sandbox secret is in memory from this session, so the snippet on the right is genuinely copy-and-run."
                    : "Issue a starter key first if you want the snippet on the right to include a fresh secret instead of the placeholder token."}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No sandbox project is visible for the selected tenant yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">Copy-and-run SDK snippet</CardTitle>
            <CardDescription className="text-slate-400">
              Uses the provisioned sandbox environment and a tenant-specific
              nonce so new operators can verify the path immediately.
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
                ? "fresh secret embedded from the latest key issue/rotation response"
                : "replace the placeholder key before running"}
            </p>
          </CardContent>
        </Card>
      </section>

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
            <form onSubmit={handleIssueKey} className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid gap-2">
                <Label htmlFor="key-label">Key label</Label>
                <Input id="key-label" name="label" placeholder="Production server" required />
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
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      No keys issued for the current project yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
                    ["Burst", formatWindow(currentProject.apiRateLimitUsage?.aggregate.burst)],
                    ["Hourly", formatWindow(currentProject.apiRateLimitUsage?.aggregate.hourly)],
                    ["Daily", formatWindow(currentProject.apiRateLimitUsage?.aggregate.daily)],
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
                      Draw cost {currentProject.drawCost} {currentProject.currency}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Project-level limits: burst {currentProject.apiRateLimitBurst}
                    , hourly {currentProject.apiRateLimitHourly}, daily{" "}
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
                          {event.units} unit(s) · {event.amount} {event.currency}
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
      </section>

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
            <form onSubmit={handleCreatePrize} className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="prize-name">Prize name</Label>
                <Input id="prize-name" name="name" placeholder="Gold capsule" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prize-reward">Reward amount</Label>
                <Input id="prize-reward" name="rewardAmount" placeholder="25.00" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prize-stock">Stock</Label>
                <Input id="prize-stock" name="stock" type="number" min="0" defaultValue="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prize-weight">Weight</Label>
                <Input id="prize-weight" name="weight" type="number" min="1" defaultValue="1" />
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

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Billing and invoices</CardTitle>
            <CardDescription>
              Open the Stripe customer portal, attach a payment method, and
              review recent invoice runs tied to this tenant.
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
      </section>

      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>Docs and SDK handoff</CardTitle>
          <CardDescription>
            Give your developers a working base path, install command, and first
            request without redirecting them through the internal admin product.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-900">SDK install</p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                <code>pnpm add @reward/prize-engine-sdk</code>
              </pre>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-900">Base URL</p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                <code>{ENGINE_BASE_URL}</code>
              </pre>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
              Keys are project-scoped. Use sandbox keys against sandbox projects
              and rotate them as part of deployment or credential exposure
              drills.
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-sm text-slate-100">
            <pre className="overflow-x-auto">
              <code>{`import { createPrizeEngineClient } from "@reward/prize-engine-sdk";

const client = createPrizeEngineClient({
  getApiKey: () => process.env.REWARD_ENGINE_API_KEY!,
  environment: "sandbox",
  baseUrl: "${ENGINE_BASE_URL}",
});

const overview = await client.getOverview();
const result = await client.draw({
  player: {
    playerId: "player-42",
    displayName: "Player 42",
  },
  clientNonce: "tenant-debug-seed",
});`}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
