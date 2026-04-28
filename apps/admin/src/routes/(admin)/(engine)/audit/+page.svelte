<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  interface AdminAction {
    id: number
    adminId?: number | null
    adminEmail?: string | null
    action: string
    targetType?: string | null
    targetId?: number | null
    subjectUserId?: number | null
    subjectUserEmail?: string | null
    ip?: string | null
    sessionId?: string | null
    userAgent?: string | null
    metadata?: Record<string, unknown> | null
    createdAt?: string | Date
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

  interface AuditSummary {
    totalCount: number
    byAdmin: Array<{
      adminId: number | null
      adminEmail: string | null
      count: number
    }>
    byAction: Array<{
      action: string
      count: number
    }>
    byUser: Array<{
      userId: number | null
      userEmail: string | null
      count: number
    }>
    byDay: Array<{
      day: string
      count: number
    }>
  }

  interface PageData {
    adminActions: CursorPage<AdminAction>
    summary: AuditSummary
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }

  const adminActions = $derived(data.adminActions?.items ?? [])
  const summary = $derived(data.summary)
  const nextCursor = $derived(data.adminActions?.nextCursor ?? null)
  const prevCursor = $derived(data.adminActions?.prevCursor ?? null)

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString()
  }

  const formatActor = (
    id: number | null | undefined,
    email: string | null | undefined,
    fallback: string,
  ) => {
    if (email && id) return `${email} · #${id}`
    if (email) return email
    if (id) return `#${id}`
    return fallback
  }

  const hasMetadata = (value?: Record<string, unknown> | null) =>
    !!value && Object.keys(value).length > 0

  const formatMetadata = (value?: Record<string, unknown> | null) =>
    JSON.stringify(value ?? {}, null, 2)

  const targetLabel = (action: AdminAction) => {
    if (!action.targetType && !action.targetId) return t("audit.table.noTarget")
    if (action.targetType && action.targetId) return `${action.targetType} · #${action.targetId}`
    if (action.targetType) return action.targetType
    return `#${action.targetId}`
  }

  const buildHref = (updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams($page.url.searchParams)

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    params.delete("cursor")
    params.delete("direction")

    const query = params.toString()
    return query ? `?${query}` : "?"
  }

  const buildDayHref = (day: string) =>
    buildHref({
      from: `${day}T00:00`,
      to: `${day}T23:59`,
    })

  const exportQuery = $derived.by(() => {
    const params = new URLSearchParams()
    const searchParams = $page.url.searchParams
    const adminId = searchParams.get("adminId")
    const userId = searchParams.get("userId")
    const action = searchParams.get("action")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const limit = searchParams.get("limit")
    const sort = searchParams.get("sort")

    if (adminId) params.set("adminId", adminId)
    if (userId) params.set("userId", userId)
    if (action) params.set("action", action)
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (limit) params.set("limit", limit)
    if (sort) params.set("sort", sort)

    const query = params.toString()
    return query ? `?${query}` : ""
  })
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("common.navAudit")}
  </p>
  <h1 class="text-3xl font-semibold">{t("audit.title")}</h1>
  <p class="max-w-4xl text-sm text-slate-600">{t("audit.description")}</p>
