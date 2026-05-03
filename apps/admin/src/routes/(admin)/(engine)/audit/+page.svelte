<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AuditModuleTabs from "./audit-module-tabs.svelte"
  import type { AdminAction, PageData } from "./page-support"

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }

  const adminActions = $derived(data.adminActions?.items ?? [])
  const summary = $derived(data.summary)
  const nextCursor = $derived(data.adminActions?.nextCursor ?? null)
  const prevCursor = $derived(data.adminActions?.prevCursor ?? null)
  const selectedAction = $derived(adminActions[0] ?? null)
  const topAdmin = $derived(summary.byAdmin[0] ?? null)
  const topAction = $derived(summary.byAction[0] ?? null)
  const topUser = $derived(summary.byUser[0] ?? null)
  const windowCount = $derived(summary.byDay.length)
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/audit/queue") return "queue"
    if ($page.url.pathname === "/audit/context") return "context"
    if ($page.url.pathname === "/audit/filters") return "filters"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isQueueModule = $derived(activeModule === "queue")
  const isContextModule = $derived(activeModule === "context")
  const isFiltersModule = $derived(activeModule === "filters")
  const pageDescription = $derived.by(() => {
    if (activeModule === "queue") {
      return "审计队列和分页窗口拆成独立模块，只看当前 query 的 event list。"
    }
    if (activeModule === "context") {
      return "选中事件的 payload、session traces 和 day buckets 单独成页，方便做上下文还原。"
    }
    if (activeModule === "filters") {
      return "Filter console、grouped distributions 和 review protocol 独立出来，不再挤在队列旁边。"
    }
    return t("audit.description")
  })
  const auditModules = $derived([
    {
      href: "/audit/queue",
      eyebrow: "Audit Queue",
      title: "Queue",
      description:
        "按当前过滤窗口查看 event queue，保留分页和导出前的基础排查流程。",
      badge: `${adminActions.length}`,
    },
    {
      href: "/audit/context",
      eyebrow: "Event Context",
      title: "Context",
      description:
        "把选中事件的 raw payload、request context 和 day buckets 拆出来，便于追时间线。",
      badge: selectedAction ? `#${selectedAction.id}` : "empty",
    },
    {
      href: "/audit/filters",
      eyebrow: "Filter Console",
      title: "Filters",
      description:
        "筛选条件、distribution buckets 和 review protocol 单独成页，不再和 queue 争首屏。",
      badge: `${summary.byAction.length}`,
    },
  ])

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf())
      ? String(value)
      : parsed.toLocaleString()
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
    if (action.targetType && action.targetId) {
      return `${action.targetType} · #${action.targetId}`
    }
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

  const selectedActionSummary = $derived.by(() => {
    if (!selectedAction) return []

    return [
      {
        label: t("audit.table.headers.admin"),
        value: formatActor(
          selectedAction.adminId,
          selectedAction.adminEmail,
          t("audit.table.unknownAdmin"),
        ),
      },
      {
        label: t("audit.table.headers.user"),
        value: formatActor(
          selectedAction.subjectUserId,
          selectedAction.subjectUserEmail,
          t("audit.table.unknownUser"),
        ),
      },
      {
        label: t("audit.table.headers.target"),
        value: targetLabel(selectedAction),
      },
      {
        label: t("audit.table.headers.createdAt"),
        value: formatDate(selectedAction.createdAt),
      },
      {
        label: "IP",
        value: selectedAction.ip ?? "-",
      },
      {
        label: t("audit.table.session"),
        value: selectedAction.sessionId ?? "-",
      },
    ]
  })
</script>

