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
import type { PortalSelection } from "@/modules/portal/lib/portal";

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
  overviewUiCopy,
  sandboxProjectId,
}: KeysPageProps) {
  return (
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
              <Button
                type="submit"
                disabled={!isHydrated || !currentProjectId || isPending}
              >
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
}
