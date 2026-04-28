<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  let { data }: { data: import("./$types").PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")

  const queue = $derived(data.queue)
  const items = $derived(queue.items ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const successAction = $derived($page.form?.successAction as string | undefined)
  const successMessage = $derived(
    successAction === "clear"
      ? t("aml.feedback.clearSuccess")
      : successAction === "confirm"
        ? t("aml.feedback.confirmSuccess")
        : successAction === "escalate"
          ? t("aml.feedback.escalateSuccess")
          : null,
  )
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
                    : reason ?? t("aml.caseItem.none")
  const freezeScopeLabel = (scope: string | null | undefined) =>
    scope === "account_lock"
      ? t("users.scope.account")
      : scope === "withdrawal_lock"
        ? t("users.scope.withdrawal")
        : scope === "gameplay_lock"
          ? t("users.scope.gameplay")
          : scope === "topup_lock"
            ? t("users.scope.topup")
            : scope ?? "-"

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
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("aml.eyebrow")}
  </p>
  <h1 class="text-3xl font-semibold">{t("aml.title")}</h1>
  <p class="text-sm text-slate-600">
    {t("aml.description")}
  </p>
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

{#if successMessage}
  <div class="alert alert-success mt-6 text-sm">
    <span>{successMessage}</span>
  </div>
{/if}

{#if queue.summary.overdueCount > 0}
  <div class="alert alert-warning mt-6 text-sm">
    <span>
      {t("aml.warnings.overduePrefix")} {queue.summary.overdueCount} {t("aml.warnings.overdueMiddle")}
      {queue.summary.slaMinutes} {t("aml.warnings.overdueSuffix")}
    </span>
  </div>
{/if}

<section class="mt-8 grid gap-4 md:grid-cols-4">
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("aml.summary.pendingHits")}</p>
    <p class="mt-2 text-3xl font-semibold text-slate-900">
      {queue.summary.pendingCount}
    </p>
  </article>
  <article class="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
    <p class="text-sm text-amber-700">{t("aml.summary.overdue")}</p>
    <p class="mt-2 text-3xl font-semibold text-amber-900">
      {queue.summary.overdueCount}
    </p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("aml.summary.sla")}</p>
    <p class="mt-2 text-3xl font-semibold text-slate-900">
      {queue.summary.slaMinutes}m
    </p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("aml.summary.oldestPending")}</p>
    <p class="mt-2 text-sm font-medium text-slate-900">
      {formatDate(queue.summary.oldestPendingAt)}
    </p>
  </article>
</section>

<section class="mt-8 grid gap-6 lg:grid-cols-[18rem,1fr]">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("aml.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("aml.stepUp.description")}
        </p>
      </div>
      <label class="form-control">
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

      <form method="get" class="grid gap-4 rounded-2xl border border-slate-200 p-4">
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
        <button class="btn btn-outline" type="submit">{t("aml.filters.apply")}</button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <div>
        <h2 class="card-title">{t("aml.queue.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("aml.queue.description")}
        </p>
      </div>

      <div class="mt-4 space-y-4">
        {#each items as item}
          <article class="rounded-3xl border border-slate-200 p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-outline">{t("aml.caseItem.caseLabel")} #{item.id}</span>
                  <span class="badge badge-neutral">{t("aml.caseItem.userLabel")} #{item.userId}</span>
                  <span class="badge badge-outline">{checkpointLabel(item.checkpoint)}</span>
                  <span class={`badge ${isOverdue(item.slaDueAt) ? "badge-warning" : "badge-ghost"}`}>
                    {isOverdue(item.slaDueAt)
                      ? t("aml.caseItem.statusOverdue")
                      : t("aml.caseItem.statusWithinSla")}
                  </span>
                </div>
                <h3 class="mt-3 text-lg font-semibold text-slate-900">
                  {item.providerKey} / {riskLevelLabel(item.riskLevel)}
                </h3>
                <p class="mt-1 text-sm text-slate-500">
                  {t("aml.caseItem.created")} {formatDate(item.createdAt)} · {t("aml.caseItem.due")} {formatDate(item.slaDueAt)}
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  {t("aml.caseItem.freeze")}: {freezeReasonLabel(item.activeFreezeReason)} / {freezeScopeLabel(item.activeFreezeScope)}
                </p>
              </div>
            </div>

            <div class="mt-4 grid gap-4 xl:grid-cols-2">
              <details class="rounded-2xl bg-slate-950 p-4 text-sm text-sky-100">
                <summary class="cursor-pointer font-semibold text-sky-300">
                  {t("aml.caseItem.providerPayload")}
                </summary>
                <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-all">{toJson(item.providerPayload)}</pre>
              </details>

              <details class="rounded-2xl bg-slate-900 p-4 text-sm text-emerald-100">
                <summary class="cursor-pointer font-semibold text-emerald-300">
                  {t("aml.caseItem.screeningContext")}
                </summary>
                <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-all">{toJson(item.metadata)}</pre>
              </details>
            </div>

            <form method="post" class="mt-4 grid gap-4">
              <input type="hidden" name="amlCheckId" value={item.id} />
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <label class="form-control">
                <span class="label-text mb-2">{t("aml.caseItem.note")}</span>
                <textarea
                  class="textarea textarea-bordered min-h-24"
                  name="note"
                  placeholder={t("aml.caseItem.notePlaceholder")}
                ></textarea>
              </label>
              <div class="flex flex-wrap gap-3">
                <button class="btn btn-outline" type="submit" formaction="?/clearHit">
                  {t("aml.actions.clear")}
                </button>
                <button class="btn btn-warning" type="submit" formaction="?/confirmHit">
                  {t("aml.actions.confirm")}
                </button>
                <button class="btn btn-neutral" type="submit" formaction="?/escalateHit">
                  {t("aml.actions.escalate")}
                </button>
              </div>
            </form>
          </article>
        {/each}

        {#if items.length === 0}
          <div class="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
            {t("aml.queue.empty")}
          </div>
        {/if}
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
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
    </div>
  </div>
</section>
