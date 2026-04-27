<script lang="ts">
  import type { AnalyticsSummary } from "./page-support"

  type Translate = (key: string) => string

  let {
    analytics,
    t,
    winRateLabel,
  }: {
    analytics: AnalyticsSummary | null
    t: Translate
    winRateLabel: string
  } = $props()
</script>

<section class="mt-6 grid gap-6 md:grid-cols-3">
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
</section>
