<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import CollusionLineChart from "$lib/components/collusion-line-chart.svelte"

  interface RiskUserStatus {
    userId: number
    email?: string | null
    isFrozen: boolean
    freezeReason?: string | null
    hasOpenRiskFlag: boolean
    manualFlagged: boolean
    riskReason?: string | null
    riskScore: number
  }

  interface CollusionSeriesPoint {
    bucket: string
    deltaScore: number
    cumulativeScore: number
    eventCount: number
  }

  interface CollusionSeries {
    entityKey: string
    entityType: "user" | "device"
    label: string
    fingerprint?: string | null
    user?: RiskUserStatus | null
    totalScore: number
    eventCount: number
    lastSeenAt?: string | null
    points: CollusionSeriesPoint[]
  }

  interface CollusionCluster {
    fingerprint: string
    label: string
    pairEventCount: number
    userCount: number
    totalScore: number
    lastSeenAt?: string | null
    users: RiskUserStatus[]
  }

  interface CollusionFrequentPair {
    tableId: string
    interactionCount: number
    sharedIpCount: number
    sharedDeviceCount: number
    suspicionScore: number
    lastSeenAt?: string | null
    users: [RiskUserStatus, RiskUserStatus]
  }

  interface DashboardData {
    windowDays: number
    seriesLimit: number
    topLimit: number
    generatedAt?: string | null
    userSeries: CollusionSeries[]
    deviceSeries: CollusionSeries[]
    sharedIpTop: CollusionCluster[]
    sharedDeviceTop: CollusionCluster[]
    frequentTablePairs: CollusionFrequentPair[]
  }

  interface PageData {
    dashboard: DashboardData
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let operatorReason = $state("")
  let activeSeries = $state<"user" | "device">("user")

  const dashboard = $derived(data.dashboard)
  const visibleSeries = $derived(
    activeSeries === "user" ? dashboard.userSeries : dashboard.deviceSeries,
  )
  const userLeaders = $derived(dashboard.userSeries)
  const actionError = $derived($page.form?.error as string | undefined)
  const summaryCards = $derived([
    {
      label: t("risk.collusion.summary.userLeaders"),
      value: dashboard.userSeries.length,
    },
    {
      label: t("risk.collusion.summary.deviceLeaders"),
      value: dashboard.deviceSeries.length,
    },
    {
      label: t("risk.collusion.summary.sharedIpClusters"),
      value: dashboard.sharedIpTop.length,
    },
    {
      label: t("risk.collusion.summary.frequentPairs"),
      value: dashboard.frequentTablePairs.length,
    },
  ])

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const userLabel = (user: RiskUserStatus) =>
    user.email ? `${user.email} (#${user.userId})` : `User #${user.userId}`

  const riskFlagLabel = (user: RiskUserStatus) => {
    if (user.manualFlagged) return t("risk.collusion.users.flagManual")
    if (user.hasOpenRiskFlag) return t("risk.collusion.users.flagOpen")
    return t("risk.collusion.users.flagNone")
  }

  const freezeLabel = (user: RiskUserStatus) =>
    user.isFrozen
      ? `${t("risk.collusion.users.freezeActive")} (${user.freezeReason ?? "-"})`
      : t("risk.collusion.users.freezeNone")
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("risk.collusion.eyebrow")}
  </p>
  <h1 class="text-3xl font-semibold">{t("risk.collusion.title")}</h1>
  <p class="text-sm text-slate-600">{t("risk.collusion.description")}</p>
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

