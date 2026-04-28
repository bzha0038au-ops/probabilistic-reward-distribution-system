<script lang="ts">
  import { page } from "$app/stores"
  import ConfirmDialog from "$lib/components/confirm-dialog.svelte"
  import {
    resolvePendingBreakGlassSubmission,
    upsertHiddenFormValue,
    type PendingBreakGlassSubmission,
  } from "$lib/break-glass"
  import type {
    UserFreezeReason,
    UserFreezeScope,
  } from "@reward/shared-types/risk"
  import { getContext } from "svelte"
  import { securityActionPolicies } from "./action-policies"

  interface AuthEvent {
    id: number
    userId?: number | null
    email?: string | null
    eventType: string
    ip?: string | null
    userAgent?: string | null
    metadata?: Record<string, unknown> | null
    createdAt?: string
  }

  interface FreezeRecord {
    id: number
    userId: number
    reason: UserFreezeReason
    scope: UserFreezeScope
    status: string
    createdAt?: string
    releasedAt?: string | null
  }

  interface CursorPage<T> {
    items: T[]
    limit: number
    hasNext: boolean
    hasPrevious: boolean
    nextCursor?: string | null
    prevCursor?: string | null
    direction: "next" | "prev"
    sort: "asc" | "desc"
  }

  interface Paginated<T> {
    items: T[]
    page: number
    limit: number
    hasNext: boolean
  }

  interface AdminAction {
    id: number
    adminId?: number | null
    action: string
    targetType?: string | null
    targetId?: number | null
    ip?: string | null
    sessionId?: string | null
    userAgent?: string | null
    createdAt?: string
  }

  interface PageData {
    authEvents: CursorPage<AuthEvent>
    freezeRecords: Paginated<FreezeRecord>
    adminActions: CursorPage<AdminAction>
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }
  let stepUpCode = $state("")
  let breakGlassCode = $state("")
  let breakGlassError = $state<string | null>(null)
  let pendingBreakGlass = $state<PendingBreakGlassSubmission | null>(null)
  let bypassBreakGlassSubmission: PendingBreakGlassSubmission | null = null

  const freezePage = $derived(data.freezeRecords?.page ?? 1)
  const events = $derived(data.authEvents?.items ?? [])
  const anomalyEvents = $derived(
    events.filter((event) => event.eventType.endsWith("_login_anomaly")),
  )
  const freezeRecords = $derived(data.freezeRecords?.items ?? [])
  const authNextCursor = $derived(data.authEvents?.nextCursor ?? null)
  const authPrevCursor = $derived(data.authEvents?.prevCursor ?? null)
  const authExportQuery = $derived.by(() => {
    const params = new URLSearchParams()
    const searchParams = $page.url.searchParams
    const email = searchParams.get("email")
    const eventType = searchParams.get("eventType")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const limit = searchParams.get("authLimit")
    const sort = searchParams.get("authSort")

    if (email) params.set("email", email)
    if (eventType) params.set("eventType", eventType)
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (limit) params.set("limit", limit)
    if (sort) params.set("sort", sort)

    const queryString = params.toString()
    return queryString ? `?${queryString}` : ""
  })
  const actionError = $derived($page.form?.error as string | undefined)
  const freezeReasonOptions: UserFreezeReason[] = [
    "manual_admin",
    "account_lock",
    "withdrawal_lock",
    "gameplay_lock",
    "pending_kyc",
    "aml_review",
    "auth_failure",
  ]
  const freezeScopeOptions: UserFreezeScope[] = [
    "account_lock",
    "withdrawal_lock",
    "gameplay_lock",
    "topup_lock",
  ]

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatFreezeValue = (value: string) => value.replaceAll("_", " ")
  const activeBreakGlassPolicy = $derived(pendingBreakGlass?.policy ?? null)
  const breakGlassStepUpHint = $derived(
    stepUpCode.trim() === ""
      ? t("saas.confirmDialog.stepUpHint")
      : null,
  )

  const closeBreakGlassDialog = () => {
    pendingBreakGlass = null
    breakGlassCode = ""
    breakGlassError = null
  }

  const handleBreakGlassSubmit = (event: SubmitEvent) => {
    const pending = resolvePendingBreakGlassSubmission(
      event,
      securityActionPolicies,
    )
    if (!pending) {
      return
    }

    if (
      bypassBreakGlassSubmission &&
      bypassBreakGlassSubmission.form === pending.form &&
      bypassBreakGlassSubmission.submitter === pending.submitter &&
      bypassBreakGlassSubmission.actionName === pending.actionName
    ) {
      bypassBreakGlassSubmission = null
      return
    }

    event.preventDefault()
    pendingBreakGlass = pending
    breakGlassCode = ""
    breakGlassError = null
  }

  const confirmBreakGlassDialog = () => {
    if (!pendingBreakGlass) {
      return
    }
    if (stepUpCode.trim() === "") {
      breakGlassError = t("saas.confirmDialog.mfaRequired")
      return
    }
    if (breakGlassCode.trim() === "") {
      breakGlassError = t("saas.confirmDialog.breakGlassRequired")
      return
    }

    upsertHiddenFormValue(
      pendingBreakGlass.form,
      "totpCode",
      stepUpCode.trim(),
    )
    upsertHiddenFormValue(
      pendingBreakGlass.form,
      "breakGlassCode",
      breakGlassCode.trim(),
    )

    const nextSubmission = pendingBreakGlass
    bypassBreakGlassSubmission = nextSubmission
    closeBreakGlassDialog()

    if (nextSubmission.submitter) {
      nextSubmission.form.requestSubmit(nextSubmission.submitter)
      return
    }

    nextSubmission.form.requestSubmit()
  }
