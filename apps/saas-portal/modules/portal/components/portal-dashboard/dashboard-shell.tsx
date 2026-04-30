import type { FormEventHandler, ReactNode } from "react";

import type {
  SaasApiKeyIssue,
  SaasApiKeyRotation,
  SaasOverview,
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
import type { PortalSelection } from "@/modules/portal/lib/portal";

import { formatDate } from "./shared";

type MutationBanner = {
  tone: "success" | "error";
  message: string;
} | null;

type DashboardShellProps = {
  banner: MutationBanner;
  billingSetupStatus: string | null;
  children: ReactNode;
  currentProject: PortalSelection["currentProject"];
  currentProjectId: number | null;
  currentTenant: PortalSelection["currentTenant"];
  currentTenantId: number | null;
  currentViewMeta: {
    description: string;
    label: string;
    title: string;
  };
  error: string | null;
  handleAcceptInvite: () => void | Promise<void>;
  handleCreateTenant: FormEventHandler<HTMLFormElement>;
  inviteToken: string | null;
  isHydrated: boolean;
  isPending: boolean;
  issuedKey: SaasApiKeyIssue | null;
  navigateWithScope: (
    nextTenantId: number | null,
    nextProjectId: number | null,
  ) => void;
  overview: SaasOverview | null;
  projects: PortalSelection["projects"];
  rotatedKey: SaasApiKeyRotation | null;
  tenantEntries: PortalSelection["tenantEntries"];
  tenantProjects: PortalSelection["tenantProjects"];
};

export function PortalDashboardShell({
  banner,
  billingSetupStatus,
  children,
  currentProject,
  currentProjectId,
  currentTenant,
  currentTenantId,
  currentViewMeta,
  error,
  handleAcceptInvite,
  handleCreateTenant,
  inviteToken,
  isHydrated,
  isPending,
  issuedKey,
  navigateWithScope,
  overview,
  projects,
  rotatedKey,
  tenantEntries,
  tenantProjects,
}: DashboardShellProps) {
  return (
    <div className="flex flex-col gap-6">
      {isHydrated ? (
        <span className="sr-only" data-testid="portal-dashboard-ready">
          Portal dashboard ready
        </span>
      ) : null}

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
            <Button
              onClick={() => {
                void handleAcceptInvite();
              }}
              disabled={isPending}
            >
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
                {currentViewMeta.label}
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
            <CardTitle className="text-white">{currentViewMeta.title}</CardTitle>
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
                    onSubmit={handleCreateTenant}
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
                      <Button type="submit" disabled={!isHydrated || isPending}>
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

      {children}
    </div>
  );
}
