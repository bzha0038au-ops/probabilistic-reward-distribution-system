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
import type { PortalSelection } from "@/modules/portal/lib/portal";

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
}: TenantsPageProps) {
  return (
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
                          handleCopyInviteLink();
                        }}
                      >
                        Copy link
                      </Button>
                      <Button asChild size="sm">
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
}
