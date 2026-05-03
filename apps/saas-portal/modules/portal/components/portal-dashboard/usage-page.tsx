import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  PortalSelection,
  PortalUsageSubview,
} from "@/modules/portal/lib/portal";

import {
  formatDate,
  formatPercent,
  formatSignedDelta,
  formatWindow,
  getDistributionBarWidth,
  getDriftTone,
} from "./shared";

type UsagePageProps = {
  currentProject: PortalSelection["currentProject"];
  currentProjectObservability: PortalSelection["currentProjectObservability"];
  currentProjectUsage: PortalSelection["currentProjectUsage"];
  usageSubview: PortalUsageSubview | null;
};

export function PortalDashboardUsagePage({
  currentProject,
  currentProjectObservability,
  currentProjectUsage,
  usageSubview,
}: UsagePageProps) {
  const activeSubview = usageSubview ?? "overview";

  if (activeSubview === "quota") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Distribution
              </Badge>
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                30-day window
              </Badge>
            </div>
            <CardTitle className="tracking-[-0.04em] text-white">
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
                      className="portal-kpi-card rounded-[1.45rem] p-4"
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

                <div className="portal-kpi-card rounded-[1.5rem] p-4 text-sm leading-6 text-slate-300">
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
                        className="portal-kpi-card rounded-[1.5rem] p-4"
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
                            <div className="portal-progress-track mt-2 h-2 bg-white/10">
                              <div
                                className="portal-progress-fill h-2 rounded-full"
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
                            <div className="portal-progress-track mt-2 h-2 bg-white/10">
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
    );
  }

  return (
    <section className="grid gap-6">
      <Card className="portal-shell-card-strong portal-fade-up portal-fade-up-delay-1 overflow-hidden rounded-[2rem] bg-white/94">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
              Project observability
            </Badge>
            {currentProject ? (
              <Badge className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white">
                {currentProject.name} · {currentProject.environment}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="tracking-[-0.04em] text-slate-950">
            Usage and quota
          </CardTitle>
          <CardDescription>
            Read current aggregate quota pressure from active keys and inspect
            the latest metered events.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {currentProject ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
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
                    className="portal-soft-metric rounded-[1.45rem] p-4"
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

              <div className="portal-banner rounded-[1.55rem] border border-sky-100 bg-sky-50/75 p-4">
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
                      className="portal-soft-metric rounded-[1.45rem] p-4"
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
  );
}