</header>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body gap-4">
    <div
      class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("audit.title")}</h2>
        <p class="text-sm text-slate-500">{t("audit.description")}</p>
      </div>
      <a class="btn btn-outline btn-sm" href={`/audit/export${exportQuery}`}>
        {t("audit.export")}
      </a>
    </div>

    <form method="get" class="grid gap-4 md:grid-cols-7">
      <div class="form-control">
        <label class="label" for="audit-admin-id">
          <span class="label-text">{t("audit.filters.adminId")}</span>
        </label>
        <input
          id="audit-admin-id"
          name="adminId"
          type="number"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("adminId") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-user-id">
          <span class="label-text">{t("audit.filters.userId")}</span>
        </label>
        <input
          id="audit-user-id"
          name="userId"
          type="number"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("userId") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-action">
          <span class="label-text">{t("audit.filters.action")}</span>
        </label>
        <input
          id="audit-action"
          name="action"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("action") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-from">
          <span class="label-text">{t("audit.filters.from")}</span>
        </label>
        <input
          id="audit-from"
          name="from"
          type="datetime-local"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("from") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-to">
          <span class="label-text">{t("audit.filters.to")}</span>
        </label>
        <input
          id="audit-to"
          name="to"
          type="datetime-local"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("to") ?? ""}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-limit">
          <span class="label-text">{t("audit.filters.limit")}</span>
        </label>
        <input
          id="audit-limit"
          name="limit"
          type="number"
          min="1"
          max="200"
          class="input input-bordered"
          autocomplete="off"
          value={$page.url.searchParams.get("limit") ?? "50"}
        />
      </div>
      <div class="form-control">
        <label class="label" for="audit-sort">
          <span class="label-text">{t("audit.filters.sort")}</span>
        </label>
        <select
          id="audit-sort"
          name="sort"
          class="select select-bordered"
          value={$page.url.searchParams.get("sort") ?? "desc"}
        >
          <option value="desc">{t("audit.filters.sortNewest")}</option>
          <option value="asc">{t("audit.filters.sortOldest")}</option>
        </select>
      </div>
      <div class="flex flex-wrap items-end gap-3 md:col-span-7">
        <button class="btn btn-primary" type="submit">
          {t("audit.filters.apply")}
        </button>
        <a class="btn btn-outline" href="/audit">{t("audit.filters.reset")}</a>
      </div>
    </form>
  </div>
</section>

