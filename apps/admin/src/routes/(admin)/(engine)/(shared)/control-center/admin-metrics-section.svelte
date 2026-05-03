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
  const zeroDriftStreakDays = $derived(
    reconciliationAlertsSummary?.zeroDriftStreakDays ?? 0,
  )
</script>

<section
  class="mt-6 overflow-hidden rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] shadow-[var(--admin-shadow)]"
>
  <div
    class="flex flex-col gap-3 border-b border-[var(--admin-border)] px-6 py-5 lg:flex-row lg:items-end lg:justify-between"
  >
    <div>
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
      >
        Engine Telemetry
      </p>
      <h2
        class="mt-2 font-['Newsreader'] text-[1.9rem] leading-tight text-[var(--admin-ink)]"
      >
        System Integrity
      </h2>
    </div>
    <p
      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-muted-soft)]"
    >
      Live Telemetry
    </p>
  </div>

  <div class="admin-summary-grid grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <div class="flex items-start justify-between gap-3">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
        >
          {t("admin.metrics.totalDraws")}
        </p>
        <span class="material-symbols-outlined text-[1rem] text-slate-400">
          toll
        </span>
      </div>
      <p
        class="mt-5 text-[2rem] font-semibold leading-none text-[var(--admin-ink)]"
      >
        {analytics?.totalDrawCount ?? 0}
      </p>
    </div>

    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <div class="flex items-start justify-between gap-3">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
        >
          {t("admin.metrics.winRate")}
        </p>
        <span class="material-symbols-outlined text-[1rem] text-slate-400">
          target
        </span>
      </div>
      <p
        class="mt-5 text-[2rem] font-semibold leading-none text-[var(--admin-ink)]"
      >
        {winRateLabel}
      </p>
    </div>

    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <div class="flex items-start justify-between gap-3">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
        >
          {t("admin.metrics.poolBalance")}
        </p>
        <span class="material-symbols-outlined text-[1rem] text-slate-400">
          account_balance
        </span>
      </div>
      <p
        class="mt-5 text-[2rem] font-semibold leading-none text-[var(--admin-ink)]"
      >
        {analytics?.systemPoolBalance ?? 0}
      </p>
    </div>

    <a
      href="/reconciliation"
      class={`rounded-[0.95rem] border p-4 transition hover:-translate-y-0.5 ${
        unresolvedCount > 0
          ? "border-error/40 bg-error/5"
          : "border-[var(--admin-border)] bg-[var(--admin-paper-strong)]"
      }`}
    >
      <div class="flex items-start justify-between gap-3">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
        >
          {t("admin.metrics.reconciliationAlerts")}
        </p>
        {#if unresolvedCount > 0}
          <span class="inline-flex h-2.5 w-2.5 rounded-full bg-error"></span>
        {:else}
          <span class="material-symbols-outlined text-[1rem] text-slate-400">
            task_alt
          </span>
        {/if}
      </div>
      <p
        class="mt-5 text-[2rem] font-semibold leading-none text-[var(--admin-ink)]"
      >
        {unresolvedCount}
      </p>
      <p class="mt-3 text-xs text-slate-500">
        {t("admin.metrics.reconciliationStreak")}: {zeroDriftStreakDays}
      </p>
    </a>
  </div>
</section>
