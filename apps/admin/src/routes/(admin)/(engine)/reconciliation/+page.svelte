<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import type { ReconciliationAlertRecord } from "@reward/shared-types/finance"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import {
    formatDateTime,
    formatMoney,
    formatSnapshotJson,
    statusBadgeClass,
    statusLabelKey,
    type PageData,
  } from "./page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let operatorNote = $state("")
  let selectedAlertId = $state<number | null>(null)

  const alerts = $derived(data.alerts ?? [])
  const summary = $derived(data.reconciliationAlertsSummary ?? null)
  const actionError = $derived($page.form?.error as string | undefined)
  const selectedAlert = $derived(
    alerts.find((alert) => alert.id === selectedAlertId) ?? alerts[0] ?? null,
  )

  $effect(() => {
    if (alerts.length === 0) {
      selectedAlertId = null
      return
    }
    if (
      selectedAlertId === null ||
      !alerts.some((alert) => alert.id === selectedAlertId)
    ) {
      selectedAlertId = alerts[0]?.id ?? null
    }
  })

  const deltaClass = (value: string) => {
    const amount = Number(value)
    if (!Number.isFinite(amount)) return "text-slate-900"
    if (amount > 0) return "text-error"
    if (amount < 0) return "text-warning"
    return "text-slate-900"
  }

  const slaBadgeClass = (breached: boolean | undefined) =>
    breached ? "badge-error" : "badge-success"

  const queueLabel = (alert: ReconciliationAlertRecord) =>
    alert.dedupeKey ??
    alert.userEmail ??
    (alert.userId !== null ? `User ${alert.userId}` : `Alert #${alert.id}`)

  const queueSecondary = (alert: ReconciliationAlertRecord) =>
    alert.userEmail && alert.userId !== null
      ? `User #${alert.userId}`
      : alert.userId !== null
        ? `Alert #${alert.id}`
        : "Unscoped entity"

  const queueSeverityLabel = (alert: ReconciliationAlertRecord) => {
    if (alert.status === "require_engineering" || alert.slaBreached) {
      return "Critical"
    }
    if (alert.status === "open") {
      return "Open"
    }
    if (alert.status === "acknowledged") {
      return "Reviewing"
    }
    return "Resolved"
  }

  const queueSeverityClass = (alert: ReconciliationAlertRecord) => {
    if (alert.status === "require_engineering" || alert.slaBreached) {
      return "badge-error"
    }
    if (alert.status === "open") {
      return "badge-warning"
    }
    if (alert.status === "acknowledged") {
      return "badge-info"
    }
    return "badge-success"
  }

  const comparisonRows = (alert: ReconciliationAlertRecord) => [
    {
      label: t("engine.snapshot.withdrawable"),
      ledger: alert.ledgerSnapshot.withdrawableBalance,
      wallet: alert.walletSnapshot.withdrawableBalance,
    },
    {
      label: t("engine.snapshot.bonus"),
      ledger: alert.ledgerSnapshot.bonusBalance,
      wallet: alert.walletSnapshot.bonusBalance,
    },
    {
      label: t("engine.snapshot.locked"),
      ledger: alert.ledgerSnapshot.lockedBalance,
      wallet: alert.walletSnapshot.lockedBalance,
    },
    {
      label: t("engine.snapshot.wagered"),
      ledger: alert.ledgerSnapshot.wageredAmount,
      wallet: alert.walletSnapshot.wageredAmount,
    },
    {
      label: t("engine.snapshot.total"),
      ledger: alert.ledgerSnapshot.totalBalance,
      wallet: alert.walletSnapshot.totalBalance,
    },
  ]

  const isMismatchRow = (
    ledger: string | null | undefined,
    wallet: string | null | undefined,
  ) => String(ledger ?? "") !== String(wallet ?? "")
</script>

