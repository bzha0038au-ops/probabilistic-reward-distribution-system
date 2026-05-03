import type { FormEventHandler } from "react";

import type { SaasApiKey } from "@reward/shared-types/saas";

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
import type {
  PortalKeysSubview,
  PortalSelection,
} from "@/modules/portal/lib/portal";

import {
  API_KEY_SCOPE_OPTIONS,
  formatDate,
  formatWindow,
  type OverviewUiCopy,
} from "./shared";

type KeysPageProps = {
  currentProject: PortalSelection["currentProject"];
  currentProjectId: number | null;
  currentProjectKeys: PortalSelection["currentProjectKeys"];
  handleIssueKey: FormEventHandler<HTMLFormElement>;
  handleIssueSandboxStarterKey: () => void;
  handleRevokeKey: (apiKey: SaasApiKey) => void;
  handleRotateKey: (apiKey: SaasApiKey) => void;
  handleSelectSandboxProject: () => void;
  isHydrated: boolean;
  isPending: boolean;
  keysSubview: PortalKeysSubview | null;
  overviewUiCopy: OverviewUiCopy;
  sandboxProjectId: number | null;
};

export function PortalDashboardKeysPage({
  currentProject,
  currentProjectId,
  currentProjectKeys,
  handleIssueKey,
  handleIssueSandboxStarterKey,
  handleRevokeKey,
  handleRotateKey,
  handleSelectSandboxProject,
  isHydrated,
  isPending,
  keysSubview,
  overviewUiCopy,
  sandboxProjectId,
}: KeysPageProps) {
  const activeSubview = keysSubview ?? "management";

  if (activeSubview === "guardrails") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Quota guardrails
              </Badge>
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Current project
              </Badge>
            </div>
            <CardTitle className="text-white tracking-[-0.04em]">
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
                className="portal-kpi-card rounded-[1.45rem] p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    );
  }

  if (activeSubview === "handoff") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card portal-fade-up portal-fade-up-delay-3 overflow-hidden rounded-[2rem] bg-white/92">
          <CardHeader className="gap-3">
            <CardTitle className="tracking-[-0.03em] text-slate-950">
              Key handoff notes
            </CardTitle>
            <CardDescription>
              Project-scoped secrets should stay aligned to the selected
              environment and deployment workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-6 text-slate-600">
            <div className="portal-banner rounded-[1.5rem] border border-sky-100 bg-sky-50/75 p-4">
              <p>
                Use sandbox keys against sandbox projects and rotate them after
                deployment or any credential exposure drill.
              </p>
            </div>
            <p>
              The portal only shows a fresh secret in the issue or rotation
              response. After that, storage drops back to the masked prefix.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white/90 px-4 shadow-sm hover:border-sky-200 hover:bg-sky-50"
                disabled={!sandboxProjectId || isPending}
                onClick={handleSelectSandboxProject}
              >
                {overviewUiCopy.sandbox.focusActionLabel}
              </Button>
              <Button
                type="button"
                className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.22)]"
                disabled={!sandboxProjectId || isPending}
                onClick={handleIssueSandboxStarterKey}
              >
                {overviewUiCopy.sandbox.issueStarterKeyLabel}
              </Button>
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
              Project-scoped secrets
            </Badge>
            {currentProject ? (
              <Badge className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white">
                {currentProject.name} · {currentProject.environment}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="tracking-[-0.04em] text-slate-950">
            API key management
          </CardTitle>
          <CardDescription>
            Generate, rotate, and revoke project keys without entering the
            internal admin plane.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={handleIssueKey}
            className="portal-soft-metric grid gap-4 rounded-[1.7rem] p-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="key-label">Key label</Label>
              <Input
                id="key-label"
                name="label"
                placeholder="Production server"
                className="portal-field rounded-2xl"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="key-expiry">Expiry</Label>
              <Input
                id="key-expiry"
                name="expiresAt"
                type="datetime-local"
                className="portal-field rounded-2xl"
              />
            </div>

            <div className="grid gap-2">
              <Label>Scopes</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {API_KEY_SCOPE_OPTIONS.map((scope) => (
                  <label
                    key={scope}
                    className="portal-hover-rise flex items-center gap-3 rounded-[1.1rem] border border-slate-200/90 bg-white/92 px-3 py-2 text-sm text-slate-700"
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
              <Button
                type="submit"
                className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.22)]"
                disabled={!isHydrated || !currentProjectId || isPending}
              >
                Issue key
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-[1.7rem] border border-slate-200/90 bg-white/92 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
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
                    <TableRow key={apiKey.id} className="hover:bg-sky-50/40">
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
                                className="rounded-xl border-slate-200 bg-white/90 hover:border-sky-200 hover:bg-sky-50"
                                onClick={() => {
                                  handleRotateKey(apiKey);
                                }}
                                disabled={!isHydrated || isPending}
                              >
                                Rotate
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl border-slate-200 bg-white/90 hover:border-rose-200 hover:bg-rose-50"
                                onClick={() => {
                                  handleRevokeKey(apiKey);
                                }}
                                disabled={!isHydrated || isPending}
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
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
