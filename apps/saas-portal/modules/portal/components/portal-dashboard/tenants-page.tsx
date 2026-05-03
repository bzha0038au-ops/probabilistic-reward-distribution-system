import type { FormEventHandler } from "react";

import {
  saasTenantRoleValues,
  type SaasTenantInvite,
  type SaasTenantInviteDelivery,
  type SaasTenantMembership,
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
import { cn } from "@/lib/utils";
import type {
  PortalSelection,
  PortalTenantsSubview,
} from "@/modules/portal/lib/portal";

import {
  TENANT_ROLE_DESCRIPTIONS,
  TENANT_ROLE_LABELS,
  formatDate,
} from "./shared";

type TenantsPageProps = {
  agentControls: PortalSelection["agentControls"];
  createdInvite: SaasTenantInviteDelivery | null;
  currentTenant: PortalSelection["currentTenant"];
  currentTenantId: number | null;
  currentTenantInvites: PortalSelection["currentTenantInvites"];
  currentTenantLinks: PortalSelection["currentTenantLinks"];
  currentTenantMemberships: PortalSelection["currentTenantMemberships"];
  handleCopyInviteLink: () => void;
  handleCreateTenantInvite: FormEventHandler<HTMLFormElement>;
  handleDeleteMembership: (membership: SaasTenantMembership) => void;
  handleRevokeInvite: (invite: SaasTenantInvite) => void;
  handleSaveMembership: FormEventHandler<HTMLFormElement>;
  isPending: boolean;
  navigateWithScope: (
    nextTenantId: number | null,
    nextProjectId: number | null,
  ) => void;
  projects: PortalSelection["projects"];
  tenantEntries: PortalSelection["tenantEntries"];
  tenantProjects: PortalSelection["tenantProjects"];
  tenantsSubview: PortalTenantsSubview | null;
};

export function PortalDashboardTenantsPage({
  agentControls,
  createdInvite,
  currentTenant,
  currentTenantId,
  currentTenantInvites,
  currentTenantLinks,
  currentTenantMemberships,
  handleCopyInviteLink,
  handleCreateTenantInvite,
  handleDeleteMembership,
  handleRevokeInvite,
  handleSaveMembership,
  isPending,
  navigateWithScope,
  projects,
  tenantEntries,
  tenantProjects,
  tenantsSubview,
}: TenantsPageProps) {
  const activeSubview = tenantsSubview ?? "directory";

  if (activeSubview === "directory") {
    return (
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
                  "portal-shell-card portal-hover-rise rounded-[1.8rem] bg-white/92",
                  entry.tenant.id === currentTenantId &&
                    "border-sky-200 shadow-[0_24px_70px_rgba(11,123,189,0.14)]",
                )}
              >
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl tracking-[-0.03em] text-slate-950">
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
                    <div className="portal-soft-metric rounded-[1.45rem] p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Sandbox projects
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {sandboxCount}
                      </p>
                    </div>
                    <div className="portal-soft-metric rounded-[1.45rem] p-4">
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
                      className="rounded-2xl border-slate-200 bg-white/90 px-4 shadow-sm hover:border-sky-200 hover:bg-sky-50"
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
          <Card className="portal-shell-card rounded-[1.8rem] border-dashed border-slate-300 bg-white/70 lg:col-span-2 xl:col-span-3">
            <CardContent className="pt-6 text-sm text-slate-600">
              No accessible tenant memberships are attached to this account yet.
            </CardContent>
          </Card>
        )}
      </section>
    );
  }

  if (activeSubview === "invites") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] bg-white/92">
          <CardHeader className="gap-3">
            <CardTitle className="tracking-[-0.03em] text-slate-950">
              Pending invites
            </CardTitle>
            <CardDescription>
              Invite status visible from the aggregated portal overview.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {currentTenant ? (
              <form
                onSubmit={handleCreateTenantInvite}
                className="portal-soft-metric grid gap-4 rounded-[1.75rem] p-4"
              >
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">Invite email</Label>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    placeholder="new-operator@tenant.example"
                    className="portal-field rounded-2xl"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="invite-role">Tenant role</Label>
                  <select
                    id="invite-role"
                    name="role"
                    defaultValue="tenant_operator"
                    className="portal-select flex h-10 rounded-2xl bg-white px-3 text-sm outline-none transition"
                  >
                    {saasTenantRoleValues.map((role) => (
                      <option key={role} value={role}>
                        {TENANT_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.18)]"
                    disabled={isPending}
                  >
                    Send invite
                  </Button>
                </div>
              </form>
            ) : null}

            {createdInvite ? (
              <div className="portal-banner rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-4">
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
                      className="rounded-xl border-emerald-200 bg-white/90"
                      onClick={() => {
                        handleCopyInviteLink();
                      }}
                    >
                      Copy link
                    </Button>
                    <Button asChild size="sm" className="rounded-xl">
                      <a
                        href={createdInvite.inviteUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open link
                      </a>
                    </Button>
                  </div>
                </div>
                <pre className="portal-code-surface mt-3 overflow-x-auto rounded-[1.2rem] p-3 text-xs text-emerald-200">
                  <code>{createdInvite.inviteUrl}</code>
                </pre>
              </div>
            ) : null}

            {currentTenantInvites.length > 0 ? (
              currentTenantInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="portal-soft-metric rounded-[1.5rem] p-4"
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
                          className="rounded-xl border-slate-200 bg-white/90 hover:border-rose-200 hover:bg-rose-50"
                          onClick={() => {
                            handleRevokeInvite(invite);
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
      </section>
    );
  }

  if (activeSubview === "risk") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-3 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <CardTitle className="text-white tracking-[-0.04em]">
              Risk and tenant links
            </CardTitle>
            <CardDescription>
              Read-only operational context already exposed by the overview
              payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="portal-kpi-card rounded-[1.45rem] p-4">
              <p className="text-sm font-medium text-white">
                Active agent controls
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {agentControls.length > 0
                  ? `${agentControls.length} control(s) active for this tenant.`
                  : "No agent controls are currently attached to this tenant."}
              </p>
            </div>
            <div className="portal-kpi-card rounded-[1.45rem] p-4">
              <p className="text-sm font-medium text-white">Tenant links</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {currentTenantLinks.length > 0
                  ? `${currentTenantLinks.length} tenant link relationship(s) are visible.`
                  : "No tenant link relationships are visible for the selected tenant."}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <Card className="portal-shell-card-strong portal-fade-up portal-fade-up-delay-1 overflow-hidden rounded-[2rem] bg-white/94">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
              Tenant access
            </Badge>
            {currentTenant ? (
              <Badge className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white">
                {currentTenant.tenant.name}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="tracking-[-0.04em] text-slate-950">
            Membership and project inventory
          </CardTitle>
          <CardDescription>
            Current-tenant membership coverage plus the projects exposed by
            the signed-in operator profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {currentTenant ? (
            <form
              onSubmit={handleSaveMembership}
              className="portal-soft-metric grid gap-4 rounded-[1.75rem] p-4 md:grid-cols-[1.1fr_0.9fr_auto]"
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
                  className="portal-field rounded-2xl"
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
                  className="portal-select flex h-10 rounded-2xl bg-white px-3 text-sm outline-none transition"
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
                <Button
                  type="submit"
                  className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.18)]"
                  disabled={isPending}
                >
                  Save membership
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-[1.7rem] border border-slate-200/90 bg-white/92 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
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
                    <TableRow
                      key={membership.id}
                      className="hover:bg-sky-50/40"
                    >
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
                      <TableCell>
                        {TENANT_ROLE_LABELS[membership.role]}
                      </TableCell>
                      <TableCell>
                        {formatDate(membership.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl border-slate-200 bg-white/90 hover:border-rose-200 hover:bg-rose-50"
                            onClick={() => {
                              handleDeleteMembership(membership);
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
          </div>

          <div className="grid gap-4">
            {tenantProjects.length > 0 ? (
              tenantProjects.map((project) => (
                <div
                  key={project.id}
                  className="portal-shell-card rounded-[1.75rem] bg-white/92 p-4"
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
                        className="portal-soft-metric rounded-[1.15rem] p-3"
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
    </section>
  );
}
