<script lang="ts">
  import type {
    AnalyticsSummary,
    ReconciliationAlertsSummary,
  } from "./page-support"

  type Translate = (key: string) => string

  let {
    analytics,
    reconciliationAlertsSummary,
    t,
    winRateLabel,
  }: {
    analytics: AnalyticsSummary | null
    reconciliationAlertsSummary: ReconciliationAlertsSummary | null | undefined
    t: Translate
    winRateLabel: string
  } = $props()

  const unresolvedCount = $derived(
    reconciliationAlertsSummary?.unresolvedCount ?? 0,
  )
</script>

<section class="mt-6 grid gap-6 md:grid-cols-4">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.totalDraws")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.totalDrawCount ?? 0}
      </p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.winRate")}</p>
      <p class="text-2xl font-semibold">{winRateLabel}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.poolBalance")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.systemPoolBalance ?? 0}
      </p>
    </div>
  </div>
  <a
    href="/reconciliation"
    class={`card shadow transition hover:-translate-y-0.5 ${
      unresolvedCount > 0
        ? "border border-error/40 bg-error/5"
        : "bg-base-100"
    }`}
  >
    <div class="card-body">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm text-slate-500">
          {t("admin.metrics.reconciliationAlerts")}
        </p>
        {#if unresolvedCount > 0}
          <span class="inline-flex h-2.5 w-2.5 rounded-full bg-error"></span>
        {/if}
      </div>
      <p class="text-2xl font-semibold">{unresolvedCount}</p>
    </div>
  </a>
</section>
