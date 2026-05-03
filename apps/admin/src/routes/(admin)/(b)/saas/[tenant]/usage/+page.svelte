<script lang="ts">
  import { page } from "$app/stores"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  import TenantUsageModuleTabs from "./tenant-usage-module-tabs.svelte"
  import type { PageData } from "./page-support"

  let { data }: { data: PageData } = $props()

  const usage = $derived(data.usage)
  const actionError = $derived(
    ($page.form?.error as string | undefined) ?? null,
  )
  const thresholdDraftCreated = $derived(
    Boolean($page.form?.thresholdDraftCreated),
  )
  const minuteQps = $derived(usage?.minuteQps ?? [])
  const payoutHistogram = $derived(usage?.payoutHistogram ?? [])
  const maxRequestCount = $derived(
    Math.max(1, ...minuteQps.map((bucket) => bucket.requestCount)),
  )
  const maxHistogramCount = $derived(
    Math.max(1, ...payoutHistogram.map((bucket) => bucket.count)),
  )
  const blockedMinutes = $derived(
    [...minuteQps]
      .filter((bucket) => bucket.antiExploitBlockedCount > 0)
      .sort((left, right) => {
        if (right.antiExploitBlockedCount !== left.antiExploitBlockedCount) {
          return right.antiExploitBlockedCount - left.antiExploitBlockedCount
        }

        return (
          new Date(right.minuteStart).getTime() -
          new Date(left.minuteStart).getTime()
        )
      })
      .slice(0, 8),
  )
  const activeAlertCount = $derived(
    Number(Boolean(usage?.alerts.qps.active)) +
      Number(Boolean(usage?.alerts.payout.active)) +
      Number(Boolean(usage?.alerts.antiExploit.active)),
  )
  const activeModule = $derived.by(() => {
    if ($page.url.pathname.endsWith("/overview")) return "overview"
    if ($page.url.pathname.endsWith("/distribution")) return "distribution"
    if ($page.url.pathname.endsWith("/thresholds")) return "thresholds"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isOverviewModule = $derived(activeModule === "overview")
  const isDistributionModule = $derived(activeModule === "distribution")
  const isThresholdsModule = $derived(activeModule === "thresholds")
  const thresholdRows = $derived(
    usage
      ? [
          {
            label: "QPS alert",
            active: usage.alerts.qps.active,
            helper: "Peak minute traffic ceiling",
            unit: "qps",
            currentValue: Number(usage.alerts.qps.current),
            thresholdValue: Number(usage.alerts.qps.threshold),
            current: formatNumber(usage.alerts.qps.current),
            threshold: formatNumber(usage.alerts.qps.threshold),
          },
          {
            label: "Payout alert",
            active: usage.alerts.payout.active,
            helper: "Largest single payout in active review window",
            unit: "amount",
            currentValue: Number(usage.alerts.payout.current),
            thresholdValue: Number(usage.alerts.payout.threshold),
            current: formatNumber(usage.alerts.payout.current),
            threshold: formatNumber(usage.alerts.payout.threshold),
          },
          {
            label: "Anti-exploit alert",
            active: usage.alerts.antiExploit.active,
            helper: "Blocked request rate against live traffic",
            unit: "percent",
            currentValue: Number(usage.alerts.antiExploit.current),
            thresholdValue: Number(usage.alerts.antiExploit.threshold),
            current: formatPct(usage.alerts.antiExploit.current),
            threshold: formatPct(usage.alerts.antiExploit.threshold),
          },
        ]
      : [],
  )
  const usageModules = $derived.by(() => {
    if (!usage) return []

    return [
      {
        href: `/saas/${usage.tenant.slug}/usage/overview`,
        eyebrow: "Realtime Usage",
        title: "Overview",
        description:
          "Minute-level QPS and tenant runtime context stay on one operational surface.",
        badge: formatNumber(usage.summary.maxMinuteQps),
      },
      {
        href: `/saas/${usage.tenant.slug}/usage/distribution`,
        eyebrow: "Distribution Lens",
        title: "Distribution",
        description:
          "Histogram, hotspot queue and live alert envelope move into a separate analysis view.",
        badge: `${blockedMinutes.length}`,
      },
      {
        href: `/saas/${usage.tenant.slug}/usage/thresholds`,
        eyebrow: "Threshold Desk",
        title: "Thresholds",
        description:
          "Threshold tuning and active alert state split away from telemetry charts.",
        badge: `${activeAlertCount}`,
      },
    ]
  })
  const peakMinuteBucket = $derived.by(() => {
    if (minuteQps.length === 0) return null
    return minuteQps.reduce((highest, bucket) =>
      bucket.requestCount > highest.requestCount ? bucket : highest,
    )
  })
  const nonZeroHistogramBucketCount = $derived(
    payoutHistogram.filter((bucket) => bucket.count > 0).length,
  )
  const headroomRows = $derived(
    thresholdRows.map((alert) => ({
      ...alert,
      utilization: progressToThreshold(
        alert.currentValue,
        alert.thresholdValue,
      ),
      remaining: alert.thresholdValue - alert.currentValue,
    })),
  )

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString()
  }

  const formatTime = (value: string | Date) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "—"
    return parsed.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatNumber(value: number | string) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })
  }

  function formatPct(value: number | string) {
    return `${Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}%`
  }

  function formatDelta(value: number) {
    const sign = value > 0 ? "+" : ""
    return `${sign}${Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`
  }

  function progressToThreshold(currentValue: number, thresholdValue: number) {
    if (!Number.isFinite(currentValue) || !Number.isFinite(thresholdValue)) {
      return 0
    }
    if (thresholdValue <= 0) {
      return currentValue > 0 ? 100 : 0
    }
    return Math.max(0, Math.min(100, (currentValue / thresholdValue) * 100))
  }
