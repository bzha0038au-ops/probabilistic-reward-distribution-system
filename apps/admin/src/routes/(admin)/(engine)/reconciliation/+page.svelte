<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import {
    formatDateTime,
    formatMoney,
    formatSnapshotJson,
    snapshotRows,
    statusBadgeClass,
    statusLabelKey,
    type PageData,
  } from "./page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let operatorNote = $state("")

  const alerts = $derived(data.alerts ?? [])
  const summary = $derived(data.reconciliationAlertsSummary ?? null)
  const actionError = $derived($page.form?.error as string | undefined)

  const deltaClass = (value: string) => {
    const amount = Number(value)
    if (!Number.isFinite(amount)) return "text-slate-900"
    if (amount > 0) return "text-error"
    if (amount < 0) return "text-warning"
    return "text-slate-900"
  }

  const slaBadgeClass = (breached: boolean | undefined) =>
    breached ? "badge-error" : "badge-success"
</script>

<header class="space-y-3">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
        Engine
      </p>
      <h1 class="text-3xl font-semibold">{t("engine.title")}</h1>
      <p class="max-w-3xl text-sm text-slate-600">
        {t("engine.description")}
      </p>
    </div>
    <a class="btn btn-outline" href="/reconciliation/export">
      {t("engine.actions.export")}
    </a>
  </div>
</header>

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

