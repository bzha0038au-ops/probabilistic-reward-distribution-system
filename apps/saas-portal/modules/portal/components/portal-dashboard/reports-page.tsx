import type { FormEventHandler } from "react";

import type { SaasReportExportJob } from "@reward/shared-types/saas";

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
  REPORT_FORMAT_OPTIONS,
  REPORT_RESOURCE_OPTIONS,
  formatDate,
  getDefaultReportFromAt,
  getDefaultReportToAt,
  getReportStatusTone,
} from "./shared";

type ReportsPageProps = {
  currentTenant: PortalSelection["currentTenant"];
  handleQueueReportExport: FormEventHandler<HTMLFormElement>;
  hasPendingReportExports: boolean;
  isHydrated: boolean;
  isPending: boolean;
  refreshOverview: () => void;
  reportsError: string | null;
  tenantProjects: PortalSelection["tenantProjects"];
  visibleReportExports: SaasReportExportJob[];
};

export function PortalDashboardReportsPage({
  currentTenant,
  handleQueueReportExport,
  hasPendingReportExports,
  isHydrated,
  isPending,
  refreshOverview,
  reportsError,
  tenantProjects,
  visibleReportExports,
}: ReportsPageProps) {
  return (
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
                  <Button type="submit" disabled={!isHydrated || isPending}>
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
              disabled={!isHydrated || isPending}
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
}
