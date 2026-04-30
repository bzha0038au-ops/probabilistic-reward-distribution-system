import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PortalSelection } from "@/modules/portal/lib/portal";

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
};

export function PortalDashboardUsagePage({
  currentProject,
  currentProjectObservability,
  currentProjectUsage,
}: UsagePageProps) {
  return (
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
}