{#snippet auditActions()}
  <a class="btn btn-outline" href={`/audit/export${exportQuery}`}>
    {t("audit.export")}
  </a>
{/snippet}

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · governanceAudit"
    eyebrow={t("common.navAudit")}
    title={t("audit.title")}
    description={pageDescription}
    actions={auditActions}
  />

  <AuditModuleTabs />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          {t("audit.summary.total")}
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {summary.totalCount}
          </p>
          <span class="badge badge-outline">ledger</span>
        </div>
        <p class="text-sm text-slate-500">
          Total admin actions returned by the current audit summary window.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Visible Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {adminActions.length}
          </p>
          <span class="badge badge-outline">loaded</span>
        </div>
        <p class="text-sm text-slate-500">
          Rows currently visible inside the active audit query window.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Primary Action
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {topAction?.count ?? 0}
          </p>
          <span class="badge badge-outline">action</span>
        </div>
        <p class="text-sm text-slate-500">
          {topAction ? topAction.action : t("audit.summary.empty")}
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Lead Operator
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {topAdmin?.count ?? 0}
          </p>
          <span class="badge badge-outline">admin</span>
        </div>
        <p class="text-sm text-slate-500">
          {topAdmin
            ? formatActor(
                topAdmin.adminId,
                topAdmin.adminEmail,
                t("audit.summary.allAdmins"),
              )
            : t("audit.summary.empty")}
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Window Buckets
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {windowCount}
          </p>
          <span class="badge badge-outline">days</span>
        </div>
        <p class="text-sm text-slate-500">
          {topUser
            ? `Lead subject: ${formatActor(topUser.userId, topUser.userEmail, t("audit.summary.allUsers"))}`
            : t("audit.summary.empty")}
        </p>
      </div>
    </article>
  </section>

  {#if isHubModule}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]"
    >
      <div class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Audit Drawer
              </p>
              <h2
                class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
              >
                分域审计入口
              </h2>
            </div>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            队列、事件上下文和筛选控制已经拆开。先选择模块，再进入
            queue、payload 或 grouped distribution 的具体审查流。
          </p>

          <div class="grid gap-4 lg:grid-cols-3">
            {#each auditModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]"
                    >arrow_forward</span
                  >
                </div>
              </a>
            {/each}
          </div>
        </div>
      </div>

      <aside class="space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Review Protocol
              </p>
              <h2 class="card-title mt-2">Audit Handling</h2>
              <p class="text-sm text-slate-500">
                Keep queue context, payload context, and grouped distributions
                in sync before exporting or escalating.
              </p>
            </div>

            <ul class="space-y-2 text-sm text-slate-600">
              <li>
                1. Confirm the actor, subject user, and target together before
                interpreting the action.
              </li>
              <li>
                2. Use grouped admin, action, and user buckets to narrow the
                queue before exporting evidence.
              </li>
              <li>
                3. Prefer daily windows when reconstructing incident timelines
                or operator interventions.
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isQueueModule}
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Audit Queue
            </p>
            <h2 class="card-title mt-2">{t("audit.table.title")}</h2>
            <p class="text-sm text-slate-500">
              {t("audit.table.description")}
            </p>
          </div>
          <span class="badge badge-outline">
            {adminActions.length}/{data.adminActions.limit}
          </span>
        </div>

        <div
          class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
        >
          <table class="table">
            <thead>
              <tr>
                <th>{t("audit.table.headers.id")}</th>
                <th>{t("audit.table.headers.createdAt")}</th>
                <th>{t("audit.table.headers.admin")}</th>
                <th>{t("audit.table.headers.action")}</th>
                <th>{t("audit.table.headers.user")}</th>
                <th>{t("audit.table.headers.target")}</th>
              </tr>
            </thead>
            <tbody>
              {#each adminActions as action, index}
                <tr
                  style={index === 0
                    ? "background: var(--admin-primary-soft);"
                    : hasMetadata(action.metadata)
                      ? "background: var(--admin-warning-soft);"
                      : undefined}
                >
                  <td class="font-mono text-xs">{action.id}</td>
                  <td class="font-mono text-xs text-slate-600">
                    {formatDate(action.createdAt)}
                  </td>
                  <td class="text-sm text-slate-700">
                    {formatActor(
                      action.adminId,
                      action.adminEmail,
                      t("audit.table.unknownAdmin"),
                    )}
                  </td>
                  <td class="font-medium text-base-content">{action.action}</td>
                  <td class="text-sm text-slate-700">
                    {formatActor(
                      action.subjectUserId,
                      action.subjectUserEmail,
                      t("audit.table.unknownUser"),
                    )}
                  </td>
                  <td class="text-sm text-slate-700">{targetLabel(action)}</td>
                </tr>
              {/each}
              {#if adminActions.length === 0}
                <tr>
                  <td colspan="6" class="py-8 text-center text-slate-500">
                    {t("audit.table.empty")}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>

        <div class="admin-pagination">
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
  {/if}

  {#if isContextModule}
    <section class="space-y-6">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Raw Payload
              </p>
              <h2 class="card-title mt-2">Selected Event Context</h2>
              <p class="text-sm text-slate-500">
                Primary event metadata, request context, and browser/session
                traces from the first visible row.
              </p>
            </div>
            {#if selectedAction}
              <span class="badge badge-outline">event #{selectedAction.id}</span
              >
            {/if}
          </div>

          {#if selectedAction}
            <div
              class="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
            >
              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Event Summary
                </p>
                <dl class="mt-4 space-y-3 text-sm text-slate-700">
                  {#each selectedActionSummary as item}
                    <div class="flex items-start justify-between gap-4">
                      <dt>{item.label}</dt>
                      <dd class="max-w-[18rem] text-right font-mono text-xs">
                        {item.value}
                      </dd>
                    </div>
                  {/each}
                </dl>

                <div class="mt-4 space-y-3">
                  <div class="rounded-[0.85rem] bg-base-100 p-4">
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("audit.table.headers.request")}
                    </p>
                    <p class="mt-2 font-mono text-xs text-slate-700">
                      {selectedAction.ip ?? "-"}
                    </p>
                    <p class="mt-2 break-all font-mono text-xs text-slate-500">
                      {t("audit.table.session")}: {selectedAction.sessionId ??
                        "-"}
                    </p>
                  </div>
                  <div class="rounded-[0.85rem] bg-base-100 p-4">
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("audit.table.agent")}
                    </p>
                    <p class="mt-2 break-all font-mono text-xs text-slate-600">
                      {selectedAction.userAgent ?? "-"}
                    </p>
                  </div>
                </div>
              </div>

              <div
                class="overflow-x-auto rounded-[0.95rem] border border-[var(--admin-border)] bg-[#161311] p-4"
              >
                <div
                  class="flex items-center justify-between border-b border-white/10 pb-3"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/70"
                  >
                    {t("audit.table.metadata")}
                  </p>
                  <span
                    class="badge border-white/20 bg-transparent text-white/70"
                  >
                    json
                  </span>
                </div>
                <pre
                  class="mt-4 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-white/85">{hasMetadata(
                    selectedAction.metadata,
                  )
                    ? formatMetadata(selectedAction.metadata)
                    : t("audit.table.noMetadata")}</pre>
              </div>
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-5 text-sm text-slate-500"
            >
              {t("audit.table.empty")}
            </div>
          {/if}
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Time Window
              </p>
              <h2 class="card-title mt-2">{t("audit.summary.byDay")}</h2>
              <p class="text-sm text-slate-500">
                Jump directly into a daily audit slice using the precomputed day
                buckets.
              </p>
            </div>
          </div>

          {#if summary.byDay.length === 0}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-5 text-sm text-slate-500"
            >
              {t("audit.summary.empty")}
            </div>
          {:else}
            <div class="flex flex-wrap gap-3">
              {#each summary.byDay as bucket}
                <a
                  href={buildDayHref(bucket.day)}
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-4 py-3 text-sm transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-primary-soft)]"
                >
                  <div class="font-medium text-base-content">{bucket.day}</div>
                  <div class="mt-1 font-mono text-xs text-slate-500">
                    {bucket.count}
                  </div>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </section>
  {/if}

  {#if isFiltersModule}
    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]"
    >
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Filter Console
            </p>
            <h2 class="card-title mt-2">{t("audit.title")}</h2>
            <p class="text-sm text-slate-500">{t("audit.description")}</p>
          </div>

          <form method="get" class="space-y-4">
            <label class="form-control">
              <span class="label-text mb-2">{t("audit.filters.adminId")}</span>
              <input
                name="adminId"
                type="number"
                class="input input-bordered"
                autocomplete="off"
                value={$page.url.searchParams.get("adminId") ?? ""}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("audit.filters.userId")}</span>
              <input
                name="userId"
                type="number"
                class="input input-bordered"
                autocomplete="off"
                value={$page.url.searchParams.get("userId") ?? ""}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("audit.filters.action")}</span>
              <input
                name="action"
                class="input input-bordered"
                autocomplete="off"
                value={$page.url.searchParams.get("action") ?? ""}
              />
            </label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">{t("audit.filters.from")}</span>
                <input
                  name="from"
                  type="datetime-local"
                  class="input input-bordered"
                  autocomplete="off"
                  value={$page.url.searchParams.get("from") ?? ""}
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">{t("audit.filters.to")}</span>
                <input
                  name="to"
                  type="datetime-local"
                  class="input input-bordered"
                  autocomplete="off"
                  value={$page.url.searchParams.get("to") ?? ""}
                />
              </label>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">{t("audit.filters.limit")}</span>
                <input
                  name="limit"
                  type="number"
                  min="1"
                  max="200"
                  class="input input-bordered"
                  autocomplete="off"
                  value={$page.url.searchParams.get("limit") ?? "50"}
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">{t("audit.filters.sort")}</span>
                <select
                  name="sort"
                  class="select select-bordered"
                  value={$page.url.searchParams.get("sort") ?? "desc"}
                >
                  <option value="desc">{t("audit.filters.sortNewest")}</option>
                  <option value="asc">{t("audit.filters.sortOldest")}</option>
                </select>
              </label>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <button class="btn btn-primary" type="submit">
                {t("audit.filters.apply")}
              </button>
              <a class="btn btn-outline" href="/audit">
                {t("audit.filters.reset")}
              </a>
            </div>
          </form>
        </div>
      </section>

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Distribution Lens
              </p>
              <h2 class="card-title mt-2">{t("audit.summary.byAdmin")}</h2>
              <p class="text-sm text-slate-500">
                Use grouped distributions as quick links back into the queue.
              </p>
            </div>

            <div class="space-y-4">
              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {t("audit.summary.byAdmin")}
                </p>
                <div class="mt-3 space-y-2">
                  {#if summary.byAdmin.length === 0}
                    <p class="text-sm text-slate-500">
                      {t("audit.summary.empty")}
                    </p>
                  {:else}
                    {#each summary.byAdmin as group}
                      <div
                        class="flex items-center justify-between gap-3 text-sm"
                      >
                        {#if group.adminId}
                          <a
                            class="transition hover:text-[var(--admin-primary)]"
                            href={buildHref({ adminId: String(group.adminId) })}
                          >
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
                  {/if}
                </div>
              </div>

              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {t("audit.summary.byAction")}
                </p>
                <div class="mt-3 space-y-2">
                  {#if summary.byAction.length === 0}
                    <p class="text-sm text-slate-500">
                      {t("audit.summary.empty")}
                    </p>
                  {:else}
                    {#each summary.byAction as group}
                      <div
                        class="flex items-center justify-between gap-3 text-sm"
                      >
                        <a
                          class="transition hover:text-[var(--admin-primary)]"
                          href={buildHref({ action: group.action })}
                        >
                          {group.action}
                        </a>
                        <span class="badge badge-outline">{group.count}</span>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>

              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {t("audit.summary.byUser")}
                </p>
                <div class="mt-3 space-y-2">
                  {#if summary.byUser.length === 0}
                    <p class="text-sm text-slate-500">
                      {t("audit.summary.empty")}
                    </p>
                  {:else}
                    {#each summary.byUser as group}
                      <div
                        class="flex items-center justify-between gap-3 text-sm"
                      >
                        {#if group.userId}
                          <a
                            class="transition hover:text-[var(--admin-primary)]"
                            href={buildHref({ userId: String(group.userId) })}
                          >
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
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Review Protocol
              </p>
              <h2 class="card-title mt-2">Audit Handling</h2>
              <p class="text-sm text-slate-500">
                Keep queue context, payload context, and grouped distributions
                in sync before exporting or escalating.
              </p>
            </div>

            <ul class="space-y-2 text-sm text-slate-600">
              <li>
                1. Confirm the actor, subject user, and target together before
                interpreting the action.
              </li>
              <li>
                2. Use grouped admin, action, and user buckets to narrow the
                queue before exporting evidence.
              </li>
              <li>
                3. Prefer daily windows when reconstructing incident timelines
                or operator interventions.
              </li>
            </ul>
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