<section class="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <div
        class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h2 class="card-title">{t("risk.collusion.filters.title")}</h2>
          <p class="text-sm text-slate-500">
            {t("risk.collusion.filters.description")}
          </p>
        </div>
      </div>

      <form
        method="get"
        class="mt-4 flex flex-col gap-4 md:flex-row md:items-end"
      >
        <label class="form-control w-full max-w-xs">
          <span class="label-text mb-2">{t("risk.collusion.filters.days")}</span
          >
          <select name="days" class="select select-bordered">
            <option
              value="7"
              selected={($page.url.searchParams.get("days") ??
                String(dashboard.windowDays)) === "7"}
            >
              {t("risk.collusion.filters.days7")}
            </option>
            <option
              value="14"
              selected={($page.url.searchParams.get("days") ??
                String(dashboard.windowDays)) === "14"}
            >
              {t("risk.collusion.filters.days14")}
            </option>
            <option
              value="30"
              selected={($page.url.searchParams.get("days") ??
                String(dashboard.windowDays)) === "30"}
            >
              {t("risk.collusion.filters.days30")}
            </option>
          </select>
        </label>

        <button class="btn btn-primary md:self-auto" type="submit">
          {t("risk.collusion.filters.apply")}
        </button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body gap-3">
      <div>
        <h2 class="card-title">{t("risk.collusion.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("risk.collusion.stepUp.description")}
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
          placeholder={t("risk.collusion.stepUp.placeholder")}
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-2">{t("risk.collusion.stepUp.reason")}</span>
        <input
          type="text"
          class="input input-bordered"
          bind:value={operatorReason}
          placeholder={t("risk.collusion.stepUp.reasonPlaceholder")}
        />
      </label>
    </div>
  </div>
</section>

<section class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  {#each summaryCards as card}
    <article class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-1">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
          {card.label}
        </p>
        <p class="text-3xl font-semibold text-slate-900">{card.value}</p>
      </div>
    </article>
  {/each}
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    >
      <div>
        <h2 class="card-title">{t("risk.collusion.chart.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("risk.collusion.chart.description")}
        </p>
      </div>
      <div class="join self-start">
        <button
          type="button"
          class={`btn join-item btn-sm ${activeSeries === "user" ? "btn-primary" : "btn-outline"}`}
          onclick={() => {
            activeSeries = "user"
          }}
        >
          {t("risk.collusion.chart.userView")}
        </button>
        <button
          type="button"
          class={`btn join-item btn-sm ${activeSeries === "device" ? "btn-primary" : "btn-outline"}`}
          onclick={() => {
            activeSeries = "device"
          }}
        >
          {t("risk.collusion.chart.deviceView")}
        </button>
      </div>
    </div>

    <div class="mt-4">
      <CollusionLineChart
        series={visibleSeries}
        emptyText={t("risk.collusion.chart.empty")}
      />
    </div>
  </div>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div>
      <h2 class="card-title">{t("risk.collusion.users.title")}</h2>
      <p class="text-sm text-slate-500">
        {t("risk.collusion.users.description")}
      </p>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>{t("risk.collusion.users.headers.user")}</th>
            <th>{t("risk.collusion.users.headers.score")}</th>
            <th>{t("risk.collusion.users.headers.events")}</th>
            <th>{t("risk.collusion.users.headers.flag")}</th>
            <th>{t("risk.collusion.users.headers.freeze")}</th>
            <th>{t("risk.collusion.users.headers.lastSeen")}</th>
            <th class="text-right"
              >{t("risk.collusion.users.headers.actions")}</th
            >
          </tr>
        </thead>
        <tbody>
          {#if userLeaders.length === 0}
            <tr>
              <td colspan="7" class="py-8 text-center text-sm text-slate-500">
                {t("risk.collusion.users.empty")}
              </td>
            </tr>
          {:else}
            {#each userLeaders as item}
              <tr>
                <td>
                  {#if item.user}
                    <div class="space-y-1">
                      <p class="font-medium text-slate-900">
                        {userLabel(item.user)}
                      </p>
                      <p class="font-mono text-xs text-slate-500">
                        {item.entityKey}
                      </p>
                    </div>
                  {:else}
                    <span class="text-slate-500">-</span>
                  {/if}
                </td>
                <td class="font-semibold text-slate-900">{item.totalScore}</td>
                <td class="text-slate-600">{item.eventCount}</td>
                <td>
                  {#if item.user}
                    <div class="space-y-1">
                      <span
                        class={`badge ${item.user.manualFlagged ? "badge-warning" : item.user.hasOpenRiskFlag ? "badge-info" : "badge-ghost"}`}
                      >
                        {riskFlagLabel(item.user)}
                      </span>
                      {#if item.user.riskReason}
                        <p class="text-xs text-slate-500">
                          {item.user.riskReason}
                        </p>
                      {/if}
                    </div>
                  {/if}
                </td>
                <td>
                  {#if item.user}
                    <div class="space-y-1">
                      <span
                        class={`badge ${item.user.isFrozen ? "badge-error" : "badge-ghost"}`}
                      >
                        {freezeLabel(item.user)}
                      </span>
                    </div>
                  {/if}
                </td>
                <td class="text-slate-600">{formatDate(item.lastSeenAt)}</td>
                <td>
                  {#if item.user}
                    <div class="flex flex-wrap justify-end gap-2">
                      {#if item.user.manualFlagged}
                        <form method="post" action="?/clearManualFlag">
                          <input
                            type="hidden"
                            name="userId"
                            value={item.user.userId}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <input
                            type="hidden"
                            name="reason"
                            value={operatorReason}
                          />
                          <button class="btn btn-outline btn-xs" type="submit">
                            {t("risk.collusion.users.clearMark")}
                          </button>
                        </form>
                      {:else}
                        <form method="post" action="?/createManualFlag">
                          <input
                            type="hidden"
                            name="userId"
                            value={item.user.userId}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <input
                            type="hidden"
                            name="reason"
                            value={operatorReason}
                          />
                          <button class="btn btn-warning btn-xs" type="submit">
                            {t("risk.collusion.users.mark")}
                          </button>
                        </form>
                      {/if}

                      {#if !item.user.isFrozen}
                        <form method="post" action="?/freezeUser">
                          <input
                            type="hidden"
                            name="userId"
                            value={item.user.userId}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <button class="btn btn-error btn-xs" type="submit">
                            {t("risk.collusion.users.freezeGame")}
                          </button>
                        </form>
                      {/if}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="mt-6 grid gap-6 xl:grid-cols-2">
  <article class="card bg-base-100 shadow">
    <div class="card-body">
      <div>
        <h2 class="card-title">{t("risk.collusion.clusters.sharedIpTitle")}</h2>
        <p class="text-sm text-slate-500">
          {t("risk.collusion.clusters.sharedIpDescription")}
        </p>
      </div>

      <div class="mt-4 overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>{t("risk.collusion.clusters.headers.fingerprint")}</th>
              <th>{t("risk.collusion.clusters.headers.score")}</th>
              <th>{t("risk.collusion.clusters.headers.events")}</th>
              <th>{t("risk.collusion.clusters.headers.users")}</th>
              <th>{t("risk.collusion.clusters.headers.lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {#if dashboard.sharedIpTop.length === 0}
              <tr>
                <td colspan="5" class="py-8 text-center text-sm text-slate-500">
                  {t("risk.collusion.clusters.empty")}
                </td>
              </tr>
            {:else}
              {#each dashboard.sharedIpTop as cluster}
                <tr>
                  <td class="font-mono text-xs text-slate-700"
                    >{cluster.label}</td
                  >
                  <td class="font-semibold text-slate-900"
                    >{cluster.totalScore}</td
                  >
                  <td class="text-slate-600">{cluster.pairEventCount}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {#each cluster.users as user}
                        <span class="badge badge-outline">
                          {userLabel(user)}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="text-slate-600"
                    >{formatDate(cluster.lastSeenAt)}</td
                  >
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </article>

  <article class="card bg-base-100 shadow">
    <div class="card-body">
      <div>
        <h2 class="card-title">
          {t("risk.collusion.clusters.sharedDeviceTitle")}
        </h2>
        <p class="text-sm text-slate-500">
          {t("risk.collusion.clusters.sharedDeviceDescription")}
        </p>
      </div>

      <div class="mt-4 overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>{t("risk.collusion.clusters.headers.fingerprint")}</th>
              <th>{t("risk.collusion.clusters.headers.score")}</th>
              <th>{t("risk.collusion.clusters.headers.events")}</th>
              <th>{t("risk.collusion.clusters.headers.users")}</th>
              <th>{t("risk.collusion.clusters.headers.lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {#if dashboard.sharedDeviceTop.length === 0}
              <tr>
                <td colspan="5" class="py-8 text-center text-sm text-slate-500">
                  {t("risk.collusion.clusters.empty")}
                </td>
              </tr>
            {:else}
              {#each dashboard.sharedDeviceTop as cluster}
                <tr>
                  <td class="font-mono text-xs text-slate-700"
                    >{cluster.label}</td
                  >
                  <td class="font-semibold text-slate-900"
                    >{cluster.totalScore}</td
                  >
                  <td class="text-slate-600">{cluster.pairEventCount}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {#each cluster.users as user}
                        <span class="badge badge-outline">
                          {userLabel(user)}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="text-slate-600"
                    >{formatDate(cluster.lastSeenAt)}</td
                  >
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </article>
</section>

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body">
    <div>
      <h2 class="card-title">{t("risk.collusion.pairs.title")}</h2>
      <p class="text-sm text-slate-500">
        {t("risk.collusion.pairs.description")}
      </p>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>{t("risk.collusion.pairs.headers.table")}</th>
            <th>{t("risk.collusion.pairs.headers.users")}</th>
            <th>{t("risk.collusion.pairs.headers.interactions")}</th>
            <th>{t("risk.collusion.pairs.headers.sharedIp")}</th>
            <th>{t("risk.collusion.pairs.headers.sharedDevice")}</th>
            <th>{t("risk.collusion.pairs.headers.score")}</th>
            <th>{t("risk.collusion.pairs.headers.lastSeen")}</th>
          </tr>
        </thead>
        <tbody>
          {#if dashboard.frequentTablePairs.length === 0}
            <tr>
              <td colspan="7" class="py-8 text-center text-sm text-slate-500">
                {t("risk.collusion.pairs.empty")}
              </td>
            </tr>
          {:else}
            {#each dashboard.frequentTablePairs as pair}
              <tr>
                <td class="font-mono text-xs text-slate-700">{pair.tableId}</td>
                <td>
                  <div class="space-y-1">
                    <p class="font-medium text-slate-900">
                      {userLabel(pair.users[0])}
                    </p>
                    <p class="font-medium text-slate-900">
                      {userLabel(pair.users[1])}
                    </p>
                  </div>
                </td>
                <td class="text-slate-600">{pair.interactionCount}</td>
                <td class="text-slate-600">{pair.sharedIpCount}</td>
                <td class="text-slate-600">{pair.sharedDeviceCount}</td>
                <td class="font-semibold text-slate-900"
                  >{pair.suspicionScore}</td
                >
                <td class="text-slate-600">{formatDate(pair.lastSeenAt)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