<section class="mt-6 grid gap-4 xl:grid-cols-4">
  <article class="card bg-base-100 shadow">
    <div class="card-body gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {t("audit.summary.total")}
      </p>
      <p class="text-4xl font-semibold text-slate-900">
        {summary.totalCount}
      </p>
    </div>
  </article>

  <article class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title text-base">{t("audit.summary.byAdmin")}</h2>
      {#if summary.byAdmin.length === 0}
        <p class="text-sm text-slate-500">{t("audit.summary.empty")}</p>
      {:else}
        <div class="space-y-2 text-sm">
          {#each summary.byAdmin as group}
            <div class="flex items-center justify-between gap-3">
              {#if group.adminId}
                <a class="link-hover link" href={buildHref({ adminId: String(group.adminId) })}>
                  {formatActor(
                    group.adminId,
                    group.adminEmail,
                    t("audit.summary.allAdmins"),
                  )}
                </a>
              {:else}
                <span class="text-slate-500">
                  {formatActor(
                    group.adminId,
                    group.adminEmail,
                    t("audit.summary.allAdmins"),
                  )}
                </span>
              {/if}
              <span class="badge badge-outline">{group.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </article>

  <article class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title text-base">{t("audit.summary.byAction")}</h2>
      {#if summary.byAction.length === 0}
        <p class="text-sm text-slate-500">{t("audit.summary.empty")}</p>
      {:else}
        <div class="space-y-2 text-sm">
          {#each summary.byAction as group}
            <div class="flex items-center justify-between gap-3">
              <a class="link-hover link" href={buildHref({ action: group.action })}>
                {group.action}
              </a>
              <span class="badge badge-outline">{group.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </article>

  <article class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title text-base">{t("audit.summary.byUser")}</h2>
      {#if summary.byUser.length === 0}
        <p class="text-sm text-slate-500">{t("audit.summary.empty")}</p>
      {:else}
        <div class="space-y-2 text-sm">
          {#each summary.byUser as group}
            <div class="flex items-center justify-between gap-3">
              {#if group.userId}
                <a class="link-hover link" href={buildHref({ userId: String(group.userId) })}>
                  {formatActor(
                    group.userId,
                    group.userEmail,
                    t("audit.summary.allUsers"),
                  )}
                </a>
              {:else}
                <span class="text-slate-500">
                  {formatActor(
                    group.userId,
                    group.userEmail,
                    t("audit.summary.allUsers"),
                  )}
                </span>
              {/if}
              <span class="badge badge-outline">{group.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </article>
</section>

<section class="mt-4 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("audit.summary.byDay")}</h2>
        <p class="text-sm text-slate-500">{t("audit.table.description")}</p>
      </div>
    </div>

    {#if summary.byDay.length === 0}
      <p class="text-sm text-slate-500">{t("audit.summary.empty")}</p>
    {:else}
      <div class="mt-2 flex flex-wrap gap-3">
        {#each summary.byDay as bucket}
          <a
            href={buildDayHref(bucket.day)}
            class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition hover:border-primary hover:bg-primary/5"
          >
            <div class="font-medium text-slate-900">{bucket.day}</div>
            <div class="mt-1 text-slate-500">{bucket.count}</div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("audit.table.title")}</h2>
        <p class="text-sm text-slate-500">{t("audit.table.description")}</p>
      </div>
      <a class="btn btn-outline btn-sm" href={`/audit/export${exportQuery}`}>
        {t("audit.export")}
      </a>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>{t("audit.table.headers.id")}</th>
            <th>{t("audit.table.headers.createdAt")}</th>
            <th>{t("audit.table.headers.admin")}</th>
            <th>{t("audit.table.headers.action")}</th>
            <th>{t("audit.table.headers.user")}</th>
            <th>{t("audit.table.headers.target")}</th>
            <th>{t("audit.table.headers.request")}</th>
            <th>{t("audit.table.headers.context")}</th>
          </tr>
        </thead>
        <tbody>
          {#each adminActions as action}
            <tr>
              <td class="align-top font-mono text-xs">{action.id}</td>
              <td class="align-top text-xs text-slate-600">
                {formatDate(action.createdAt)}
              </td>
              <td class="align-top">
                <div class="max-w-[15rem] text-sm font-medium text-slate-900">
                  {formatActor(
                    action.adminId,
                    action.adminEmail,
                    t("audit.table.unknownAdmin"),
                  )}
                </div>
              </td>
              <td class="align-top font-medium text-slate-900">
                {action.action}
              </td>
              <td class="align-top">
                <div class="max-w-[15rem] text-sm text-slate-700">
                  {formatActor(
                    action.subjectUserId,
                    action.subjectUserEmail,
                    t("audit.table.unknownUser"),
                  )}
                </div>
              </td>
              <td class="align-top text-sm text-slate-700">
                {targetLabel(action)}
              </td>
              <td class="align-top text-xs text-slate-600">
                <div>{action.ip ?? "-"}</div>
                <div class="mt-1 max-w-[15rem] truncate" title={action.sessionId ?? ""}>
                  {t("audit.table.session")}: {action.sessionId ?? "-"}
                </div>
              </td>
              <td class="align-top">
                <div
                  class="max-w-[18rem] truncate text-xs text-slate-600"
                  title={action.userAgent ?? ""}
                >
                  {t("audit.table.agent")}: {action.userAgent ?? "-"}
                </div>
                {#if hasMetadata(action.metadata)}
                  <details class="mt-2">
                    <summary class="cursor-pointer text-xs font-medium text-slate-700">
                      {t("audit.table.metadata")}
                    </summary>
                    <pre
                      class="mt-2 max-w-[22rem] overflow-x-auto rounded-xl bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-200"
                    >{formatMetadata(action.metadata)}</pre>
                  </details>
                {:else}
                  <p class="mt-2 text-xs text-slate-400">
                    {t("audit.table.noMetadata")}
                  </p>
                {/if}
              </td>
            </tr>
          {/each}
          {#if adminActions.length === 0}
            <tr>
              <td colspan="8" class="text-center text-slate-500">
                {t("audit.table.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      {#if data.adminActions?.hasPrevious && prevCursor}
        <a
          class="btn btn-outline btn-sm"
          href={buildHref({ cursor: prevCursor, direction: "prev" })}
        >
          {t("common.prev")}
        </a>
      {/if}
      {#if data.adminActions?.hasNext && nextCursor}
        <a
          class="btn btn-outline btn-sm"
          href={buildHref({ cursor: nextCursor, direction: "next" })}
        >
          {t("common.next")}
        </a>
      {/if}
    </div>
  </div>
</section>