{#snippet reconciliationActions()}
  <a class="btn btn-outline" href="/reconciliation/export">
    {t("engine.actions.export")}
  </a>
{/snippet}

<AdminPageHeader
  context="Workspace · engineerOnCall"
  eyebrow="Engine"
  title={t("engine.title")}
  description={t("engine.description")}
  actions={reconciliationActions}
/>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if actionError}
  <div class="alert alert-error mt-6 text-sm">
    <span>{actionError}</span>
  </div>
{/if}

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
        Incident Overview
      </p>
      <h2
        class="mt-2 font-['Newsreader'] text-[1.9rem] leading-tight text-[var(--admin-ink)]"
      >
        Mismatch Queue
      </h2>
    </div>
    <p
      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-muted-soft)]"
    >
      Engineer On-Call
    </p>
  </div>

  <div class="admin-summary-grid grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-500"
      >
        {t("engine.summary.unresolved")}
      </p>
      <div class="mt-5 flex items-center gap-3">
        <span class="inline-flex h-2.5 w-2.5 rounded-full bg-error"></span>
        <p class="text-[2rem] font-semibold leading-none">
          {summary?.unresolvedCount ?? 0}
        </p>
      </div>
    </div>
    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-500"
      >
        {t("engine.summary.overdue")}
      </p>
      <p class="mt-5 text-[2rem] font-semibold leading-none">
        {summary?.overdueCount ?? 0}
      </p>
      <p class="mt-3 text-xs text-slate-500">
        {t("engine.summary.slaTarget")}: {summary?.slaHours ?? 24}h
      </p>
    </div>
    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-500"
      >
        {t("engine.summary.zeroDriftStreak")}
      </p>
      <p class="mt-5 text-[2rem] font-semibold leading-none">
        {summary?.zeroDriftStreakDays ?? 0}
      </p>
      <p class="mt-3 text-xs text-slate-500">
        {t("admin.metrics.reconciliationStreak")}
      </p>
    </div>
    <div
      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
    >
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-500"
      >
        {t("engine.summary.requireEngineering")}
      </p>
      <p class="mt-5 text-[2rem] font-semibold leading-none">
        {summary?.requireEngineeringCount ?? 0}
      </p>
    </div>
  </div>

  <div
    class="grid gap-4 border-t border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-5 py-4 text-sm md:grid-cols-3"
  >
    <div
      class="flex items-center justify-between gap-3 rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
    >
      <span class="text-[var(--admin-muted)]">{t("engine.summary.open")}</span>
      <span class="font-mono font-semibold text-[var(--admin-ink)]"
        >{summary?.openCount ?? 0}</span
      >
    </div>
    <div
      class="flex items-center justify-between gap-3 rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
    >
      <span class="text-[var(--admin-muted)]"
        >{t("engine.summary.acknowledged")}</span
      >
      <span class="font-mono font-semibold text-[var(--admin-ink)]"
        >{summary?.acknowledgedCount ?? 0}</span
      >
    </div>
    <div
      class="flex items-center justify-between gap-3 rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3"
    >
      <span class="text-[var(--admin-muted)]"
        >{t("engine.summary.resolved")}</span
      >
      <span class="font-mono font-semibold text-[var(--admin-ink)]"
        >{summary?.resolvedCount ?? 0}</span
      >
    </div>
  </div>
</section>

<section
  class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