<section class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("engine.summary.unresolved")}</p>
      <div class="mt-2 flex items-center gap-3">
        <span class="inline-flex h-2.5 w-2.5 rounded-full bg-error"></span>
        <p class="text-2xl font-semibold">{summary?.unresolvedCount ?? 0}</p>
      </div>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("engine.summary.overdue")}</p>
      <p class="text-2xl font-semibold">{summary?.overdueCount ?? 0}</p>
      <p class="text-xs text-slate-500">
        {t("engine.summary.slaTarget")}: {summary?.slaHours ?? 24}h
      </p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">
        {t("engine.summary.zeroDriftStreak")}
      </p>
      <p class="text-2xl font-semibold">
        {summary?.zeroDriftStreakDays ?? 0}
      </p>
      <p class="text-xs text-slate-500">{t("admin.metrics.reconciliationStreak")}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">
        {t("engine.summary.requireEngineering")}
      </p>
      <p class="text-2xl font-semibold">
        {summary?.requireEngineeringCount ?? 0}
      </p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("engine.summary.open")}</p>
      <p class="text-2xl font-semibold">{summary?.openCount ?? 0}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("engine.summary.acknowledged")}</p>
      <p class="text-2xl font-semibold">{summary?.acknowledgedCount ?? 0}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("engine.summary.resolved")}</p>
      <p class="text-2xl font-semibold">{summary?.resolvedCount ?? 0}</p>
    </div>
  </div>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body gap-4">
    <div>
      <h2 class="card-title">{t("engine.stepUp.title")}</h2>
      <p class="text-sm text-slate-500">{t("engine.stepUp.description")}</p>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
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
        <span class="label-text mb-2">{t("engine.stepUp.operatorNote")}</span>
        <textarea
          name="operatorNote"
          class="textarea textarea-bordered min-h-24"
          bind:value={operatorNote}
          placeholder={t("engine.stepUp.operatorNotePlaceholder")}
        ></textarea>
      </label>
    </div>
  </div>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body overflow-x-auto">
    <table class="table table-zebra">
      <thead>
        <tr>
          <th>{t("engine.table.headers.user")}</th>
          <th>{t("engine.table.headers.status")}</th>
          <th>{t("engine.table.headers.delta")}</th>
          <th>{t("engine.table.headers.sla")}</th>
          <th>{t("engine.table.headers.ledgerSnapshot")}</th>
          <th>{t("engine.table.headers.walletSnapshot")}</th>
          <th>{t("engine.table.headers.lastDetectedAt")}</th>
          <th>{t("engine.table.headers.updatedAt")}</th>
          <th>{t("engine.table.headers.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {#if alerts.length === 0}
          <tr>
            <td colspan="9" class="text-center text-sm text-slate-500">
              {t("engine.table.empty")}
            </td>
          </tr>
        {:else}
          {#each alerts as alert}
            <tr>
              <td class="min-w-44">
                <div class="font-medium">
                  {alert.userEmail ?? (alert.userId !== null ? `User ${alert.userId}` : "User —")}
                </div>
                <div class="text-xs text-slate-500">
                  ID {alert.userId ?? "—"}
                </div>
              </td>
              <td>
                <span class={`badge ${statusBadgeClass(alert.status)}`}>
                  {t(statusLabelKey(alert.status))}
                </span>
              </td>
              <td class={`font-mono font-semibold ${deltaClass(alert.deltaAmount)}`}>
                {formatMoney(alert.deltaAmount)}
              </td>
              <td class="min-w-48 align-top text-xs">
                <div class="space-y-2">
                  <span class={`badge ${slaBadgeClass(alert.slaBreached)}`}>
                    {alert.slaBreached
                      ? t("engine.sla.breached")
                      : t("engine.sla.healthy")}
                  </span>
                  <div class="space-y-1">
                    <div class="flex justify-between gap-3">
                      <span class="text-slate-500">
                        {t("engine.sla.firstDetectedAt")}
                      </span>
                      <span>{formatDateTime(alert.firstDetectedAt)}</span>
                    </div>
                    <div class="flex justify-between gap-3">
                      <span class="text-slate-500">{t("engine.sla.dueAt")}</span>
                      <span>{formatDateTime(alert.slaDueAt)}</span>
                    </div>
                    {#if alert.escalatedAt}
                      <div class="flex justify-between gap-3">
                        <span class="text-slate-500">
                          {t("engine.sla.escalatedAt")}
                        </span>
                        <span>{formatDateTime(alert.escalatedAt)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="min-w-64 align-top">
                <div class="space-y-1 text-xs">
                  {#each snapshotRows(alert.ledgerSnapshot) as row}
                    <div class="flex justify-between gap-3">
                      <span class="text-slate-500">{t(row.labelKey)}</span>
                      <span class="font-mono">{formatMoney(row.value)}</span>
                    </div>
                  {/each}
                  <div class="flex justify-between gap-3">
                    <span class="text-slate-500">{t("engine.snapshot.capturedAt")}</span>
                    <span>{formatDateTime(alert.ledgerSnapshot.capturedAt)}</span>
                  </div>
                  <div class="flex justify-between gap-3">
                    <span class="text-slate-500">
                      {t("engine.snapshot.latestLedgerEntryId")}
                    </span>
                    <span class="font-mono">
                      {alert.ledgerSnapshot.latestLedgerEntryId ?? "—"}
                    </span>
                  </div>
                  <details class="mt-2">
                    <summary class="cursor-pointer text-slate-500">
                      {t("engine.snapshot.details")}
                    </summary>
                    <pre class="mt-2 overflow-x-auto rounded-box bg-base-200 p-3 text-[11px] leading-5">{formatSnapshotJson(alert.ledgerSnapshot)}</pre>
                  </details>
                </div>
              </td>
              <td class="min-w-64 align-top">
                <div class="space-y-1 text-xs">
                  {#each snapshotRows(alert.walletSnapshot) as row}
                    <div class="flex justify-between gap-3">
                      <span class="text-slate-500">{t(row.labelKey)}</span>
                      <span class="font-mono">{formatMoney(row.value)}</span>
                    </div>
                  {/each}
                  <div class="flex justify-between gap-3">
                    <span class="text-slate-500">{t("engine.snapshot.capturedAt")}</span>
                    <span>{formatDateTime(alert.walletSnapshot.capturedAt)}</span>
                  </div>
                  <details class="mt-2">
                    <summary class="cursor-pointer text-slate-500">
                      {t("engine.snapshot.details")}
                    </summary>
                    <pre class="mt-2 overflow-x-auto rounded-box bg-base-200 p-3 text-[11px] leading-5">{formatSnapshotJson(alert.walletSnapshot)}</pre>
                  </details>
                </div>
              </td>
              <td class="align-top text-sm">
                {formatDateTime(alert.lastDetectedAt)}
              </td>
              <td class="min-w-48 align-top text-sm">
                <div>{formatDateTime(alert.updatedAt)}</div>
                <div class="mt-2 text-xs text-slate-500">
                  {alert.statusNote ?? "—"}
                </div>
              </td>
              <td class="min-w-40 align-top">
                <div class="flex flex-col gap-2">
                  <form method="post" action="?/updateStatus">
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="status" value="acknowledged" />
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input type="hidden" name="operatorNote" value={operatorNote} />
                    <button
                      class="btn btn-sm btn-outline w-full"
                      type="submit"
                      disabled={alert.status === "acknowledged"}
                    >
                      {t("engine.actions.acknowledge")}
                    </button>
                  </form>
                  <form method="post" action="?/updateStatus">
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input
                      type="hidden"
                      name="status"
                      value="require_engineering"
                    />
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input type="hidden" name="operatorNote" value={operatorNote} />
                    <button
                      class="btn btn-sm btn-outline btn-error w-full"
                      type="submit"
                      disabled={alert.status === "require_engineering"}
                    >
                      {t("engine.actions.requireEngineering")}
                    </button>
                  </form>
                  <form method="post" action="?/updateStatus">
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="status" value="resolved" />
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input type="hidden" name="operatorNote" value={operatorNote} />
                    <button
                      class="btn btn-sm btn-primary w-full"
                      type="submit"
                      disabled={alert.status === "resolved"}
                    >
                      {t("engine.actions.resolve")}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>