</script>

<div class="space-y-6" onsubmitcapture={handleBreakGlassSubmit}>
<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("security.title")}
  </p>
  <h1 class="text-3xl font-semibold">{t("security.title")}</h1>
  <p class="text-sm text-slate-600">{t("security.description")}</p>
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

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body gap-3">
    <div>
      <h2 class="card-title">{t("security.stepUp.title")}</h2>
      <p class="text-sm text-slate-500">{t("security.stepUp.description")}</p>
    </div>
    <label class="form-control max-w-sm">
      <span class="label-text mb-2">{t("common.totpCode")}</span>
      <input
        name="totpCode"
        type="text"
        inputmode="text"
        autocomplete="one-time-code"
        class="input input-bordered"
        bind:value={stepUpCode}
        placeholder={t("security.stepUp.placeholder")}
      />
    </label>
  </div>
</section>

<section class="mt-6 card border border-amber-200 bg-amber-50/70 shadow-sm">
  <div class="card-body">
    <div>
      <h2 class="card-title text-amber-900">{t("security.alerts.title")}</h2>
      <p class="text-sm text-amber-800">{t("security.alerts.description")}</p>
    </div>

    {#if anomalyEvents.length === 0}
      <p class="text-sm text-amber-800">{t("security.alerts.empty")}</p>
    {:else}
      <div class="grid gap-3 md:grid-cols-2">
        {#each anomalyEvents as event}
          <article
            class="rounded-xl border border-amber-200 bg-white p-4 text-sm shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">{event.email ?? "-"}</p>
                <p class="text-xs uppercase tracking-[0.2em] text-amber-700">
                  {event.eventType}
                </p>
              </div>
              <p class="text-xs text-slate-500">
                {formatDate(event.createdAt)}
              </p>
            </div>
            <dl class="mt-3 space-y-2 text-slate-600">
              <div class="flex justify-between gap-4">
                <dt>{t("security.authEvents.headers.ip")}</dt>
                <dd class="text-right font-mono text-xs">{event.ip ?? "-"}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt>{t("security.alerts.previousIp")}</dt>
                <dd class="text-right font-mono text-xs">
                  {String(event.metadata?.previousIp ?? "-")}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt>{t("security.alerts.signals")}</dt>
                <dd class="text-right text-xs">
                  {Array.isArray(event.metadata?.signals)
                    ? event.metadata?.signals.join(", ")
                    : "-"}
                </dd>
              </div>
            </dl>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>
</div>

<ConfirmDialog
  open={activeBreakGlassPolicy !== null}
  title={activeBreakGlassPolicy?.title ?? t("saas.confirmDialog.title")}
  description={
    activeBreakGlassPolicy?.description ??
    t("saas.confirmDialog.description")
  }
  bind:breakGlassCode
  breakGlassLabel={t("login.breakGlassCode")}
  breakGlassPlaceholder={t("login.breakGlassPlaceholder")}
  confirmLabel={activeBreakGlassPolicy?.confirmLabel ?? t("saas.confirmDialog.confirm")}
  cancelLabel={t("saas.confirmDialog.cancel")}
  error={breakGlassError}
  stepUpHint={breakGlassStepUpHint}
  on:cancel={closeBreakGlassDialog}
  on:confirm={confirmBreakGlassDialog}
/>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("security.filters.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("security.filters.description")}
        </p>
      </div>
    </div>

    <form method="get" class="mt-4 grid gap-4 md:grid-cols-6">
      <div class="form-control">
        <label class="label" for="filter-email">
          <span class="label-text">{t("security.filters.email")}</span>
        </label>
        <input
          id="filter-email"
          name="email"
          class="input input-bordered"
          autocomplete="email"
          value={$page.url.searchParams.get("email") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="filter-event">
          <span class="label-text">{t("security.filters.eventType")}</span>
        </label>
        <input
          id="filter-event"
          name="eventType"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("eventType") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="filter-from">
          <span class="label-text">{t("security.filters.from")}</span>
        </label>
        <input
          id="filter-from"
          name="from"
          type="datetime-local"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("from") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="filter-to">
          <span class="label-text">{t("security.filters.to")}</span>
        </label>
        <input
          id="filter-to"
          name="to"
          type="datetime-local"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("to") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="filter-limit">
          <span class="label-text">{t("security.filters.limit")}</span>
        </label>
        <input
          id="filter-limit"
          name="authLimit"
          type="number"
          min="1"
          max="200"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("authLimit") ?? "50"}
        />
      </div>
      <div class="form-control">
        <label class="label" for="filter-sort">
          <span class="label-text">{t("security.filters.sort")}</span>
        </label>
        <select
          id="filter-sort"
          name="authSort"
          class="select select-bordered"
          value={$page.url.searchParams.get("authSort") ?? "desc"}
        >
          <option value="desc">{t("security.filters.sortNewest")}</option>
          <option value="asc">{t("security.filters.sortOldest")}</option>
        </select>
      </div>
      <input
        type="hidden"
        name="freezeLimit"
        value={$page.url.searchParams.get("freezeLimit") ?? ""}
      />
      <input
        type="hidden"
        name="freezePage"
        value={$page.url.searchParams.get("freezePage") ?? ""}
      />
      <input
        type="hidden"
        name="freezeSort"
        value={$page.url.searchParams.get("freezeSort") ?? ""}
      />
      <div class="flex items-end gap-3">
        <button class="btn btn-primary" type="submit">
          {t("security.filters.apply")}
        </button>
        <a class="btn btn-outline" href={`/security/export${authExportQuery}`}>
          {t("security.filters.export")}
        </a>
      </div>
    </form>
  </div>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("security.freeze.createTitle")}</h2>
        <p class="text-sm text-slate-500">
          {t("security.freeze.createDescription")}
        </p>
      </div>
    </div>

    <form
      method="post"
      action="?/createFreeze"
      class="mt-4 grid gap-4 md:grid-cols-4"
    >
      <div class="form-control">
        <label class="label" for="freeze-user">
          <span class="label-text">{t("security.freeze.userId")}</span>
        </label>
        <input
          id="freeze-user"
          name="userId"
          type="number"
          class="input input-bordered"
          autocomplete="off"
          required
        />
      </div>
      <div class="form-control">
        <label class="label" for="freeze-reason">
          <span class="label-text">{t("security.freeze.reason")}</span>
        </label>
        <select
          id="freeze-reason"
          name="reason"
          class="select select-bordered"
        >
          {#each freezeReasonOptions as option}
            <option value={option}>{formatFreezeValue(option)}</option>
          {/each}
        </select>
      </div>
      <div class="form-control">
        <label class="label" for="freeze-scope">
          <span class="label-text">{t("security.freeze.scope")}</span>
        </label>
        <select id="freeze-scope" name="scope" class="select select-bordered">
          {#each freezeScopeOptions as option}
            <option value={option}>{formatFreezeValue(option)}</option>
          {/each}
        </select>
      </div>
      <input type="hidden" name="totpCode" value={stepUpCode} />
      <div class="flex items-end">
        <button class="btn btn-primary" type="submit">
          {t("security.freeze.freeze")}
        </button>
      </div>
    </form>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("security.authEvents.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("security.authEvents.description")}
        </p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("security.authEvents.headers.id")}</th>
            <th>{t("security.authEvents.headers.email")}</th>
            <th>{t("security.authEvents.headers.userId")}</th>
            <th>{t("security.authEvents.headers.eventType")}</th>
            <th>{t("security.authEvents.headers.ip")}</th>
            <th>{t("security.authEvents.headers.userAgent")}</th>
            <th>{t("security.authEvents.headers.createdAt")}</th>
          </tr>
        </thead>
        <tbody>
          {#each events as event}
            <tr>
              <td>{event.id}</td>
              <td>{event.email ?? "-"}</td>
              <td>{event.userId ?? "-"}</td>
              <td>{event.eventType}</td>
              <td>{event.ip ?? "-"}</td>
              <td class="max-w-xs truncate" title={event.userAgent ?? ""}>
                {event.userAgent ?? "-"}
              </td>
              <td>{formatDate(event.createdAt)}</td>
            </tr>
          {/each}
          {#if events.length === 0}
            <tr>
              <td colspan="7" class="text-center text-slate-500">
                {t("security.authEvents.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      {#if data.authEvents?.hasPrevious && authPrevCursor}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), authCursor: authPrevCursor, authDirection: "prev" }).toString()}`}
        >
          {t("common.prev")}
        </a>
      {/if}
      {#if data.authEvents?.hasNext && authNextCursor}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), authCursor: authNextCursor, authDirection: "next" }).toString()}`}
        >
          {t("common.next")}
        </a>
      {/if}
    </div>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("security.freeze.title")}</h2>
        <p class="text-sm text-slate-500">{t("security.freeze.description")}</p>
      </div>
    </div>

    <form method="get" class="mt-4 grid gap-4 md:grid-cols-3">
      <div class="form-control">
        <label class="label" for="freeze-limit">
          <span class="label-text">{t("security.freeze.limit")}</span>
        </label>
        <input
          id="freeze-limit"
          name="freezeLimit"
          type="number"
          min="1"
          max="200"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("freezeLimit") ?? "50"}
        />
      </div>
      <div class="form-control">
        <label class="label" for="freeze-sort">
          <span class="label-text">{t("security.freeze.sort")}</span>
        </label>
        <select
          id="freeze-sort"
          name="freezeSort"
          class="select select-bordered"
          value={$page.url.searchParams.get("freezeSort") ?? "desc"}
        >
          <option value="desc">{t("security.freeze.sortNewest")}</option>
          <option value="asc">{t("security.freeze.sortOldest")}</option>
        </select>
      </div>
      <input type="hidden" name="freezePage" value="1" />
      <input
        type="hidden"
        name="email"
        value={$page.url.searchParams.get("email") ?? ""}
      />
      <input
        type="hidden"
        name="eventType"
        value={$page.url.searchParams.get("eventType") ?? ""}
      />
      <input
        type="hidden"
        name="from"
        value={$page.url.searchParams.get("from") ?? ""}
      />
      <input
        type="hidden"
        name="to"
        value={$page.url.searchParams.get("to") ?? ""}
      />
      <input
        type="hidden"
        name="authLimit"
        value={$page.url.searchParams.get("authLimit") ?? ""}
      />
      <input
        type="hidden"
        name="authCursor"
        value={$page.url.searchParams.get("authCursor") ?? ""}
      />
      <input
        type="hidden"
        name="authDirection"
        value={$page.url.searchParams.get("authDirection") ?? ""}
      />
      <input
        type="hidden"
        name="authSort"
        value={$page.url.searchParams.get("authSort") ?? ""}
      />
      <div class="flex items-end">
        <button class="btn btn-primary" type="submit">
          {t("security.filters.apply")}
        </button>
      </div>
    </form>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("security.freeze.headers.id")}</th>
            <th>{t("security.freeze.headers.userId")}</th>
            <th>{t("security.freeze.headers.reason")}</th>
            <th>{t("security.freeze.headers.scope")}</th>
            <th>{t("security.freeze.headers.status")}</th>
            <th>{t("security.freeze.headers.createdAt")}</th>
            <th class="text-right">{t("security.freeze.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each freezeRecords as record}
            <tr>
              <td>{record.id}</td>
              <td>{record.userId}</td>
              <td>{formatFreezeValue(record.reason)}</td>
              <td>{formatFreezeValue(record.scope)}</td>
              <td>{record.status}</td>
              <td>{formatDate(record.createdAt)}</td>
              <td class="text-right">
                <form method="post" action="?/releaseFreeze">
                  <input
                    type="hidden"
                    name="freezeRecordId"
                    value={record.id}
                  />
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <button class="btn btn-xs btn-outline" type="submit">
                    {t("security.freeze.release")}
                  </button>
                </form>
              </td>
            </tr>
          {/each}
          {#if freezeRecords.length === 0}
            <tr>
              <td colspan="7" class="text-center text-slate-500">
                {t("security.freeze.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      {#if freezePage > 1}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), freezePage: String(freezePage - 1) }).toString()}`}
        >
          {t("common.prev")}
        </a>
      {/if}
      {#if data.freezeRecords?.hasNext}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), freezePage: String(freezePage + 1) }).toString()}`}
        >
          {t("common.next")}
        </a>
      {/if}
    </div>
  </div>
</section>
