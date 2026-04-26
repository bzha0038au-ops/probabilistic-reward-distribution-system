<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

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
    reason?: string | null
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

  interface PageData {
    authEvents: CursorPage<AuthEvent>
    freezeRecords: Paginated<FreezeRecord>
    adminActions: CursorPage<AdminAction>
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }
  let stepUpCode = $state("")

  const freezePage = $derived(data.freezeRecords?.page ?? 1)
  const events = $derived(data.authEvents?.items ?? [])
  const anomalyEvents = $derived(
    events.filter((event) => event.eventType.endsWith("_login_anomaly"))
  )
  const freezeRecords = $derived(data.freezeRecords?.items ?? [])
  const adminActions = $derived(data.adminActions?.items ?? [])
  const authNextCursor = $derived(data.authEvents?.nextCursor ?? null)
  const authPrevCursor = $derived(data.authEvents?.prevCursor ?? null)
  const adminNextCursor = $derived(data.adminActions?.nextCursor ?? null)
  const adminPrevCursor = $derived(data.adminActions?.prevCursor ?? null)
  const authExportQuery = $derived(() => {
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
  const adminExportQuery = $derived(() => {
    const params = new URLSearchParams()
    const searchParams = $page.url.searchParams
    const adminId = searchParams.get("adminId")
    const adminAction = searchParams.get("adminAction")
    const adminFrom = searchParams.get("adminFrom")
    const adminTo = searchParams.get("adminTo")
    const adminLimit = searchParams.get("adminLimit")
    const adminSort = searchParams.get("adminSort")

    if (adminId) params.set("adminId", adminId)
    if (adminAction) params.set("action", adminAction)
    if (adminFrom) params.set("from", adminFrom)
    if (adminTo) params.set("to", adminTo)
    if (adminLimit) params.set("limit", adminLimit)
    if (adminSort) params.set("sort", adminSort)

    const queryString = params.toString()
    return queryString ? `?${queryString}` : ""
  })
  const actionError = $derived($page.form?.error as string | undefined)

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  interface AdminAction {
    id: number
    adminId?: number | null
    action: string
    targetType?: string | null
    targetId?: number | null
    ip?: string | null
    createdAt?: string
  }
</script>

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
        inputmode="numeric"
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
          <article class="rounded-xl border border-amber-200 bg-white p-4 text-sm shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">{event.email ?? "-"}</p>
                <p class="text-xs uppercase tracking-[0.2em] text-amber-700">
                  {event.eventType}
                </p>
              </div>
              <p class="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
            </div>
            <dl class="mt-3 space-y-2 text-slate-600">
              <div class="flex justify-between gap-4">
                <dt>IP</dt>
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

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("security.filters.title")}</h2>
        <p class="text-sm text-slate-500">{t("security.filters.description")}</p>
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
        name="adminId"
        value={$page.url.searchParams.get("adminId") ?? ""}
      />
      <input
        type="hidden"
        name="adminAction"
        value={$page.url.searchParams.get("adminAction") ?? ""}
      />
      <input
        type="hidden"
        name="adminFrom"
        value={$page.url.searchParams.get("adminFrom") ?? ""}
      />
      <input
        type="hidden"
        name="adminTo"
        value={$page.url.searchParams.get("adminTo") ?? ""}
      />
      <input
        type="hidden"
        name="adminLimit"
        value={$page.url.searchParams.get("adminLimit") ?? ""}
      />
      <input
        type="hidden"
        name="adminCursor"
        value={$page.url.searchParams.get("adminCursor") ?? ""}
      />
      <input
        type="hidden"
        name="adminDirection"
        value={$page.url.searchParams.get("adminDirection") ?? ""}
      />
      <input
        type="hidden"
        name="adminSort"
        value={$page.url.searchParams.get("adminSort") ?? ""}
      />
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
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("security.freeze.createTitle")}</h2>
        <p class="text-sm text-slate-500">{t("security.freeze.createDescription")}</p>
      </div>
    </div>

    <form method="post" action="?/createFreeze" class="mt-4 grid gap-4 md:grid-cols-3">
      <div class="form-control">
        <label class="label" for="freeze-user">
          <span class="label-text">{t("security.freeze.userId")}</span>
        </label>
        <input
          id="freeze-user"
          name="userId"
          type="number"
          class="input input-bordered"
          required
        />
      </div>
      <div class="form-control md:col-span-2">
        <label class="label" for="freeze-reason">
          <span class="label-text">{t("security.freeze.reason")}</span>
        </label>
        <input
          id="freeze-reason"
          name="reason"
          class="input input-bordered"
          placeholder={t("security.freeze.reasonPlaceholder")}
        />
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
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("security.authEvents.title")}</h2>
        <p class="text-sm text-slate-500">{t("security.authEvents.description")}</p>
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
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("security.adminActions.title")}</h2>
        <p class="text-sm text-slate-500">{t("security.adminActions.description")}</p>
      </div>
      <a class="btn btn-outline btn-sm" href={`/security/admin-actions/export${adminExportQuery}`}>
        {t("security.adminActions.export")}
      </a>
    </div>

    <form method="get" class="mt-4 grid gap-4 md:grid-cols-6">
      <div class="form-control">
        <label class="label" for="admin-action-id">
          <span class="label-text">{t("security.adminActions.filters.adminId")}</span>
        </label>
        <input
          id="admin-action-id"
          name="adminId"
          type="number"
          class="input input-bordered"
          value={$page.url.searchParams.get("adminId") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="admin-action-action">
          <span class="label-text">{t("security.adminActions.filters.action")}</span>
        </label>
        <input
          id="admin-action-action"
          name="adminAction"
          class="input input-bordered"
          value={$page.url.searchParams.get("adminAction") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="admin-action-from">
          <span class="label-text">{t("security.adminActions.filters.from")}</span>
        </label>
        <input
          id="admin-action-from"
          name="adminFrom"
          type="datetime-local"
          class="input input-bordered"
          value={$page.url.searchParams.get("adminFrom") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="admin-action-to">
          <span class="label-text">{t("security.adminActions.filters.to")}</span>
        </label>
        <input
          id="admin-action-to"
          name="adminTo"
          type="datetime-local"
          class="input input-bordered"
          value={$page.url.searchParams.get("adminTo") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="admin-action-limit">
          <span class="label-text">{t("security.adminActions.filters.limit")}</span>
        </label>
        <input
          id="admin-action-limit"
          name="adminLimit"
          type="number"
          min="1"
          max="200"
          class="input input-bordered"
          value={$page.url.searchParams.get("adminLimit") ?? "50"}
        />
      </div>
      <div class="form-control">
        <label class="label" for="admin-action-sort">
          <span class="label-text">{t("security.adminActions.filters.sort")}</span>
        </label>
        <select
          id="admin-action-sort"
          name="adminSort"
          class="select select-bordered"
          value={$page.url.searchParams.get("adminSort") ?? "desc"}
        >
          <option value="desc">{t("security.adminActions.filters.sortNewest")}</option>
          <option value="asc">{t("security.adminActions.filters.sortOldest")}</option>
        </select>
      </div>
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
          {t("security.adminActions.filters.apply")}
        </button>
        <a
          class="btn btn-outline"
          href={`/security/admin-actions/export${adminExportQuery}`}
        >
          {t("security.adminActions.export")}
        </a>
      </div>
    </form>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("security.adminActions.headers.id")}</th>
            <th>{t("security.adminActions.headers.adminId")}</th>
            <th>{t("security.adminActions.headers.action")}</th>
            <th>{t("security.adminActions.headers.targetType")}</th>
            <th>{t("security.adminActions.headers.targetId")}</th>
            <th>{t("security.adminActions.headers.ip")}</th>
            <th>{t("security.adminActions.headers.createdAt")}</th>
          </tr>
        </thead>
        <tbody>
          {#each adminActions as action}
            <tr>
              <td>{action.id}</td>
              <td>{action.adminId ?? "-"}</td>
              <td>{action.action}</td>
              <td>{action.targetType ?? "-"}</td>
              <td>{action.targetId ?? "-"}</td>
              <td>{action.ip ?? "-"}</td>
              <td>{formatDate(action.createdAt)}</td>
            </tr>
          {/each}
          {#if adminActions.length === 0}
            <tr>
              <td colspan="7" class="text-center text-slate-500">
                {t("security.adminActions.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      {#if data.adminActions?.hasPrevious && adminPrevCursor}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), adminCursor: adminPrevCursor, adminDirection: "prev" }).toString()}`}
        >
          {t("common.prev")}
        </a>
      {/if}
      {#if data.adminActions?.hasNext && adminNextCursor}
        <a
          class="btn btn-outline btn-sm"
          href={`?${new URLSearchParams({ ...Object.fromEntries($page.url.searchParams), adminCursor: adminNextCursor, adminDirection: "next" }).toString()}`}
        >
          {t("common.next")}
        </a>
      {/if}
    </div>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
      <input
        type="hidden"
        name="adminId"
        value={$page.url.searchParams.get("adminId") ?? ""}
      />
      <input
        type="hidden"
        name="adminAction"
        value={$page.url.searchParams.get("adminAction") ?? ""}
      />
      <input
        type="hidden"
        name="adminFrom"
        value={$page.url.searchParams.get("adminFrom") ?? ""}
      />
      <input
        type="hidden"
        name="adminTo"
        value={$page.url.searchParams.get("adminTo") ?? ""}
      />
      <input
        type="hidden"
        name="adminLimit"
        value={$page.url.searchParams.get("adminLimit") ?? ""}
      />
      <input
        type="hidden"
        name="adminCursor"
        value={$page.url.searchParams.get("adminCursor") ?? ""}
      />
      <input
        type="hidden"
        name="adminDirection"
        value={$page.url.searchParams.get("adminDirection") ?? ""}
      />
      <input
        type="hidden"
        name="adminSort"
        value={$page.url.searchParams.get("adminSort") ?? ""}
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
              <td>{record.reason ?? "-"}</td>
              <td>{record.status}</td>
              <td>{formatDate(record.createdAt)}</td>
              <td class="text-right">
                <form method="post" action="?/releaseFreeze">
                  <input type="hidden" name="userId" value={record.userId} />
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
              <td colspan="6" class="text-center text-slate-500">
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