</script>

{#snippet headerActions()}
  <a href="/saas" class="btn btn-outline btn-sm">Back to SaaS overview</a>
{/snippet}

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · saasOps"
    eyebrow="Business"
    title={usage?.tenant.name ?? "Tenant Usage"}
    description="分钟级 QPS、24 小时 payout 分布、anti-exploit 拦截率和 usage alert threshold 拆成多个 tenant runtime 模块，不再堆在同一屏。"
    actions={headerActions}
  />

  {#if usage}
    <TenantUsageModuleTabs tenantSlug={usage.tenant.slug} />
  {/if}

  {#if data.error}
    <div class="alert alert-error text-sm">{data.error}</div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">{actionError}</div>
  {/if}

  {#if thresholdDraftCreated}
    <div class="alert alert-success text-sm">
      告警阈值草稿已保存，后续仍需走审批 / 发布流程。
    </div>
  {/if}

  {#if usage}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-6"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Requests 60m
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {formatNumber(usage.summary.totalRequests)}
          </p>
          <p class="text-sm text-slate-500">
            Observed request volume in the active window.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Blocked 60m
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {formatNumber(usage.summary.antiExploitBlockedRequests)}
          </p>
          <p class="text-sm text-slate-500">
            Requests intercepted by anti-exploit policy.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Hit Rate
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {formatPct(usage.summary.antiExploitRatePct)}
          </p>
          <p class="text-sm text-slate-500">
            Anti-exploit hit rate across the realtime bucket set.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Peak QPS
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {formatNumber(usage.summary.maxMinuteQps)}
          </p>
          <p class="text-sm text-slate-500">
            Highest minute-level QPS in the current horizon.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Payouts 24h
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {formatNumber(usage.summary.payoutCount)}
          </p>
          <p class="text-sm text-slate-500">
            Issued payout events in the histogram window.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Max Payout
          </p>
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {usage.summary.maxSinglePayoutAmount}
          </p>
          <p class="text-sm text-slate-500">
            Largest single payout seen in the current review set.
          </p>
        </div>
      </article>
    </section>

    {#if isHubModule}
      <section class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Tenant Usage Drawer
            </p>
            <h2
              class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
            >
              分域操作入口
            </h2>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            Usage 根页现在只保留摘要和模块入口。进入具体模块，再分别处理
            realtime overview、distribution analysis 和 threshold tuning。
          </p>

          <div class="grid gap-4 lg:grid-cols-3">
            {#each usageModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]"
                    >arrow_forward</span
                  >
                </div>
              </a>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    {#if isOverviewModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1.34fr)_minmax(320px,0.8fr)]"
      >
        <div class="min-w-0 space-y-6">
          <section class="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Telemetry Snapshot
                  </p>
                  <h2 class="card-title mt-2">Current Baseline</h2>
                  <p class="text-sm text-slate-500">
                    把 usage realtime
                    里的核心读数先压成一组基线，再决定是否需要进入更深的分布或阈值模块。
                  </p>
                </div>

                <dl class="grid gap-3 md:grid-cols-2">
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Peak minute
                    </dt>
                    <dd
                      class="mt-2 text-lg font-semibold text-[var(--admin-ink)]"
                    >
                      {peakMinuteBucket
                        ? `${formatTime(peakMinuteBucket.minuteStart)} · ${formatNumber(peakMinuteBucket.requestCount)}`
                        : "—"}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Blocked requests
                    </dt>
                    <dd
                      class="mt-2 text-lg font-semibold text-[var(--admin-ink)]"
                    >
                      {formatNumber(usage.summary.antiExploitBlockedRequests)}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Active alerts
                    </dt>
                    <dd
                      class="mt-2 text-lg font-semibold text-[var(--admin-ink)]"
                    >
                      {activeAlertCount}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Total payouts
                    </dt>
                    <dd
                      class="mt-2 text-lg font-semibold text-[var(--admin-ink)]"
                    >
                      {usage.summary.totalPayoutAmount}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>

            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Project Footprint
                  </p>
                  <h2 class="card-title mt-2">Runtime Allocation</h2>
                  <p class="text-sm text-slate-500">
                    先明确当前 tenant 下面有哪些 project 正在参与统计，再回头看
                    QPS 抬升是否合理。
                  </p>
                </div>

                <div class="space-y-3">
                  {#each usage.projects as project}
                    <div
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <p class="font-medium text-[var(--admin-ink)]">
                          {project.name}
                        </p>
                        <span class="badge badge-outline">
                          {project.environment}
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </article>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
              >
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Realtime Usage
                  </p>
                  <h2 class="card-title mt-2">Minute-level QPS</h2>
                  <p class="text-sm text-slate-500">
                    近 {usage.windows.realtimeMinutes} 分钟请求条形图，琥珀色代表被
                    anti-exploit 拦截的流量。
                  </p>
                </div>
                <p class="text-sm text-slate-500">
                  last request {formatDate(usage.summary.lastRequestAt)}
                </p>
              </div>

              <div class="flex h-56 items-end gap-1">
                {#each minuteQps as bucket, index}
                  <div class="group flex h-full flex-1 flex-col justify-end">
                    <div class="relative flex-1 rounded-t-2xl bg-slate-100">
                      {#if bucket.requestCount > 0}
                        <div
                          class="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[var(--admin-primary)]/35"
                          style={`height:${Math.max(
                            6,
                            (bucket.requestCount / maxRequestCount) * 100,
                          )}%`}
                        ></div>
                      {/if}
                      {#if bucket.antiExploitBlockedCount > 0}
                        <div
                          class="absolute inset-x-0 bottom-0 rounded-t-2xl bg-amber-500"
                          style={`height:${Math.max(
                            6,
                            (bucket.antiExploitBlockedCount / maxRequestCount) *
                              100,
                          )}%`}
                        ></div>
                      {/if}
                    </div>
                    <div class="mt-2 min-h-8">
                      {#if index % 10 === 0 || index === minuteQps.length - 1}
                        <p class="text-center text-[10px] text-slate-400">
                          {formatTime(bucket.minuteStart)}
                        </p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>

              <div
                class="flex flex-wrap items-center gap-4 text-xs text-slate-500"
              >
                <span>blue: total requests</span>
                <span>amber: anti-exploit blocked</span>
                <span>total payouts {usage.summary.totalPayoutAmount}</span>
              </div>
            </div>
          </section>
        </div>

        <aside
          class="admin-rail admin-rail--early-xl space-y-6 xl:sticky xl:top-24 xl:self-start"
        >
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Tenant Envelope
                </p>
                <h2 class="card-title mt-2">Runtime Context</h2>
                <p class="text-sm text-slate-500">
                  Current tenant posture, project footprint, and alert exposure.
                </p>
              </div>

              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-outline">{usage.tenant.slug}</span>
                  <span class="badge badge-outline">{usage.tenant.status}</span>
                  <span
                    class={`badge ${activeAlertCount > 0 ? "badge-error" : "badge-success"}`}
                  >
                    {activeAlertCount > 0
                      ? `${activeAlertCount} active alert${activeAlertCount > 1 ? "s" : ""}`
                      : "No active alerts"}
                  </span>
                </div>
                <dl class="mt-4 space-y-3 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Projects</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {usage.projects.length}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Last request</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {formatDate(usage.summary.lastRequestAt)}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Total payouts</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {usage.summary.totalPayoutAmount}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Threshold Headroom
                </p>
                <h2 class="card-title mt-2">Realtime vs Guardrail</h2>
                <p class="text-sm text-slate-500">
                  这里直接看 overview 读数距离 threshold
                  还有多少空间，不必先切去 thresholds。
                </p>
              </div>

              <div class="space-y-3">
                {#each headroomRows as alert}
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-medium text-[var(--admin-ink)]">
                        {alert.label}
                      </p>
                      <span
                        class={`badge ${alert.active ? "badge-error" : "badge-outline"}`}
                      >
                        {Math.round(alert.utilization)}%
                      </span>
                    </div>
                    <div
                      class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                    >
                      <div
                        class={`h-full rounded-full ${alert.active ? "bg-rose-500" : "bg-[var(--admin-primary)]"}`}
                        style={`width:${Math.max(8, alert.utilization)}%`}
                      ></div>
                    </div>
                    <p class="mt-3 text-xs text-slate-500">
                      current {alert.current} · threshold {alert.threshold} · delta
                      {formatDelta(alert.remaining)}
                    </p>
                  </div>
                {/each}
              </div>
            </div>
          </section>
        </aside>
      </section>
    {/if}

    {#if isDistributionModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_minmax(340px,0.82fr)]"
      >
        <div class="min-w-0 space-y-6">
          <section class="grid gap-4 md:grid-cols-3">
            <article class="card bg-base-100 shadow">
              <div class="card-body gap-2">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Histogram Buckets
                </p>
                <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
                  {nonZeroHistogramBucketCount}
                </p>
                <p class="text-sm text-slate-500">
                  Payout ranges with non-zero volume in the current histogram
                  window.
                </p>
              </div>
            </article>

            <article class="card bg-base-100 shadow">
              <div class="card-body gap-2">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Hotspots
                </p>
                <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
                  {blockedMinutes.length}
                </p>
                <p class="text-sm text-slate-500">
                  Minutes currently surfaced for anti-exploit hotspot review.
                </p>
              </div>
            </article>

            <article class="card bg-base-100 shadow">
              <div class="card-body gap-2">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Active Alerts
                </p>
                <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
                  {activeAlertCount}
                </p>
                <p class="text-sm text-slate-500">
                  Thresholds currently crossed by live usage values.
                </p>
              </div>
            </article>
          </section>

          <section class="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div
                  class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Distribution Lens
                    </p>
                    <h2 class="card-title mt-2">Payout Histogram</h2>
                    <p class="text-sm text-slate-500">
                      近 {usage.windows.payoutHistogramHours} 小时按单次 payout 金额分桶。
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2 text-xs text-slate-500">
                    {#each usage.projects as project}
                      <span class="badge badge-outline">
                        {project.name} · {project.environment}
                      </span>
                    {/each}
                  </div>
                </div>

                <div class="space-y-4">
                  {#each payoutHistogram as bucket}
                    <div
                      class="grid grid-cols-[6rem,1fr,3rem] items-center gap-3 text-sm"
                    >
                      <span class="text-slate-600">{bucket.label}</span>
                      <div class="h-3 rounded-full bg-slate-100">
                        <div
                          class="h-3 rounded-full bg-emerald-500"
                          style={`width:${
                            bucket.count === 0
                              ? 0
                              : Math.max(
                                  8,
                                  (bucket.count / maxHistogramCount) * 100,
                                )
                          }%`}
                        ></div>
                      </div>
                      <span
                        class="text-right font-medium text-[var(--admin-ink)]"
                      >
                        {bucket.count}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            </article>

            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Hotspots
                  </p>
                  <h2 class="card-title mt-2">Blocked Minute Queue</h2>
                  <p class="text-sm text-slate-500">
                    近 {usage.windows.realtimeMinutes} 分钟里，命中 anti-exploit 最多的时间片。
                  </p>
                </div>

                <div class="space-y-3">
                  {#if blockedMinutes.length === 0}
                    <div
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
                    >
                      No blocked traffic in the current window.
                    </div>
                  {:else}
                    {#each blockedMinutes as bucket}
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <p class="font-medium text-[var(--admin-ink)]">
                            {formatTime(bucket.minuteStart)}
                          </p>
                          <span class="badge badge-warning">
                            {bucket.antiExploitBlockedCount} blocked
                          </span>
                        </div>
                        <p class="mt-1 text-sm text-slate-500">
                          total {bucket.requestCount} · QPS {formatNumber(
                            bucket.qps,
                          )} · hit rate {formatPct(bucket.antiExploitRatePct)}
                        </p>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            </article>
          </section>
        </div>

        <aside
          class="admin-rail admin-rail--early-xl space-y-6 xl:sticky xl:top-24 xl:self-start"
        >
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Alert Envelope
                </p>
                <h2 class="card-title mt-2">Current Threshold Status</h2>
                <p class="text-sm text-slate-500">
                  Compare live values with their current system_config
                  thresholds.
                </p>
              </div>

              <div class="space-y-3">
                {#each thresholdRows as alert}
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-medium text-[var(--admin-ink)]">
                        {alert.label}
                      </p>
                      <span
                        class={`badge ${alert.active ? "badge-error" : "badge-outline"}`}
                      >
                        {alert.active ? "active" : "clear"}
                      </span>
                    </div>
                    <p class="mt-2 text-sm text-slate-500">
                      current {alert.current} · threshold {alert.threshold}
                    </p>
                  </div>
                {/each}
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Project Mix
                </p>
                <h2 class="card-title mt-2">Observed Sources</h2>
                <p class="text-sm text-slate-500">
                  当前 distribution 视图涉及到的 tenant project 列表，方便对照
                  histogram 和 blocked queue。
                </p>
              </div>

              <div class="space-y-3">
                {#each usage.projects as project}
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-medium text-[var(--admin-ink)]">
                        {project.name}
                      </p>
                      <span class="badge badge-outline">
                        {project.environment}
                      </span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </section>
        </aside>
      </section>
    {/if}

    {#if isThresholdsModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]"
      >
        <div class="min-w-0 space-y-6">
          <section class="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Threshold Baseline
                  </p>
                  <h2 class="card-title mt-2">Live Exposure Snapshot</h2>
                  <p class="text-sm text-slate-500">
                    当前 tenant 的 usage
                    风险基线，用来判断阈值应该向上还是向下调。
                  </p>
                </div>

                <dl class="grid gap-3 md:grid-cols-2">
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Active alerts
                    </dt>
                    <dd
                      class="mt-2 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
                    >
                      {activeAlertCount}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Projects
                    </dt>
                    <dd
                      class="mt-2 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
                    >
                      {usage.projects.length}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Peak QPS
                    </dt>
                    <dd
                      class="mt-2 text-lg font-semibold text-[var(--admin-ink)]"
                    >
                      {formatNumber(usage.summary.maxMinuteQps)}
                    </dd>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
                  >
                    <dt
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                    >
                      Last request
                    </dt>
                    <dd
                      class="mt-2 text-sm font-medium text-[var(--admin-ink)]"
                    >
                      {formatDate(usage.summary.lastRequestAt)}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>

            <article class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Headroom
                  </p>
                  <h2 class="card-title mt-2">Threshold Utilization</h2>
                  <p class="text-sm text-slate-500">
                    当前实时值相对阈值的占用度。超过 100% 表示已经进入 alert
                    状态。
                  </p>
                </div>

                <div class="space-y-4">
                  {#each thresholdRows as alert}
                    {@const utilization = progressToThreshold(
                      alert.currentValue,
                      alert.thresholdValue,
                    )}
                    <div
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="font-medium text-[var(--admin-ink)]">
                            {alert.label}
                          </p>
                          <p class="mt-1 text-sm text-slate-500">
                            {alert.helper}
                          </p>
                        </div>
                        <span
                          class={`badge ${alert.active ? "badge-error" : "badge-outline"}`}
                        >
                          {Math.round(utilization)}%
                        </span>
                      </div>

                      <div
                        class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          class={`h-full rounded-full ${alert.active ? "bg-rose-500" : "bg-[var(--admin-primary)]"}`}
                          style={`width:${Math.max(8, utilization)}%`}
                        ></div>
                      </div>

                      <div
                        class="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500"
                      >
                        <span>current {alert.current}</span>
                        <span>threshold {alert.threshold}</span>
                        <span>
                          delta {formatDelta(
                            alert.currentValue - alert.thresholdValue,
                          )}
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </article>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Threshold Desk
                </p>
                <h2 class="card-title mt-2">Alert Thresholds</h2>
                <p class="text-sm text-slate-500">
                  全局 system_config。提交后会进入现有配置草稿审批流。
                </p>
              </div>

              <form
                method="post"
                action="?/saveAlertThresholdDraft"
                class="space-y-4"
              >
                <div class="grid gap-4 lg:grid-cols-3">
                  <section
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                    >
                      Traffic Ceiling
                    </p>
                    <p class="mt-2 text-sm text-slate-500">
                      Protect against bursty tenant traffic before runtime QPS
                      spikes.
                    </p>
                    <label class="form-control mt-4">
                      <span class="label-text mb-2">Max minute QPS</span>
                      <input
                        name="saasUsageAlertMaxMinuteQps"
                        type="number"
                        step="0.01"
                        class="input input-bordered"
                        value={usage.thresholds.maxMinuteQps}
                      />
                    </label>
                  </section>

                  <section
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                    >
                      Payout Guardrail
                    </p>
                    <p class="mt-2 text-sm text-slate-500">
                      Cap extreme single-event payout exposure before approval
                      review.
                    </p>
                    <label class="form-control mt-4">
                      <span class="label-text mb-2">Max single payout</span>
                      <input
                        name="saasUsageAlertMaxSinglePayoutAmount"
                        type="number"
                        step="0.01"
                        class="input input-bordered"
                        value={usage.thresholds.maxSinglePayoutAmount}
                      />
                    </label>
                  </section>

                  <section
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                    >
                      Exploit Rate
                    </p>
                    <p class="mt-2 text-sm text-slate-500">
                      Trigger when blocked traffic ratio indicates elevated
                      abuse pressure.
                    </p>
                    <label class="form-control mt-4">
                      <span class="label-text mb-2"
                        >Max anti-exploit hit rate (%)</span
                      >
                      <input
                        name="saasUsageAlertMaxAntiExploitRatePct"
                        type="number"
                        step="0.01"
                        class="input input-bordered"
                        value={usage.thresholds.maxAntiExploitRatePct}
                      />
                    </label>
                  </section>
                </div>

                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3 text-sm text-slate-600"
                >
                  提交后不会直接生效，而是生成一条 system config
                  draft，继续进入现有审批 / 发布链路。
                </div>

                <label class="form-control">
                  <span class="label-text mb-2">Change reason</span>
                  <textarea
                    name="reason"
                    class="textarea textarea-bordered min-h-24"
                    placeholder="Why are you tuning these SaaS abuse thresholds?"
                  ></textarea>
                </label>

                <button class="btn btn-primary w-full"
                  >Save as Config Draft</button
                >
              </form>
            </div>
          </section>
        </div>

        <aside
          class="admin-rail admin-rail--early-xl space-y-6 xl:sticky xl:top-24 xl:self-start"
        >
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Tenant Envelope
                </p>
                <h2 class="card-title mt-2">Current Runtime Context</h2>
                <p class="text-sm text-slate-500">
                  Threshold tuning should be read against the tenant's live
                  footprint.
                </p>
              </div>

              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-outline">{usage.tenant.slug}</span>
                  <span class="badge badge-outline">{usage.tenant.status}</span>
                  <span class="badge badge-outline">
                    {usage.projects.length} projects
                  </span>
                </div>
                <dl class="mt-4 space-y-3 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Last request</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {formatDate(usage.summary.lastRequestAt)}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Peak QPS</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {formatNumber(usage.summary.maxMinuteQps)}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-slate-500">Max payout</dt>
                    <dd class="text-right text-[var(--admin-ink)]">
                      {usage.summary.maxSinglePayoutAmount}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Alert Envelope
                </p>
                <h2 class="card-title mt-2">Current Threshold Status</h2>
                <p class="text-sm text-slate-500">
                  Compare live values with their current system_config
                  thresholds.
                </p>
              </div>

              <div class="space-y-3">
                {#each thresholdRows as alert}
                  {@const utilization = progressToThreshold(
                    alert.currentValue,
                    alert.thresholdValue,
                  )}
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-medium text-[var(--admin-ink)]">
                        {alert.label}
                      </p>
                      <span
                        class={`badge ${alert.active ? "badge-error" : "badge-outline"}`}
                      >
                        {alert.active ? "active" : "clear"}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate-500">{alert.helper}</p>
                    <p class="mt-2 text-sm text-slate-500">
                      current {alert.current} · threshold {alert.threshold}
                    </p>
                    <div
                      class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                    >
                      <div
                        class={`h-full rounded-full ${alert.active ? "bg-rose-500" : "bg-[var(--admin-primary)]"}`}
                        style={`width:${Math.max(8, utilization)}%`}
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Draft Protocol
                </p>
                <h2 class="card-title mt-2">Approval Path</h2>
              </div>

              <ol class="space-y-3 text-sm text-slate-600">
                <li>1. Save current values as a config draft.</li>
                <li>
                  2. Route through existing approval and publication workflow.
                </li>
                <li>
                  3. Re-check live usage against new thresholds after publish.
                </li>
              </ol>
            </div>
          </section>
        </aside>
      </section>
    {/if}
  {/if}
</div>