>
  <aside class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Alert Queue
        </p>
        <h2 class="card-title mt-2">Mismatch Alert Queue</h2>
        <p class="text-sm text-slate-500">
          Prioritize unresolved and overdue mismatches before they drift into
          longer incident windows.
        </p>
      </div>

      <div class="space-y-2">
        {#if alerts.length === 0}
          <div class="admin-empty-state p-4 text-sm">
            {t("engine.table.empty")}
          </div>
        {:else}
          {#each alerts as alert}
            <button
              type="button"
              class={`admin-selectable-card w-full rounded-[0.95rem] p-4 text-left ${
                selectedAlert?.id === alert.id
                  ? "admin-selectable-card--active"
                  : ""
              }`}
              onclick={() => {
                selectedAlertId = alert.id
              }}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p
                    class="truncate font-mono text-[0.78rem] uppercase tracking-[0.18em] text-[var(--admin-ink)]"
                  >
                    {queueLabel(alert)}
                  </p>
                  <p class="mt-2 text-sm text-[var(--admin-muted)]">
                    {queueSecondary(alert)}
                  </p>
                </div>
                <span class={`badge ${queueSeverityClass(alert)}`}>
                  {queueSeverityLabel(alert)}
                </span>
              </div>

              <div
                class="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500"
              >
                <span
                  class={`font-mono font-semibold ${deltaClass(alert.deltaAmount)}`}
                >
                  Delta {formatMoney(alert.deltaAmount)}
                </span>
                <span>{formatDateTime(alert.lastDetectedAt)}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </aside>

  <div class="space-y-6">
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        {#if selectedAlert}
          <div
            class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Investigation
              </p>
              <h2
                class="mt-2 font-['Newsreader'] text-[1.9rem] leading-tight text-[var(--admin-ink)]"
              >
                {queueLabel(selectedAlert)}
              </h2>
              <p class="mt-2 text-sm text-slate-500">
                Compare ledger and wallet snapshots, then move the alert through
                a reviewed resolution path.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <span class={`badge ${statusBadgeClass(selectedAlert.status)}`}>
                {t(statusLabelKey(selectedAlert.status))}
              </span>
              <span class={`badge ${slaBadgeClass(selectedAlert.slaBreached)}`}>
                {selectedAlert.slaBreached
                  ? t("engine.sla.breached")
                  : t("engine.sla.healthy")}
              </span>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
              >
                {t("engine.table.headers.delta")}
              </p>
              <p
                class={`mt-4 text-[1.9rem] font-semibold leading-none ${deltaClass(selectedAlert.deltaAmount)}`}
              >
                {formatMoney(selectedAlert.deltaAmount)}
              </p>
            </div>
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
              >
                {t("engine.sla.firstDetectedAt")}
              </p>
              <p class="mt-4 text-sm font-medium text-[var(--admin-ink)]">
                {formatDateTime(selectedAlert.firstDetectedAt)}
              </p>
            </div>
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
              >
                {t("engine.sla.dueAt")}
              </p>
              <p class="mt-4 text-sm font-medium text-[var(--admin-ink)]">
                {formatDateTime(selectedAlert.slaDueAt)}
              </p>
            </div>
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
              >
                {t("engine.table.headers.updatedAt")}
              </p>
              <p class="mt-4 text-sm font-medium text-[var(--admin-ink)]">
                {formatDateTime(selectedAlert.updatedAt)}
              </p>
            </div>
          </div>

          <div
            class="overflow-hidden rounded-[0.95rem] border border-[var(--admin-border)]"
          >
            <div
              class="grid grid-cols-[minmax(9rem,1fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] gap-0 border-b border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
            >
              <div>Property Key</div>
              <div class="border-l border-[var(--admin-border)] pl-4">
                {t("engine.table.headers.ledgerSnapshot")}
              </div>
              <div class="border-l border-[var(--admin-border)] pl-4">
                {t("engine.table.headers.walletSnapshot")}
              </div>
              <div class="text-right">Delta</div>
            </div>

            {#each comparisonRows(selectedAlert) as row}
              <div
                class={`grid grid-cols-[minmax(9rem,1fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] gap-0 border-b border-[var(--admin-border)] px-4 py-3 text-sm ${
                  isMismatchRow(row.ledger, row.wallet)
                    ? "bg-error/5"
                    : "bg-[var(--admin-paper)]"
                }`}
              >
                <div
                  class={`font-mono ${isMismatchRow(row.ledger, row.wallet) ? "text-error" : "text-[var(--admin-muted)]"}`}
                >
                  {row.label}
                </div>
                <div
                  class="border-l border-[var(--admin-border)] pl-4 font-mono text-[var(--admin-ink)]"
                >
                  {formatMoney(row.ledger)}
                </div>
                <div
                  class={`border-l border-[var(--admin-border)] pl-4 font-mono ${isMismatchRow(row.ledger, row.wallet) ? "text-error font-semibold" : "text-[var(--admin-ink)]"}`}
                >
                  {formatMoney(row.wallet)}
                </div>
                <div
                  class={`text-right font-mono ${isMismatchRow(row.ledger, row.wallet) ? "text-error" : "text-emerald-700"}`}
                >
                  {isMismatchRow(row.ledger, row.wallet) ? "!=" : "="}
                </div>
              </div>
            {/each}

            <div
              class="grid gap-4 border-t border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 md:grid-cols-2"
            >
              <div class="space-y-2 text-xs">
                <div class="flex justify-between gap-3">
                  <span class="text-slate-500"
                    >{t("engine.snapshot.capturedAt")}</span
                  >
                  <span
                    >{formatDateTime(
                      selectedAlert.ledgerSnapshot.capturedAt,
                    )}</span
                  >
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-slate-500"
                    >{t("engine.snapshot.latestLedgerEntryId")}</span
                  >
                  <span class="font-mono"
                    >{selectedAlert.ledgerSnapshot.latestLedgerEntryId ??
                      "—"}</span
                  >
                </div>
              </div>
              <div class="space-y-2 text-xs">
                <div class="flex justify-between gap-3">
                  <span class="text-slate-500"
                    >{t("engine.table.headers.lastDetectedAt")}</span
                  >
                  <span>{formatDateTime(selectedAlert.lastDetectedAt)}</span>
                </div>
                {#if selectedAlert.escalatedAt}
                  <div class="flex justify-between gap-3">
                    <span class="text-slate-500"
                      >{t("engine.sla.escalatedAt")}</span
                    >
                    <span>{formatDateTime(selectedAlert.escalatedAt)}</span>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <details
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <summary
                class="cursor-pointer font-medium text-[var(--admin-ink)]"
              >
                {t("engine.table.headers.ledgerSnapshot")} · {t(
                  "engine.snapshot.details",
                )}
              </summary>
              <pre
                class="mt-3 overflow-x-auto rounded-[0.75rem] bg-[var(--admin-paper-strong)] p-3 text-[11px] leading-5">{formatSnapshotJson(
                  selectedAlert.ledgerSnapshot,
                )}</pre>
            </details>
            <details
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <summary
                class="cursor-pointer font-medium text-[var(--admin-ink)]"
              >
                {t("engine.table.headers.walletSnapshot")} · {t(
                  "engine.snapshot.details",
                )}
              </summary>
              <pre
                class="mt-3 overflow-x-auto rounded-[0.75rem] bg-[var(--admin-paper-strong)] p-3 text-[11px] leading-5">{formatSnapshotJson(
                  selectedAlert.walletSnapshot,
                )}</pre>
            </details>
          </div>

          <div
            class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
          >
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Resolution Protocol
            </p>
            <p class="mt-2 text-sm text-slate-500">
              {t("engine.stepUp.description")}
            </p>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">{t("common.totpCode")}</span>
                <input
                  name="totpCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={stepUpCode}
                  placeholder={t("engine.stepUp.placeholder")}
                />
              </label>
              <label class="form-control md:col-span-2">
                <span class="label-text mb-2"
                  >{t("engine.stepUp.operatorNote")}</span
                >
                <textarea
                  name="operatorNote"
                  class="textarea textarea-bordered min-h-24"
                  bind:value={operatorNote}
                  placeholder={t("engine.stepUp.operatorNotePlaceholder")}
                ></textarea>
              </label>
            </div>

            <div class="admin-rail-note text-sm">
              Every status transition reuses the current step-up code and
              operator note. Escalation should only be used when engineering
              intervention is required.
            </div>

            <div class="mt-5 flex flex-col gap-3 xl:flex-row">
              <form method="post" action="?/updateStatus" class="flex-1">
                <input type="hidden" name="alertId" value={selectedAlert.id} />
                <input type="hidden" name="status" value="acknowledged" />
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input type="hidden" name="operatorNote" value={operatorNote} />
                <button
                  class="btn btn-outline w-full"
                  type="submit"
                  disabled={selectedAlert.status === "acknowledged"}
                >
                  {t("engine.actions.acknowledge")}
                </button>
              </form>
              <form method="post" action="?/updateStatus" class="flex-1">
                <input type="hidden" name="alertId" value={selectedAlert.id} />
                <input
                  type="hidden"
                  name="status"
                  value="require_engineering"
                />
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input type="hidden" name="operatorNote" value={operatorNote} />
                <button
                  class="btn btn-outline btn-error w-full"
                  type="submit"
                  disabled={selectedAlert.status === "require_engineering"}
                >
                  {t("engine.actions.requireEngineering")}
                </button>
              </form>
              <form method="post" action="?/updateStatus" class="flex-1">
                <input type="hidden" name="alertId" value={selectedAlert.id} />
                <input type="hidden" name="status" value="resolved" />
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input type="hidden" name="operatorNote" value={operatorNote} />
                <button
                  class="btn btn-primary w-full"
                  type="submit"
                  disabled={selectedAlert.status === "resolved"}
                >
                  {t("engine.actions.resolve")}
                </button>
              </form>
            </div>

            <div class="mt-4 text-xs text-slate-500">
              {selectedAlert.statusNote ??
                "No operator note recorded for the latest status change."}
            </div>
          </div>
        {:else}
          <div
            class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-6 text-sm text-slate-500"
          >
            {t("engine.table.empty")}
          </div>
        {/if}
      </div>
    </section>
  </div>
</section>
