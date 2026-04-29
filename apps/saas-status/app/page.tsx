import type {
  SaasStatusLevel,
  SaasStatusMinute,
} from '@reward/shared-types/saas-status';

import { loadPublicSaasStatusPage } from '@/lib/status';

export const revalidate = 60;

const STATUS_COPY: Record<
  SaasStatusLevel,
  {
    label: string;
    badgeClassName: string;
    glowClassName: string;
  }
> = {
  operational: {
    label: 'Operational',
    badgeClassName:
      'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    glowClassName:
      'shadow-[0_0_0_1px_rgba(52,211,153,0.18),0_20px_50px_rgba(6,95,70,0.22)]',
  },
  degraded: {
    label: 'Degraded',
    badgeClassName: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    glowClassName:
      'shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_20px_50px_rgba(146,64,14,0.22)]',
  },
  outage: {
    label: 'Outage',
    badgeClassName: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
    glowClassName:
      'shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_20px_50px_rgba(127,29,29,0.24)]',
  },
};

const formatPercent = (value: number, digits = 2) =>
  `${value.toFixed(digits)}%`;
const formatMs = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`
    : `${value}ms`;
const formatCount = (value: number) =>
  new Intl.NumberFormat('en-US').format(value);

const formatUtcDateTime = (value: string | Date | null) => {
  if (!value) {
    return 'Unavailable';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
};

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-').map((part) => Number(part));
  if (!year || !month) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const getHistoryCellClassName = (status: SaasStatusLevel) => {
  switch (status) {
    case 'outage':
      return 'bg-rose-300 shadow-[0_0_0_1px_rgba(251,113,133,0.4)]';
    case 'degraded':
      return 'bg-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]';
    default:
      return 'bg-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.4)]';
  }
};

function StatusBadge({ status }: { status: SaasStatusLevel }) {
  const tone = STATUS_COPY[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${tone.badgeClassName}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {tone.label}
    </span>
  );
}

function MetricCard({
  eyebrow,
  title,
  value,
  detail,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/8 bg-white/5 p-5 backdrop-blur">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-sm text-slate-200">{title}</h2>
      <p className="mt-4 font-mono text-3xl text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </article>
  );
}

function HistoryCell({ minute }: { minute: SaasStatusMinute }) {
  return (
    <div
      className={`h-7 rounded-xl ${getHistoryCellClassName(minute.overallStatus)}`}
      title={`${formatUtcDateTime(minute.minuteStart)} UTC\nstatus: ${STATUS_COPY[minute.overallStatus].label}\nerror rate: ${formatPercent(minute.errorRatePct, 2)}\napi p95: ${formatMs(minute.apiP95Ms)}\nworker lag: ${formatMs(minute.workerLagMs)}`}
    />
  );
}

export default async function Home() {
  const { data, error } = await loadPublicSaasStatusPage();

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
        <section className="w-full rounded-[2rem] border border-rose-400/20 bg-slate-950/70 p-8 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur">
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-rose-200/75">
            Reward SaaS Status
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Public status data is temporarily unavailable.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            The static status site rendered successfully, but the backend status
            endpoint did not return a valid payload.
          </p>
          <div className="mt-8 rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">
              Last load error
            </p>
            <p className="mt-3 font-mono text-sm leading-7 text-rose-100">
              {error ?? 'Unknown error'}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const tone = STATUS_COPY[data.summary.currentStatus];
  const latestMinute = data.recentMinutes[data.recentMinutes.length - 1] ?? null;
  const recentIssues = data.recentMinutes.filter(
    (minute) => minute.overallStatus !== 'operational'
  );

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,1))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-10 lg:px-12">
        <section
          className={`overflow-hidden rounded-[2rem] border border-white/8 bg-slate-950/75 p-8 backdrop-blur xl:p-10 ${tone.glowClassName}`}
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[0.72rem] uppercase tracking-[0.28em] text-cyan-100/70">
                Reward SaaS Status
              </p>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
                Public runtime health for the prize engine control plane.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Minute-level API latency, error-rate compliance, worker backlog,
                and month-to-date SLA for the B-side reward engine.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <StatusBadge status={data.summary.currentStatus} />
              <p className="text-sm text-slate-300">
                Last sampled {formatUtcDateTime(data.summary.latestMinuteStart)} UTC
              </p>
              <p className="text-sm text-slate-400">
                Generated {formatUtcDateTime(data.summary.generatedAt)} UTC
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <MetricCard
            eyebrow="Current Window"
            title="Overall status"
            value={STATUS_COPY[data.summary.currentStatus].label}
            detail={`Worst observed minute across the last ${data.summary.currentWindowMinutes} minutes.`}
          />
          <MetricCard
            eyebrow="API SLI"
            title="Error rate (1h)"
            value={formatPercent(data.summary.availabilityErrorRatePctLastHour, 2)}
            detail={`Eligible requests: ${formatCount(
              data.summary.availabilityEligibleRequestsLastHour
            )}. Warning threshold ${formatPercent(
              data.thresholds.apiErrorRatePct.degraded,
              0
            )}.`}
          />
          <MetricCard
            eyebrow="API Latency"
            title="Peak P95 (1h)"
            value={formatMs(data.summary.peakApiP95MsLastHour)}
            detail={`Warning threshold ${formatMs(
              data.thresholds.apiP95Ms.degraded
            )}, outage threshold ${formatMs(data.thresholds.apiP95Ms.outage)}.`}
          />
          <MetricCard
            eyebrow="Worker Backlog"
            title="Current lag"
            value={formatMs(data.summary.workerLagMsCurrent)}
            detail={`Warning threshold ${formatMs(
              data.thresholds.workerLagMs.degraded
            )}, outage threshold ${formatMs(data.thresholds.workerLagMs.outage)}.`}
          />
          <MetricCard
            eyebrow="Monthly SLA"
            title={formatMonthLabel(data.monthlySla.month)}
            value={formatPercent(data.monthlySla.actualPct, 3)}
            detail={`Observed ${formatCount(
              data.monthlySla.observedMinutes
            )} of ${formatCount(data.monthlySla.elapsedMinutes)} elapsed minutes (${formatPercent(
              data.monthlySla.coveragePct,
              2
            )} coverage). Target ${formatPercent(
              data.monthlySla.targetPct,
              1
            )}.`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <article className="rounded-[2rem] border border-white/8 bg-slate-950/70 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">
                  Recent history
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Last {data.recentMinutes.length} sampled minutes
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  Operational
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  Degraded
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                  Outage
                </span>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-15">
              {data.recentMinutes.map((minute) => (
                <HistoryCell
                  key={`${minute.minuteStart}`}
                  minute={minute}
                />
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <MetricCard
                eyebrow="Latest minute"
                title="Requests"
                value={formatCount(latestMinute?.totalRequestCount ?? 0)}
                detail={`Latest sampled minute started ${formatUtcDateTime(
                  latestMinute?.minuteStart ?? null
                )} UTC.`}
              />
              <MetricCard
                eyebrow="Latest minute"
                title="API P95"
                value={formatMs(latestMinute?.apiP95Ms ?? 0)}
                detail={`Current API status is ${STATUS_COPY[
                  latestMinute?.apiStatus ?? 'operational'
                ].label.toLowerCase()}.`}
              />
              <MetricCard
                eyebrow="Latest minute"
                title="Worker lag"
                value={formatMs(latestMinute?.workerLagMs ?? 0)}
                detail={`Current worker status is ${STATUS_COPY[
                  latestMinute?.workerStatus ?? 'operational'
                ].label.toLowerCase()}.`}
              />
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/8 bg-slate-950/70 p-6 backdrop-blur">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">
              Month to date
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              SLA breakdown
            </h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
                <p className="text-sm text-slate-300">Operational minutes</p>
                <p className="mt-2 font-mono text-2xl text-white">
                  {formatCount(data.monthlySla.operationalMinutes)}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
                <p className="text-sm text-slate-300">Degraded minutes</p>
                <p className="mt-2 font-mono text-2xl text-amber-100">
                  {formatCount(data.monthlySla.degradedMinutes)}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
                <p className="text-sm text-slate-300">Outage minutes</p>
                <p className="mt-2 font-mono text-2xl text-rose-100">
                  {formatCount(data.monthlySla.outageMinutes)}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
                <p className="text-sm text-slate-300">Tracking started</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  {formatUtcDateTime(data.monthlySla.trackingStartedAt)} UTC
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-[1.4rem] border border-white/8 bg-gradient-to-br from-cyan-400/10 to-transparent p-4">
              <p className="text-sm leading-7 text-slate-300">
                {recentIssues.length > 0
                  ? `${formatCount(recentIssues.length)} non-operational sampled minutes were detected in the recent history window.`
                  : 'No degraded or outage minutes were detected in the recent history window.'}
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
