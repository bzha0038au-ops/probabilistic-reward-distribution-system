<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  let { data }: { data: import("./$types").PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let selectedAmlCheckId = $state<number | null>(null)

  const queue = $derived(data.queue)
  const items = $derived(queue.items ?? [])
  const selectedItem = $derived(
    items.find((item) => item.id === selectedAmlCheckId) ?? items[0] ?? null,
  )
  const actionError = $derived($page.form?.error as string | undefined)
  const successAction = $derived(
    $page.form?.successAction as string | undefined,
  )
  const successMessage = $derived(
    successAction === "clear"
      ? t("aml.feedback.clearSuccess")
      : successAction === "confirm"
        ? t("aml.feedback.confirmSuccess")
        : successAction === "escalate"
          ? t("aml.feedback.escalateSuccess")
          : null,
  )

  $effect(() => {
    if (items.length === 0) {
      selectedAmlCheckId = null
      return
    }
    if (
      selectedAmlCheckId === null ||
      !items.some((item) => item.id === selectedAmlCheckId)
    ) {
      selectedAmlCheckId = items[0]?.id ?? null
    }
  })

  const checkpointLabel = (checkpoint: string) =>
    checkpoint === "registration"
      ? t("aml.checkpoint.registration")
      : checkpoint === "first_deposit"
        ? t("aml.checkpoint.firstDeposit")
        : checkpoint === "withdrawal_request"
          ? t("aml.checkpoint.withdrawalRequest")
          : checkpoint
  const riskLevelLabel = (riskLevel: string) =>
    riskLevel === "low"
      ? t("aml.riskLevel.low")
      : riskLevel === "medium"
        ? t("aml.riskLevel.medium")
        : riskLevel === "high"
          ? t("aml.riskLevel.high")
          : riskLevel
  const freezeReasonLabel = (reason: string | null | undefined) =>
    reason === "account_lock"
      ? t("users.reason.accountLock")
      : reason === "withdrawal_lock"
        ? t("users.reason.withdrawalLock")
        : reason === "gameplay_lock"
          ? t("users.reason.gameplayLock")
          : reason === "pending_kyc"
            ? t("users.reason.pendingKyc")
            : reason === "aml_review"
              ? t("users.reason.amlReview")
              : reason === "auth_failure"
                ? t("users.reason.authFailure")
                : reason === "manual_admin"
                  ? t("users.reason.manualAdmin")
                  : reason === "forum_moderation"
                    ? t("users.reason.forumModeration")
                    : (reason ?? t("aml.caseItem.none"))
  const freezeScopeLabel = (scope: string | null | undefined) =>
    scope === "account_lock"
      ? t("users.scope.account")
      : scope === "withdrawal_lock"
        ? t("users.scope.withdrawal")
        : scope === "gameplay_lock"
          ? t("users.scope.gameplay")
          : scope === "topup_lock"
            ? t("users.scope.topup")
            : (scope ?? "-")
  const reviewStatusLabel = (status: string) =>
    status === "pending"
      ? "Pending"
      : status === "cleared"
        ? "Cleared"
        : status === "confirmed"
          ? "Confirmed"
          : status === "escalated"
            ? "Escalated"
            : status
  const resultLabel = (result: string) => result.replaceAll("_", " ")

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString()
  }

  const isOverdue = (value: string | Date | null | undefined) => {
    if (!value) return false
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()
  }

  const toJson = (value: unknown) =>
    value == null ? "null" : JSON.stringify(value, null, 2)

  const riskTone = (riskLevel: string) =>
    riskLevel === "high"
      ? "border-[var(--admin-danger)] text-[var(--admin-danger)]"
      : riskLevel === "medium"
        ? "border-[var(--admin-warning)] text-[var(--admin-warning)]"
        : "border-[var(--admin-border-strong)] text-[var(--admin-muted)]"
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · amlReview"
    eyebrow={t("aml.eyebrow")}
    title={t("aml.title")}
    description={t("aml.description")}
  />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if successMessage}
    <div class="alert alert-success text-sm">
      <span>{successMessage}</span>
    </div>
  {/if}

  {#if queue.summary.overdueCount > 0}
    <div class="alert alert-warning text-sm">
      <span>
        {t("aml.warnings.overduePrefix")}
        {queue.summary.overdueCount}
        {t("aml.warnings.overdueMiddle")}
        {queue.summary.slaMinutes}
        {t("aml.warnings.overdueSuffix")}
      </span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Pending Hits
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {queue.summary.pendingCount}
          </p>
          <span class="badge badge-outline">queue</span>
        </div>
        <p class="text-sm text-slate-500">{t("aml.summary.pendingHits")}</p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Overdue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {queue.summary.overdueCount}
          </p>
          <span class="badge badge-outline">sla</span>
        </div>
        <p class="text-sm text-slate-500">{t("aml.summary.overdue")}</p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          SLA Window
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {queue.summary.slaMinutes}m
          </p>
          <span class="badge badge-outline">target</span>
        </div>
        <p class="text-sm text-slate-500">{t("aml.summary.sla")}</p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Oldest Pending
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-mono text-sm text-[var(--admin-ink)]">
            {formatDate(queue.summary.oldestPendingAt)}
          </p>
          <span class="badge badge-outline">utc</span>
        </div>
        <p class="text-sm text-slate-500">{t("aml.summary.oldestPending")}</p>
      </div>
    </article>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.82fr)]"
  >
    <div class="admin-main--after-rail-xl min-w-0 space-y-6">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Ledger
              </p>
              <h2 class="card-title mt-2">{t("aml.queue.title")}</h2>
              <p class="text-sm text-slate-500">{t("aml.queue.description")}</p>
            </div>
            <span class="badge badge-outline">
              {items.length}/{queue.limit}
            </span>
          </div>

          {#if items.length === 0}
            <div
              class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
            >
              {t("aml.queue.empty")}
            </div>
          {:else}
            <div
              class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
            >
              <table class="table admin-table-compact">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>User</th>
                    <th>Provider</th>
                    <th>Checkpoint</th>
                    <th>Due</th>
                    <th>Freeze</th>
                    <th>Review</th>
                    <th class="text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as item}
                    <tr
                      style={selectedItem?.id === item.id
                        ? "background: var(--admin-primary-soft);"
                        : isOverdue(item.slaDueAt)
                          ? "background: var(--admin-warning-soft);"
                          : undefined}
                    >
                      <td>
                        <span
                          class={`badge badge-outline ${riskTone(item.riskLevel)}`}
                        >
                          {riskLevelLabel(item.riskLevel)}
                        </span>
                      </td>
                      <td>
                        <div class="space-y-1">
                          <p class="font-mono text-xs text-[var(--admin-ink)]">
                            {t("aml.caseItem.userLabel")} #{item.userId}
                          </p>
                          <p class="font-mono text-xs text-slate-500">
                            {t("aml.caseItem.caseLabel")} #{item.id}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div class="space-y-1">
                          <p class="font-medium text-[var(--admin-ink)]">
                            {item.providerKey}
                          </p>
                          <p class="font-mono text-xs text-slate-500">
                            {resultLabel(item.result)}
                          </p>
                        </div>
                      </td>
                      <td>{checkpointLabel(item.checkpoint)}</td>
                      <td>
                        <div class="space-y-1">
                          <p class="font-mono text-xs text-slate-700">
                            {formatDate(item.slaDueAt)}
                          </p>
                          <span
                            class={`badge badge-outline ${isOverdue(item.slaDueAt) ? "border-[var(--admin-warning)] text-[var(--admin-warning)]" : ""}`}
                          >
                            {isOverdue(item.slaDueAt)
                              ? t("aml.caseItem.statusOverdue")
                              : t("aml.caseItem.statusWithinSla")}
                          </span>
                        </div>
                      </td>
                      <td class="text-sm text-slate-600">
                        {freezeReasonLabel(item.activeFreezeReason)} /
                        {freezeScopeLabel(item.activeFreezeScope)}
                      </td>
                      <td>
                        <span class="badge badge-outline">
                          {reviewStatusLabel(item.reviewStatus)}
                        </span>
                      </td>
                      <td class="text-right">
                        <button
                          class={`btn btn-xs ${selectedItem?.id === item.id ? "btn-primary" : "btn-outline"}`}
                          type="button"
                          onclick={() => {
                            selectedAmlCheckId = item.id
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="admin-pagination">
              {#if queue.page > 1}
                <a
                  class="btn btn-outline btn-sm"
                  href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), page: String(queue.page - 1) }).toString()}`}
                >
                  {t("common.prev")}
                </a>
              {/if}
              {#if queue.hasNext}
                <a
                  class="btn btn-outline btn-sm"
                  href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), page: String(queue.page + 1) }).toString()}`}
                >
                  {t("common.next")}
                </a>
              {/if}
            </div>
          {/if}
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
              Operator Controls
            </p>
            <h2 class="card-title mt-2">{t("aml.stepUp.title")}</h2>
            <p class="text-sm text-slate-500">{t("aml.stepUp.description")}</p>
          </div>

          <div class="admin-rail-panel">
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Approval Key
            </p>
            <label class="form-control mt-3">
              <span class="label-text mb-2">{t("common.totpCode")}</span>
              <input
                name="totpCode"
                type="text"
                inputmode="text"
                autocomplete="one-time-code"
                class="input input-bordered"
                bind:value={stepUpCode}
                placeholder={t("aml.stepUp.placeholder")}
              />
            </label>
          </div>

          <form method="get" class="admin-rail-panel space-y-4">
            <label class="form-control">
              <span class="label-text mb-2">{t("aml.filters.limit")}</span>
              <input
                class="input input-bordered"
                name="limit"
                type="number"
                min="1"
                max="100"
                value={$page.url.searchParams.get("limit") ?? "25"}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("aml.filters.sort")}</span>
              <select
                class="select select-bordered"
                name="sort"
                value={$page.url.searchParams.get("sort") ?? "desc"}
              >
                <option value="desc">{t("aml.filters.sortNewest")}</option>
                <option value="asc">{t("aml.filters.sortOldest")}</option>
              </select>
            </label>
            <input type="hidden" name="page" value="1" />
            <button class="btn btn-outline w-full" type="submit">
              {t("aml.filters.apply")}
            </button>
          </form>
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Selected Dossier
            </p>
            <h2 class="card-title mt-2">AML Case Review</h2>
            <p class="text-sm text-slate-500">
              Focus the selected hit before clearing, confirming, or escalating
              it.
            </p>
          </div>

          {#if selectedItem}
            <div class="admin-rail-panel admin-selected-dossier">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-outline">
                  {t("aml.caseItem.caseLabel")} #{selectedItem.id}
                </span>
                <span
                  class={`badge badge-outline ${riskTone(selectedItem.riskLevel)}`}
                >
                  {riskLevelLabel(selectedItem.riskLevel)}
                </span>
                <span class="badge badge-outline">
                  {reviewStatusLabel(selectedItem.reviewStatus)}
                </span>
              </div>

              <dl class="admin-data-list mt-4 text-sm text-slate-600">
                <div class="admin-data-row">
                  <dt>User</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    #{selectedItem.userId}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Provider</dt>
                  <dd class="text-right">{selectedItem.providerKey}</dd>
                </div>
                <div class="admin-data-row">
                  <dt>Checkpoint</dt>
                  <dd class="text-right">
                    {checkpointLabel(selectedItem.checkpoint)}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Created</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {formatDate(selectedItem.createdAt)}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Due</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {formatDate(selectedItem.slaDueAt)}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Freeze</dt>
                  <dd class="text-right">
                    {freezeReasonLabel(selectedItem.activeFreezeReason)} /
                    {freezeScopeLabel(selectedItem.activeFreezeScope)}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Reference</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {selectedItem.providerReference ?? "-"}
                  </dd>
                </div>
              </dl>
            </div>

            <details
              class="rounded-[0.95rem] bg-slate-950 p-4 text-sm text-sky-100"
            >
              <summary class="cursor-pointer font-semibold text-sky-300">
                {t("aml.caseItem.providerPayload")}
              </summary>
              <pre
                class="mt-3 overflow-x-auto whitespace-pre-wrap break-all">{toJson(
                  selectedItem.providerPayload,
                )}</pre>
            </details>

            <details
              class="rounded-[0.95rem] bg-slate-900 p-4 text-sm text-emerald-100"
            >
              <summary class="cursor-pointer font-semibold text-emerald-300">
                {t("aml.caseItem.screeningContext")}
              </summary>
              <pre
                class="mt-3 overflow-x-auto whitespace-pre-wrap break-all">{toJson(
                  selectedItem.metadata,
                )}</pre>
            </details>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
            >
              {t("aml.queue.empty")}
            </div>
          {/if}
        </div>
      </section>

      {#if selectedItem}
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Actions
              </p>
              <h2 class="card-title mt-2">Final Review</h2>
              <p class="text-sm text-slate-500">
                Persist a note, then decide whether this hit is cleared,
                confirmed, or escalated.
              </p>
            </div>

            <form method="post" class="grid gap-4">
              <input type="hidden" name="amlCheckId" value={selectedItem.id} />
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <label class="form-control">
                <span class="label-text mb-2">{t("aml.caseItem.note")}</span>
                <textarea
                  class="textarea textarea-bordered min-h-24"
                  name="note"
                  placeholder={t("aml.caseItem.notePlaceholder")}
                ></textarea>
              </label>
              <div class="grid gap-3">
                <button
                  class="btn btn-outline"
                  type="submit"
                  formaction="?/clearHit"
                >
                  {t("aml.actions.clear")}
                </button>
                <button
                  class="btn btn-warning"
                  type="submit"
                  formaction="?/confirmHit"
                >
                  {t("aml.actions.confirm")}
                </button>
                <button
                  class="btn btn-neutral"
                  type="submit"
                  formaction="?/escalateHit"
                >
                  {t("aml.actions.escalate")}
                </button>
              </div>
            </form>
          </div>
        </section>
      {/if}
    </aside>
  </section>
</div>
