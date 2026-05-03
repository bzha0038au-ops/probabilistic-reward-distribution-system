<script lang="ts">
  import { page } from "$app/stores"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import ConfirmDialog from "$lib/components/confirm-dialog.svelte"
  import {
    resolvePendingBreakGlassSubmission,
    upsertHiddenFormValue,
    type PendingBreakGlassSubmission,
  } from "$lib/break-glass"
  import type {
    JurisdictionFeature,
    UserFreezeReason,
    UserFreezeScope,
  } from "@reward/shared-types/risk"
  import { getContext } from "svelte"
  import { securityActionPolicies } from "./action-policies"
  import type { PageData } from "./page-support"
  import SecurityModuleTabs from "./security-module-tabs.svelte"

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
  const jurisdictionRules = $derived(data.jurisdictionRules ?? [])
  const authNextCursor = $derived(data.authEvents?.nextCursor ?? null)
  const authPrevCursor = $derived(data.authEvents?.prevCursor ?? null)
  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  const latestAnomaly = $derived(anomalyEvents[0] ?? null)
  const latestAuthEvent = $derived(events[0] ?? null)
  const latestFreezeRecord = $derived(freezeRecords[0] ?? null)
  const activeFreezeCount = $derived(
    freezeRecords.filter(
      (record) =>
        !record.releasedAt && record.status.toLowerCase() !== "released",
    ).length,
  )
  const authSort = $derived($page.url.searchParams.get("authSort") ?? "desc")
  const freezeSort = $derived(
    $page.url.searchParams.get("freezeSort") ?? "desc",
  )
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
  const jurisdictionFeatureOptions: JurisdictionFeature[] = [
    "real_money_gameplay",
    "topup",
    "withdrawal",
  ]
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/security/signals") return "signals"
    if ($page.url.pathname === "/security/freezes") return "freezes"
    if ($page.url.pathname === "/security/jurisdiction") return "jurisdiction"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isSignalsModule = $derived(activeModule === "signals")
  const isFreezesModule = $derived(activeModule === "freezes")
  const isJurisdictionModule = $derived(activeModule === "jurisdiction")
  const fullAccessJurisdictions = $derived(
    jurisdictionRules.filter(
      (rule) =>
        rule.allowedFeatures.length === jurisdictionFeatureOptions.length,
    ).length,
  )
  const securityModules = $derived([
    {
      href: "/security/signals",
      eyebrow: "Alert Queue",
      title: "Signals",
      description:
        "异常登录信号和完整 auth trail 拆成单独工作台，先做证据审阅再做控制动作。",
      badge: `${anomalyEvents.length}`,
    },
    {
      href: "/security/freezes",
      eyebrow: "Account Controls",
      title: "Freezes",
      description:
        "冻结、释放和 case context 单独进入一个控制台，不再和证据页混排。",
      badge: `${activeFreezeCount}`,
    },
    {
      href: "/security/jurisdiction",
      eyebrow: "Governance Desk",
      title: "Jurisdiction",
      description:
        "国家规则、年龄门槛和功能白名单拆开管理，避免和风控队列堆在一起。",
      badge: `${jurisdictionRules.length}`,
    },
  ])
  const activeBreakGlassPolicy = $derived(pendingBreakGlass?.policy ?? null)
  const breakGlassStepUpHint = $derived(
    stepUpCode.trim() === "" ? t("saas.confirmDialog.stepUpHint") : null,
  )

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatFreezeValue = (value: string) => value.replaceAll("_", " ")
  const formatJurisdictionFeature = (value: JurisdictionFeature) =>
    ({
      real_money_gameplay: t(
        "security.jurisdiction.features.realMoneyGameplay",
      ),
      topup: t("security.jurisdiction.features.topup"),
      withdrawal: t("security.jurisdiction.features.withdrawal"),
    })[value] ?? value
  const formatEventType = (value: string) => value.replaceAll("_", " ")
  const readMetadataValue = (
    metadata: Record<string, unknown> | null | undefined,
    key: string,
  ) => {
    const value = metadata?.[key]
    if (value === null || value === undefined || value === "") {
      return "-"
    }
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry)).join(", ")
    }
    return String(value)
  }
  const deriveCountryTier = (allowedFeatures: JurisdictionFeature[]) => {
    if (allowedFeatures.length === 0)
      return t("security.jurisdiction.tiers.blocked")
    if (allowedFeatures.length === jurisdictionFeatureOptions.length) {
      return t("security.jurisdiction.tiers.full")
    }
    return t("security.jurisdiction.tiers.restricted")
  }

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

    upsertHiddenFormValue(pendingBreakGlass.form, "totpCode", stepUpCode.trim())
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
  <AdminPageHeader
    context="Workspace · security"
    eyebrow="Security"
    title={t("security.title")}
    description={t("security.description")}
  />

  <SecurityModuleTabs />

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

  {#if actionMessage}
    <div class="alert alert-success text-sm">
      <span>{actionMessage}</span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Alert Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {anomalyEvents.length}
          </p>
          <span class="badge badge-outline">
            {anomalyEvents.length === 1 ? "active signal" : "active signals"}
          </span>
        </div>
        <p class="text-sm text-slate-500">
          Suspicious authentication events awaiting operator review.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Trail Window
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {events.length}
          </p>
          <span class="badge badge-outline">
            {authSort === "asc" ? "oldest first" : "newest first"}
          </span>
        </div>
        <p class="text-sm text-slate-500">
          Visible authentication records in the current audit slice.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Freeze Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {activeFreezeCount}
          </p>
          <span class="badge badge-outline">
            {freezeSort === "asc" ? "oldest first" : "newest first"}
          </span>
        </div>
        <p class="text-sm text-slate-500">
          Account controls that still require a release or follow-up action.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Jurisdiction Map
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {jurisdictionRules.length}
          </p>
          <span class="badge badge-outline">{fullAccessJurisdictions} full</span
          >
        </div>
        <p class="text-sm text-slate-500">
          Country rules currently mapped into age and feature controls.
        </p>
      </div>
    </article>
  </section>

  {#if isHubModule}
    <section class="card bg-base-100 shadow">
      <div class="card-body space-y-5">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Security Drawer
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
          >
            分域操作入口
          </h2>
        </div>

        <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
          Security 根页现在只保留摘要和模块入口。进入具体模块，再分别处理
          signals、freezes 和 jurisdiction governance。
        </p>

        <div class="grid gap-4 lg:grid-cols-3">
          {#each securityModules as module}
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
    </section>
  {/if}

  {#if isSignalsModule || isFreezesModule || isJurisdictionModule}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]"
    >
      <div class="admin-main--after-rail-xl min-w-0 space-y-6">
        {#if isSignalsModule}
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div class="space-y-2">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Investigation Surface
                </p>
                <div
                  class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div>
                    <h2 class="card-title text-[1.45rem]">Signal Queue</h2>
                    <p class="text-sm text-slate-500">
                      Review anomaly markers first, then pivot into the full
                      audit trail before freezing or releasing a user.
                    </p>
                  </div>
                  <span class="badge badge-outline">
                    {latestAnomaly ? "review required" : "quiet queue"}
                  </span>
                </div>
              </div>

              {#if latestAnomaly}
                <div
                  class="grid gap-4 xl:grid-cols-[minmax(235px,0.88fr)_minmax(0,1.12fr)]"
                >
                  <div
                    class="space-y-3 xl:max-h-[24rem] xl:overflow-y-auto xl:pr-1"
                  >
                    {#each anomalyEvents as event, index}
                      <article
                        class={`rounded-[1rem] border p-4 transition-colors ${index === 0 ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)]" : "border-[var(--admin-border)] bg-[var(--admin-paper)]"}`}
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <p class="font-semibold text-[var(--admin-ink)]">
                              {event.email ??
                                `user-${event.userId ?? "unknown"}`}
                            </p>
                            <p
                              class="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                            >
                              {formatEventType(event.eventType)}
                            </p>
                          </div>
                          <span class="badge badge-outline">
                            {index === 0 ? "selected" : "queue"}
                          </span>
                        </div>

                        <dl class="mt-4 space-y-2 text-sm text-slate-600">
                          <div class="flex items-center justify-between gap-4">
                            <dt>User</dt>
                            <dd class="font-mono text-xs">
                              {event.userId ?? "-"}
                            </dd>
                          </div>
                          <div class="flex items-center justify-between gap-4">
                            <dt>IP</dt>
                            <dd class="font-mono text-xs">{event.ip ?? "-"}</dd>
                          </div>
                          <div class="flex items-center justify-between gap-4">
                            <dt>Signals</dt>
                            <dd class="max-w-[12rem] text-right text-xs">
                              {readMetadataValue(event.metadata, "signals")}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    {/each}
                  </div>

                  <div
                    class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5"
                  >
                    <div
                      class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4"
                    >
                      <div
                        class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                      >
                        <div>
                          <p
                            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                          >
                            Selected Signal
                          </p>
                          <h3
                            class="mt-2 text-xl font-semibold text-[var(--admin-ink)]"
                          >
                            {latestAnomaly.email ??
                              `User ${latestAnomaly.userId ?? "Unknown"}`}
                          </h3>
                        </div>
                        <span
                          class="inline-flex w-fit rounded-full border border-[var(--admin-danger)]/30 bg-[var(--admin-danger-soft)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--admin-danger)]"
                        >
                          high risk
                        </span>
                      </div>

                      <p class="text-sm text-slate-500">
                        Use this context to validate the auth trail, then decide
                        whether a freeze or escalation path is warranted.
                      </p>
                    </div>

                    <dl class="grid gap-4 pt-4 md:grid-cols-2">
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Event Marker
                        </dt>
                        <dd
                          class="mt-2 text-sm font-semibold text-[var(--admin-ink)]"
                        >
                          {formatEventType(latestAnomaly.eventType)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Occurred
                        </dt>
                        <dd
                          class="mt-2 font-mono text-sm text-[var(--admin-ink)]"
                        >
                          {formatDate(latestAnomaly.createdAt)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Origin IP
                        </dt>
                        <dd
                          class="mt-2 font-mono text-sm text-[var(--admin-ink)]"
                        >
                          {latestAnomaly.ip ?? "-"}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Previous IP
                        </dt>
                        <dd
                          class="mt-2 font-mono text-sm text-[var(--admin-ink)]"
                        >
                          {readMetadataValue(
                            latestAnomaly.metadata,
                            "previousIp",
                          )}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 md:col-span-2"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Heuristic Signals
                        </dt>
                        <dd class="mt-2 text-sm text-slate-600">
                          {readMetadataValue(latestAnomaly.metadata, "signals")}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              {:else}
                <div
                  class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-5 text-sm text-slate-500"
                >
                  {t("security.alerts.empty")}
                </div>
              {/if}
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Evidence Ledger
                  </p>
                  <h2 class="card-title mt-2">
                    {t("security.authEvents.title")}
                  </h2>
                  <p class="text-sm text-slate-500">
                    {t("security.authEvents.description")}
                  </p>
                </div>
                <a
                  class="btn btn-outline btn-sm"
                  href={`/security/export${authExportQuery}`}
                >
                  {t("security.filters.export")}
                </a>
              </div>

              <form
                method="get"
                class="admin-filter-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-6"
              >
                <div class="form-control">
                  <label class="label" for="filter-email">
                    <span class="label-text">{t("security.filters.email")}</span
                    >
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
                    <span class="label-text">
                      {t("security.filters.eventType")}
                    </span>
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
                    <span class="label-text">{t("security.filters.limit")}</span
                    >
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
                    <option value="desc">
                      {t("security.filters.sortNewest")}
                    </option>
                    <option value="asc"
                      >{t("security.filters.sortOldest")}</option
                    >
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
                <div class="admin-filter-actions md:col-span-2 2xl:col-span-6">
                  <button class="btn btn-primary" type="submit">
                    {t("security.filters.apply")}
                  </button>
                </div>
              </form>

              <div
                class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table admin-table-compact">
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
                      <tr
                        style={event.eventType.endsWith("_login_anomaly")
                          ? "background: var(--admin-danger-soft);"
                          : undefined}
                      >
                        <td class="font-mono text-xs">{event.id}</td>
                        <td>{event.email ?? "-"}</td>
                        <td class="font-mono text-xs">{event.userId ?? "-"}</td>
                        <td>
                          <span
                            class={`badge badge-outline ${event.eventType.endsWith("_login_anomaly") ? "border-[var(--admin-danger)] text-[var(--admin-danger)]" : ""}`}
                          >
                            {formatEventType(event.eventType)}
                          </span>
                        </td>
                        <td class="font-mono text-xs">{event.ip ?? "-"}</td>
                        <td
                          class="max-w-xs truncate"
                          title={event.userAgent ?? ""}
                        >
                          {event.userAgent ?? "-"}
                        </td>
                        <td class="font-mono text-xs">
                          {formatDate(event.createdAt)}
                        </td>
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

              <div class="admin-pagination">
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
        {/if}

        {#if isFreezesModule}
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Account Controls
                  </p>
                  <h2 class="card-title mt-2">{t("security.freeze.title")}</h2>
                  <p class="text-sm text-slate-500">
                    {t("security.freeze.description")}
                  </p>
                </div>
                <span class="badge badge-outline">
                  {activeFreezeCount === 1
                    ? "1 active control"
                    : `${activeFreezeCount} active controls`}
                </span>
              </div>

              <form
                method="get"
                class="admin-filter-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
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
                    <option value="desc">
                      {t("security.freeze.sortNewest")}
                    </option>
                    <option value="asc"
                      >{t("security.freeze.sortOldest")}</option
                    >
                  </select>
                </div>
                <div class="admin-filter-actions">
                  <button
                    class="btn btn-primary w-full md:w-auto"
                    type="submit"
                  >
                    {t("security.filters.apply")}
                  </button>
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
              </form>

              <div
                class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table admin-table-compact">
                  <thead>
                    <tr>
                      <th>{t("security.freeze.headers.id")}</th>
                      <th>{t("security.freeze.headers.userId")}</th>
                      <th>{t("security.freeze.headers.reason")}</th>
                      <th>{t("security.freeze.headers.scope")}</th>
                      <th>{t("security.freeze.headers.status")}</th>
                      <th>{t("security.freeze.headers.createdAt")}</th>
                      <th class="text-right">
                        {t("security.freeze.headers.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each freezeRecords as record}
                      {@const isReleased =
                        Boolean(record.releasedAt) ||
                        record.status.toLowerCase() === "released"}
                      <tr>
                        <td class="font-mono text-xs">{record.id}</td>
                        <td class="font-mono text-xs">{record.userId}</td>
                        <td>{formatFreezeValue(record.reason)}</td>
                        <td>{formatFreezeValue(record.scope)}</td>
                        <td>
                          <span
                            class={`badge badge-outline ${isReleased ? "" : "border-[var(--admin-danger)] text-[var(--admin-danger)]"}`}
                          >
                            {formatFreezeValue(record.status)}
                          </span>
                        </td>
                        <td class="font-mono text-xs">
                          {formatDate(record.createdAt)}
                        </td>
                        <td class="text-right">
                          <form method="post" action="?/releaseFreeze">
                            <input
                              type="hidden"
                              name="freezeRecordId"
                              value={record.id}
                            />
                            <input
                              type="hidden"
                              name="totpCode"
                              value={stepUpCode}
                            />
                            <button
                              class="btn btn-xs btn-outline"
                              type="submit"
                            >
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

              <div class="admin-pagination">
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
        {/if}

        {#if isJurisdictionModule}
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Governance Desk
                </p>
                <h2 class="card-title mt-2">
                  {t("security.jurisdiction.title")}
                </h2>
                <p class="text-sm text-slate-500">
                  {t("security.jurisdiction.description")}
                </p>
              </div>

              <form
                method="post"
                action="?/saveJurisdictionRule"
                class="grid gap-4 rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 lg:grid-cols-2"
              >
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("security.jurisdiction.countryCode")}
                  </span>
                  <input
                    name="countryCode"
                    maxlength="2"
                    class="input input-bordered uppercase"
                    placeholder="US"
                    required
                  />
                </label>
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("security.jurisdiction.minimumAge")}
                  </span>
                  <input
                    name="minimumAge"
                    type="number"
                    min="0"
                    max="120"
                    value="18"
                    class="input input-bordered"
                    required
                  />
                </label>
                <fieldset class="form-control lg:col-span-2">
                  <span class="label-text mb-2">
                    {t("security.jurisdiction.allowedFeatures")}
                  </span>
                  <div class="grid gap-3 md:grid-cols-3">
                    {#each jurisdictionFeatureOptions as feature}
                      <label
                        class="flex items-center gap-3 rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          name="allowedFeatures"
                          value={feature}
                          checked
                        />
                        <span class="text-sm">
                          {formatJurisdictionFeature(feature)}
                        </span>
                      </label>
                    {/each}
                  </div>
                </fieldset>
                <label class="form-control lg:col-span-2">
                  <span class="label-text mb-2">
                    {t("security.jurisdiction.notes")}
                  </span>
                  <textarea
                    name="notes"
                    rows="3"
                    class="textarea textarea-bordered"
                    placeholder={t("security.jurisdiction.notesPlaceholder")}
                  ></textarea>
                </label>
                <div class="flex justify-end lg:col-span-2">
                  <button class="btn btn-primary" type="submit">
                    {t("security.jurisdiction.save")}
                  </button>
                </div>
              </form>

              <div
                class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table admin-table-compact">
                  <thead>
                    <tr>
                      <th>{t("security.jurisdiction.headers.countryCode")}</th>
                      <th>{t("security.jurisdiction.headers.countryTier")}</th>
                      <th>{t("security.jurisdiction.headers.minimumAge")}</th>
                      <th>
                        {t("security.jurisdiction.headers.allowedFeatures")}
                      </th>
                      <th>{t("security.jurisdiction.headers.updatedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each jurisdictionRules as rule}
                      <tr>
                        <td class="font-mono text-xs">{rule.countryCode}</td>
                        <td>{deriveCountryTier(rule.allowedFeatures)}</td>
                        <td>{rule.minimumAge}</td>
                        <td class="text-sm text-slate-600">
                          {#if rule.allowedFeatures.length === 0}
                            {t("security.jurisdiction.noFeatures")}
                          {:else}
                            {rule.allowedFeatures
                              .map((feature) =>
                                formatJurisdictionFeature(feature),
                              )
                              .join(", ")}
                          {/if}
                        </td>
                        <td class="font-mono text-xs">
                          {formatDate(rule.updatedAt ?? rule.createdAt)}
                        </td>
                      </tr>
                    {/each}
                    {#if jurisdictionRules.length === 0}
                      <tr>
                        <td
                          colspan="5"
                          class="text-center text-sm text-slate-500"
                        >
                          {t("security.jurisdiction.empty")}
                        </td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        {/if}
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
                Operational Authorization
              </p>
              <h2 class="card-title mt-2">{t("security.stepUp.title")}</h2>
              <p class="text-sm text-slate-500">
                {t("security.stepUp.description")}
              </p>
            </div>

            <div class="admin-rail-panel admin-rail-panel--strong">
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
                  placeholder={t("security.stepUp.placeholder")}
                />
              </label>
            </div>

            <div class="admin-rail-panel">
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Health
              </p>
              <dl class="admin-data-list mt-3 text-sm text-slate-600">
                <div class="admin-data-row">
                  <dt>Open auth signals</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {anomalyEvents.length}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Active freezes</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {activeFreezeCount}
                  </dd>
                </div>
                <div class="admin-data-row">
                  <dt>Rules loaded</dt>
                  <dd class="admin-data-value font-mono text-xs">
                    {jurisdictionRules.length}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {#if isFreezesModule}
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Gated Write Action
                </p>
                <h2 class="card-title mt-2">
                  {t("security.freeze.createTitle")}
                </h2>
                <p class="text-sm text-slate-500">
                  {t("security.freeze.createDescription")}
                </p>
              </div>

              <form method="post" action="?/createFreeze" class="space-y-4">
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("security.freeze.userId")}
                  </span>
                  <input
                    id="freeze-user"
                    name="userId"
                    type="number"
                    class="input input-bordered"
                    autocomplete="off"
                    required
                  />
                </label>
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("security.freeze.reason")}
                  </span>
                  <select
                    id="freeze-reason"
                    name="reason"
                    class="select select-bordered"
                  >
                    {#each freezeReasonOptions as option}
                      <option value={option}>{formatFreezeValue(option)}</option
                      >
                    {/each}
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("security.freeze.scope")}
                  </span>
                  <select
                    id="freeze-scope"
                    name="scope"
                    class="select select-bordered"
                  >
                    {#each freezeScopeOptions as option}
                      <option value={option}>{formatFreezeValue(option)}</option
                      >
                    {/each}
                  </select>
                </label>
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <div class="admin-rail-note admin-rail-note--danger text-sm">
                  New freeze records apply immediate account restrictions. Keep
                  the reason, scope, and step-up code aligned with the incident
                  record.
                </div>
                <button class="btn btn-primary w-full" type="submit">
                  {t("security.freeze.freeze")}
                </button>
              </form>
            </div>
          </section>
        {/if}

        {#if isSignalsModule || isFreezesModule}
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Case Context
                </p>
                <h2 class="card-title mt-2">Selected Review Notes</h2>
                <p class="text-sm text-slate-500">
                  Keep the latest signal, account control, and auth marker in
                  one rail while working the queue.
                </p>
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Latest signal
                </p>
                {#if latestAnomaly}
                  <div class="mt-3 space-y-2 text-sm text-slate-600">
                    <p class="font-semibold text-[var(--admin-ink)]">
                      {latestAnomaly.email ??
                        `User ${latestAnomaly.userId ?? "-"}`}
                    </p>
                    <p class="font-mono text-xs">{latestAnomaly.ip ?? "-"}</p>
                    <p>
                      {readMetadataValue(latestAnomaly.metadata, "signals")}
                    </p>
                  </div>
                {:else}
                  <p class="mt-3 text-sm text-slate-500">
                    {t("security.alerts.empty")}
                  </p>
                {/if}
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Latest freeze
                </p>
                {#if latestFreezeRecord}
                  <div class="mt-3 space-y-2 text-sm text-slate-600">
                    <p class="font-semibold text-[var(--admin-ink)]">
                      User {latestFreezeRecord.userId}
                    </p>
                    <p>{formatFreezeValue(latestFreezeRecord.reason)}</p>
                    <p class="font-mono text-xs">
                      {formatDate(latestFreezeRecord.createdAt)}
                    </p>
                  </div>
                {:else}
                  <p class="mt-3 text-sm text-slate-500">
                    {t("security.freeze.empty")}
                  </p>
                {/if}
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Latest auth marker
                </p>
                {#if latestAuthEvent}
                  <div class="mt-3 space-y-2 text-sm text-slate-600">
                    <p class="font-semibold text-[var(--admin-ink)]">
                      {formatEventType(latestAuthEvent.eventType)}
                    </p>
                    <p class="font-mono text-xs">{latestAuthEvent.ip ?? "-"}</p>
                    <p class="font-mono text-xs">
                      {formatDate(latestAuthEvent.createdAt)}
                    </p>
                  </div>
                {:else}
                  <p class="mt-3 text-sm text-slate-500">
                    {t("security.authEvents.empty")}
                  </p>
                {/if}
              </div>
            </div>
          </section>
        {/if}
      </aside>
    </section>
  {/if}
</div>

<ConfirmDialog
  open={activeBreakGlassPolicy !== null}
  title={activeBreakGlassPolicy?.title ?? t("saas.confirmDialog.title")}
  description={activeBreakGlassPolicy?.description ??
    t("saas.confirmDialog.description")}
  bind:breakGlassCode
  breakGlassLabel={t("login.breakGlassCode")}
  breakGlassPlaceholder={t("login.breakGlassPlaceholder")}
  confirmLabel={activeBreakGlassPolicy?.confirmLabel ??
    t("saas.confirmDialog.confirm")}
  cancelLabel={t("saas.confirmDialog.cancel")}
  error={breakGlassError}
  stepUpHint={breakGlassStepUpHint}
  on:cancel={closeBreakGlassDialog}
  on:confirm={confirmBreakGlassDialog}
/>
