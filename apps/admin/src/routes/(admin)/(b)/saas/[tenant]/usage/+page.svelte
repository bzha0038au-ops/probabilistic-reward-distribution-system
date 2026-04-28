<script lang="ts">
  import { page } from "$app/stores"
  import type { SaasTenantUsageDashboard } from "@reward/shared-types/saas"

  interface PageData {
    usage: SaasTenantUsageDashboard | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const usage = $derived(data.usage)
  const actionError = $derived(($page.form?.error as string | undefined) ?? null)
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
        if (
          right.antiExploitBlockedCount !== left.antiExploitBlockedCount
        ) {
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

  const formatNumber = (value: number | string) =>
    Number(value).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })

  const formatPct = (value: number | string) =>
    `${Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}%`
</script>

<div class="space-y-8">
  <section class="space-y-3">
    <a href="/saas" class="text-sm font-medium text-slate-500 hover:text-slate-900">
      ← Back to SaaS overview
    </a>
    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-500">
          Tenant Realtime Usage
        </p>
        <h1 class="text-3xl font-semibold text-slate-900">
          {usage?.tenant.name ?? "Tenant usage"}
        </h1>
        <p class="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          分钟级 QPS、近 24 小时 payout 分布，以及按限流拦截统计的
          anti-exploit 命中率都会汇总到这里。阈值通过 system_config 草稿流发布，不会直接热改。
        </p>
      </div>
      {#if usage}
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-outline">{usage.tenant.slug}</span>
          <span class="badge badge-outline">{usage.tenant.status}</span>
          <span class="badge badge-outline">
            projects {usage.projects.length}
          </span>
          <span
            class={`badge ${
              activeAlertCount > 0 ? "badge-error" : "badge-success"
            }`}
          >
            {activeAlertCount > 0
              ? `${activeAlertCount} active alert${activeAlertCount > 1 ? "s" : ""}`
              : "No active alerts"}
          </span>
        </div>
      {/if}
    </div>

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
  </section>

  {#if usage}
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Requests 60m</p>
        <p class="mt-3 text-3xl font-semibold">
          {formatNumber(usage.summary.totalRequests)}
        </p>
      </article>
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Blocked 60m</p>
        <p class="mt-3 text-3xl font-semibold">
          {formatNumber(usage.summary.antiExploitBlockedRequests)}
        </p>
      </article>
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Anti-exploit Hit</p>
        <p class="mt-3 text-3xl font-semibold">
          {formatPct(usage.summary.antiExploitRatePct)}
        </p>
      </article>
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Peak Minute QPS</p>
        <p class="mt-3 text-3xl font-semibold">
          {formatNumber(usage.summary.maxMinuteQps)}
        </p>
      </article>
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Payouts 24h</p>
        <p class="mt-3 text-3xl font-semibold">
          {formatNumber(usage.summary.payoutCount)}
        </p>
      </article>
      <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">Max Single Payout</p>
        <p class="mt-3 text-3xl font-semibold">
          {usage.summary.maxSinglePayoutAmount}
        </p>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      <article
        class={`rounded-3xl border p-5 shadow-sm ${
          usage.alerts.qps.active
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <p class="text-sm font-medium text-slate-500">QPS Alert</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">
          {formatNumber(usage.alerts.qps.current)}
        </p>
        <p class="mt-1 text-sm text-slate-600">
          threshold {formatNumber(usage.alerts.qps.threshold)} QPS
        </p>
      </article>
      <article
        class={`rounded-3xl border p-5 shadow-sm ${
          usage.alerts.payout.active
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <p class="text-sm font-medium text-slate-500">Payout Alert</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">
          {usage.alerts.payout.current}
        </p>
        <p class="mt-1 text-sm text-slate-600">
          threshold {usage.alerts.payout.threshold}
        </p>
      </article>
      <article
        class={`rounded-3xl border p-5 shadow-sm ${
          usage.alerts.antiExploit.active
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <p class="text-sm font-medium text-slate-500">Anti-exploit Alert</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">
          {formatPct(usage.alerts.antiExploit.current)}
        </p>
        <p class="mt-1 text-sm text-slate-600">
          threshold {formatPct(usage.alerts.antiExploit.threshold)}
        </p>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-lg font-semibold">Minute-level QPS</h2>
            <p class="text-sm text-slate-500">
              近 {usage.windows.realtimeMinutes} 分钟请求条形图，琥珀色代表被 anti-exploit 拦截的流量。
            </p>
          </div>
          <p class="text-sm text-slate-500">
            last request {formatDate(usage.summary.lastRequestAt)}
          </p>
        </div>
        <div class="mt-6 flex h-56 items-end gap-1">
          {#each minuteQps as bucket, index}
            <div class="group flex h-full flex-1 flex-col justify-end">
              <div class="relative flex-1 rounded-t-2xl bg-slate-100">
                {#if bucket.requestCount > 0}
                  <div
                    class="absolute inset-x-0 bottom-0 rounded-t-2xl bg-primary/30"
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
                      (bucket.antiExploitBlockedCount / maxRequestCount) * 100,
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
        <div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>蓝色：总请求</span>
          <span>琥珀：anti-exploit blocked</span>
          <span>total payouts {usage.summary.totalPayoutAmount}</span>
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-lg font-semibold">Alert Thresholds</h2>
        <p class="mt-1 text-sm text-slate-500">
          全局 system_config。提交后会进入现有配置草稿审批流。
        </p>
        <form method="post" action="?/saveAlertThresholdDraft" class="mt-5 space-y-3">
          <div class="form-control">
            <label class="label" for="alert-qps">
              <span class="label-text">Max minute QPS</span>
            </label>
            <input
              id="alert-qps"
              name="saasUsageAlertMaxMinuteQps"
              type="number"
              step="0.01"
              class="input input-bordered"
              value={usage.thresholds.maxMinuteQps}
            />
          </div>
          <div class="form-control">
            <label class="label" for="alert-payout">
              <span class="label-text">Max single payout</span>
            </label>
            <input
              id="alert-payout"
              name="saasUsageAlertMaxSinglePayoutAmount"
              type="number"
              step="0.01"
              class="input input-bordered"
              value={usage.thresholds.maxSinglePayoutAmount}
            />
          </div>
          <div class="form-control">
            <label class="label" for="alert-anti">
              <span class="label-text">Max anti-exploit hit rate (%)</span>
            </label>
            <input
              id="alert-anti"
              name="saasUsageAlertMaxAntiExploitRatePct"
              type="number"
              step="0.01"
              class="input input-bordered"
              value={usage.thresholds.maxAntiExploitRatePct}
            />
          </div>
          <div class="form-control">
            <label class="label" for="alert-reason">
              <span class="label-text">Change reason</span>
            </label>
            <textarea
              id="alert-reason"
              name="reason"
              class="textarea textarea-bordered min-h-24"
              placeholder="Why are you tuning these SaaS abuse thresholds?"
            ></textarea>
          </div>
          <button class="btn btn-primary w-full">Save as Config Draft</button>
        </form>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-lg font-semibold">Payout Distribution Histogram</h2>
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
        <div class="mt-6 space-y-4">
          {#each payoutHistogram as bucket}
            <div class="grid grid-cols-[6rem,1fr,3rem] items-center gap-3 text-sm">
              <span class="text-slate-600">{bucket.label}</span>
              <div class="h-3 rounded-full bg-slate-100">
                <div
                  class="h-3 rounded-full bg-emerald-500"
                  style={`width:${
                    bucket.count === 0
                      ? 0
                      : Math.max(8, (bucket.count / maxHistogramCount) * 100)
                  }%`}
                ></div>
              </div>
              <span class="text-right font-medium text-slate-900">
                {bucket.count}
              </span>
            </div>
          {/each}
        </div>
      </article>

      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-lg font-semibold">Blocked Minute Hotspots</h2>
        <p class="mt-1 text-sm text-slate-500">
          近 {usage.windows.realtimeMinutes} 分钟里，命中 anti-exploit 最多的时间片。
        </p>
        <div class="mt-4 space-y-3">
          {#if blockedMinutes.length === 0}
            <div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              No blocked traffic in the current window.
            </div>
          {:else}
            {#each blockedMinutes as bucket}
              <div class="rounded-2xl border border-slate-200 px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="font-medium text-slate-900">
                    {formatTime(bucket.minuteStart)}
                  </p>
                  <span class="badge badge-warning">
                    {bucket.antiExploitBlockedCount} blocked
                  </span>
                </div>
                <p class="mt-1 text-sm text-slate-500">
                  total {bucket.requestCount} · QPS {formatNumber(bucket.qps)} ·
                  hit rate {formatPct(bucket.antiExploitRatePct)}
                </p>
              </div>
            {/each}
          {/if}
        </div>
      </article>
    </section>
  {/if}
</div>
