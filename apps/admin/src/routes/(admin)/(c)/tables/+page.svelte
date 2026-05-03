<script lang="ts">
  import { page } from "$app/stores"
  import { getContext, onMount } from "svelte"
  import type {
    TableMonitoringChannelEvent,
    TableMonitoringTable,
  } from "@reward/shared-types/table-monitoring"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  import type { PageData } from "./page-support"
  import TablesModuleTabs from "./tables-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const emptySnapshot: PageData["snapshot"] = {
    generatedAt: new Date(0).toISOString(),
    tables: [],
  }

  let stepUpCode = $state("")
  let snapshot = $state<PageData["snapshot"]>(emptySnapshot)
  let wsUrl = $state("")
  let socketStatus = $state<"connected" | "connecting" | "disconnected">(
    "disconnected",
  )
  let realtimeError = $state<string | null>(null)
  let now = $state(Date.now())
  let hasAppliedPageData = false

  const applyRealtimeState = (
    next: PageData,
    options: { preserveConnection?: boolean } = {},
  ) => {
    snapshot = next.snapshot ?? emptySnapshot
    wsUrl = next.wsUrl
    realtimeError = next.error
    if (!options.preserveConnection) {
      socketStatus = next.wsUrl ? "connecting" : "disconnected"
      return
    }

    if (!next.wsUrl) {
      socketStatus = "disconnected"
    }
  }

  $effect(() => {
    applyRealtimeState(data, { preserveConnection: hasAppliedPageData })
    hasAppliedPageData = true
  })

  const tables = $derived(snapshot.tables ?? [])
  const occupiedSeats = $derived(
    tables
      .flatMap((table) => table.seats)
      .filter((seat) => seat.userId !== null).length,
  )
  const timedOutSeats = $derived(
    tables.flatMap((table) => table.seats).filter((seat) => seat.isTimedOut)
      .length,
  )
  const overdueTables = $derived(
    tables.filter((table) => table.status === "overdue").length,
  )
  const sourceSummary = $derived.by(() => [
    {
      sourceKind: "blackjack" as const,
      count: tables.filter((table) => table.sourceKind === "blackjack").length,
    },
    {
      sourceKind: "holdem" as const,
      count: tables.filter((table) => table.sourceKind === "holdem").length,
    },
    {
      sourceKind: "live_dealer" as const,
      count: tables.filter((table) => table.sourceKind === "live_dealer")
        .length,
    },
    {
      sourceKind: "prediction_market" as const,
      count: tables.filter((table) => table.sourceKind === "prediction_market")
        .length,
    },
  ])
  const actionError = $derived($page.form?.error as string | undefined)
  const actionSuccess = $derived(
    ($page.form as { success?: boolean } | undefined)?.success === true,
  )
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/tables/ledger") return "ledger"
    if ($page.url.pathname === "/tables/interventions") return "interventions"
    if ($page.url.pathname === "/tables/runtime") return "runtime"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isInterventionsModule = $derived(activeModule === "interventions")
  const isRuntimeModule = $derived(activeModule === "runtime")
  const pageDescription = $derived.by(() => {
    if (activeModule === "ledger") {
      return "Table ledger 和 seat occupancy 单独成页，只看桌面运行态和参与者占位。"
    }
    if (activeModule === "interventions") {
      return "Force-timeout、kick-seat 和 close-table 拆成独立干预工作台，不再和纯台账混排。"
    }
    if (activeModule === "runtime") {
      return "Realtime socket、runtime composition 和 table health 拆成独立监控面。"
    }
    return "Tables Hub 只保留摘要和模块入口，把台账、干预和运行态拆到独立工作台。"
  })
  const tableModules = $derived([
    {
      href: "/tables/ledger",
      eyebrow: "Table Ledger",
      title: "Ledger",
      description:
        "桌面状态、seat occupancy 和 action deadline 单独作为运行台账，不再和干预命令混排。",
      badge: `${tables.length}`,
    },
    {
      href: "/tables/interventions",
      eyebrow: "Intervention Desk",
      title: "Interventions",
      description:
        "Kick seat、force timeout 和 close table 集中到单独工作台，方便带着 step-up 执行动作。",
      badge: `${timedOutSeats}`,
    },
    {
      href: "/tables/runtime",
      eyebrow: "Runtime Composition",
      title: "Runtime",
      description:
        "Socket 状态、source mix 和 table health 独立成页，减少主操作面上的信息拥挤。",
      badge: `${overdueTables}`,
    },
  ])

  const statusClass = (status: TableMonitoringTable["status"]) => {
    if (status === "overdue") return "badge-error"
    if (status === "closing") return "badge-warning"
    if (status === "closed") return "badge-neutral"
    return "badge-success"
  }

  const connectionClass = (status: typeof socketStatus) => {
    if (status === "connected") return "alert-success"
    if (status === "disconnected") return "alert-warning"
    return "alert-info"
  }
  const connectionBadgeClass = (status: typeof socketStatus) => {
    if (status === "connected") return "badge-success"
    if (status === "disconnected") return "badge-warning"
    return "badge-info"
  }

  const sourceLabelKeys = {
    blackjack: "tables.source.blackjack",
    holdem: "tables.source.holdem",
    live_dealer: "tables.source.liveDealer",
    prediction_market: "tables.source.predictionMarket",
  } as const

  const phaseLabelKeys = {
    waiting: "tables.phase.waiting",
    betting: "tables.phase.betting",
    player_turn: "tables.phase.playerTurn",
    dealer_turn: "tables.phase.dealerTurn",
    market_open: "tables.phase.marketOpen",
    market_locked: "tables.phase.marketLocked",
    settling: "tables.phase.settling",
    resolved: "tables.phase.resolved",
    closed: "tables.phase.closed",
  } as const

  const stateLabelKeys = {
    active: "tables.state.active",
    overdue: "tables.state.overdue",
    closing: "tables.state.closing",
    closed: "tables.state.closed",
  } as const

  const seatRoleLabelKeys = {
    dealer: "tables.seatRole.dealer",
    player: "tables.seatRole.player",
    observer: "tables.seatRole.observer",
    market_maker: "tables.seatRole.marketMaker",
  } as const

  const seatStatusLabelKeys = {
    empty: "tables.seatStatus.empty",
    occupied: "tables.seatStatus.occupied",
    acting: "tables.seatStatus.acting",
    waiting: "tables.seatStatus.waiting",
    timed_out: "tables.seatStatus.timedOut",
    removed: "tables.seatStatus.removed",
  } as const

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) return "—"
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.valueOf())
      ? String(value)
      : parsed.toLocaleString()
  }

  const remainingMsFor = (table: TableMonitoringTable) => {
    if (!table.actionDeadlineAt) return null
    const deadline = new Date(table.actionDeadlineAt).getTime()
    if (!Number.isFinite(deadline)) return null
    return Math.max(0, deadline - now)
  }

  const formatTimeBank = (table: TableMonitoringTable) => {
    const remaining = remainingMsFor(table)
    if (remaining === null) {
      return t("tables.labels.none")
    }

    const seconds = Math.ceil(remaining / 1000)
    const minutes = Math.floor(seconds / 60)
    const restSeconds = seconds % 60
    return `${minutes}:${String(restSeconds).padStart(2, "0")}`
  }

  onMount(() => {
    const timer = window.setInterval(() => {
      now = Date.now()
    }, 1_000)

    let socket: WebSocket | null = null
    let disposed = false
    let reconnectTimer: number | null = null
    let connectTimeout: number | null = null

    const clearConnectTimeout = () => {
      if (connectTimeout !== null) {
        window.clearTimeout(connectTimeout)
        connectTimeout = null
      }
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const refreshRealtimeState = async () => {
      try {
        const pathname = window.location.pathname.replace(/\/$/, "")
        const response = await fetch(`${pathname}/realtime`, {
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as PageData
        snapshot = payload.snapshot ?? snapshot
        wsUrl = payload.wsUrl || wsUrl
        realtimeError = payload.error
      } catch {
        realtimeError = t("tables.errors.loadData")
      }
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) {
        return
      }

      socketStatus = "disconnected"
      clearConnectTimeout()
      reconnectTimer = window.setTimeout(async () => {
        reconnectTimer = null
        await refreshRealtimeState()
        connect()
      }, 1_500)
    }

    const connect = () => {
      if (disposed) return
      if (!wsUrl) {
        socketStatus = "disconnected"
        return
      }

      socketStatus = "connecting"
      clearConnectTimeout()

      try {
        socket = new WebSocket(wsUrl)
      } catch {
        scheduleReconnect()
        return
      }

      connectTimeout = window.setTimeout(() => {
        socket?.close()
      }, 3_000)

      socket.addEventListener("open", () => {
        if (disposed) return
        clearConnectTimeout()
        clearReconnectTimer()
        socketStatus = "connected"
        realtimeError = null
      })

      socket.addEventListener("message", (event) => {
        if (disposed) return
        try {
          const payload = JSON.parse(event.data) as TableMonitoringChannelEvent
          if (payload.type === "snapshot") {
            clearConnectTimeout()
            clearReconnectTimer()
            socketStatus = "connected"
            snapshot = payload.snapshot
            realtimeError = null
            return
          }

          if (payload.type === "error") {
            realtimeError = payload.message
          }
        } catch {
          realtimeError = t("tables.errors.unexpectedResponse")
        }
      })

      socket.addEventListener("close", () => {
        if (disposed) return
        scheduleReconnect()
      })

      socket.addEventListener("error", () => {
        if (disposed) return
        scheduleReconnect()
      })
    }

    connect()

    return () => {
      disposed = true
      window.clearInterval(timer)
      clearConnectTimeout()
      clearReconnectTimer()
      socket?.close()
    }
  })
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · tableOps"
    eyebrow="Consumer"
    title={t("tables.title")}
    description={pageDescription}
  />

  <TablesModuleTabs />

  {#if actionError}
    <div class="alert alert-error text-sm shadow-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if actionSuccess}
    <div class="alert alert-success text-sm shadow-sm">
      <span>Table intervention submitted.</span>
    </div>
  {/if}

  {#if isHubModule}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Live Tables
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {tables.length}
            </p>
            <span class="badge badge-outline">queue</span>
          </div>
          <p class="text-sm text-slate-500">{t("tables.summary.liveTables")}</p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Occupied
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {occupiedSeats}
            </p>
            <span class="badge badge-outline">seats</span>
          </div>
          <p class="text-sm text-slate-500">
            {t("tables.summary.occupiedSeats")}
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Timed Out
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {timedOutSeats}
            </p>
            <span class="badge badge-outline">risk</span>
          </div>
          <p class="text-sm text-slate-500">
            {t("tables.summary.timedOutSeats")}
          </p>
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
              {overdueTables}
            </p>
            <span class="badge badge-outline">attention</span>
          </div>
          <p class="text-sm text-slate-500">{t("tables.state.overdue")}</p>
        </div>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      {#each tableModules as module}
        <article class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  {module.eyebrow}
                </p>
                <h2
                  class="mt-2 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
                >
                  {module.title}
                </h2>
              </div>
              <span class="badge badge-outline">{module.badge}</span>
            </div>
            <p class="text-sm leading-6 text-[var(--admin-muted)]">
              {module.description}
            </p>
            <div class="pt-2">
              <a class="btn btn-outline" href={module.href}>Open Module</a>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {:else}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.82fr)]"
    >
      <div class="min-w-0 space-y-6">
        {#if tables.length === 0}
          <section class="card bg-base-100 shadow">
            <div
              class="card-body rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center"
            >
              <p class="text-sm text-slate-500">
                {t("tables.labels.noTables")}
              </p>
            </div>
          </section>
        {:else if isRuntimeModule}
          <section class="space-y-5">
            {#each tables as table}
              <article class="card bg-base-100 shadow">
                <div class="card-body gap-5">
                  <div
                    class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="badge badge-outline">
                          {t(sourceLabelKeys[table.sourceKind])}
                        </span>
                        <span class={`badge ${statusClass(table.status)}`}>
                          {t(stateLabelKeys[table.status])}
                        </span>
                        <span class="badge badge-ghost">
                          {t(phaseLabelKeys[table.phase])}
                        </span>
                      </div>
                      <div>
                        <p
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Runtime Queue
                        </p>
                        <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                          {table.displayName}
                        </h2>
                        <p class="mt-1 text-sm text-slate-500">
                          {t("tables.labels.roundId")}: {table.roundId ?? "—"}
                        </p>
                      </div>
                    </div>

                    <dl
                      class="grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:min-w-[28rem]"
                    >
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.timeBank")}
                        </dt>
                        <dd class="mt-1 text-lg font-semibold text-slate-900">
                          {formatTimeBank(table)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.currentActor")}
                        </dt>
                        <dd class="mt-1 text-lg font-semibold text-slate-900">
                          {table.currentActorSeatIndex ??
                            t("tables.labels.none")}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.updatedAt")}
                        </dt>
                        <dd class="mt-1 text-sm font-medium text-slate-900">
                          {formatDateTime(table.updatedAt)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          Occupied Seats
                        </dt>
                        <dd class="mt-1 text-sm font-medium text-slate-900">
                          {table.seats.filter((seat) => seat.userId !== null)
                            .length} / {table.seats.length}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            {/each}
          </section>
        {:else}
          <section class="space-y-5">
            {#each tables as table}
              <article class="card bg-base-100 shadow">
                <div class="card-body gap-5">
                  <div
                    class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
                  >
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="badge badge-outline">
                          {t(sourceLabelKeys[table.sourceKind])}
                        </span>
                        <span class={`badge ${statusClass(table.status)}`}>
                          {t(stateLabelKeys[table.status])}
                        </span>
                        <span class="badge badge-ghost">
                          {t(phaseLabelKeys[table.phase])}
                        </span>
                      </div>
                      <div>
                        <p
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Table Ledger
                        </p>
                        <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                          {table.displayName}
                        </h2>
                        <p class="mt-1 text-sm text-slate-500">
                          {t("tables.labels.roundId")}: {table.roundId ?? "—"}
                        </p>
                      </div>
                    </div>

                    <dl
                      class="grid gap-3 text-sm text-slate-600 md:grid-cols-3 xl:min-w-[28rem]"
                    >
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.timeBank")}
                        </dt>
                        <dd class="mt-1 text-lg font-semibold text-slate-900">
                          {formatTimeBank(table)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.currentActor")}
                        </dt>
                        <dd class="mt-1 text-lg font-semibold text-slate-900">
                          {table.currentActorSeatIndex ??
                            t("tables.labels.none")}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
                      >
                        <dt
                          class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                        >
                          {t("tables.labels.updatedAt")}
                        </dt>
                        <dd class="mt-1 text-sm font-medium text-slate-900">
                          {formatDateTime(table.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div
                    class={isInterventionsModule
                      ? "grid gap-5 xl:grid-cols-[1.35fr,0.9fr]"
                      : "space-y-0"}
                  >
                    <section class="min-w-0">
                      <div
                        class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)]"
                      >
                        <table
                          class="min-w-full border-separate border-spacing-0 text-sm"
                        >
                          <thead class="bg-[var(--admin-paper)]">
                            <tr>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                #
                              </th>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                {t("tables.labels.user")}
                              </th>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                {t("tables.labels.participantId")}
                              </th>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                {t("tables.labels.timeBank")}
                              </th>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                {t("tables.labels.userId")}
                              </th>
                              <th
                                class="border-b border-[var(--admin-border)] px-4 py-4 text-right font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                              >
                                {isInterventionsModule
                                  ? t("tables.actions.kickSeat")
                                  : "Seat State"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each table.seats as seat}
                              <tr
                                class={seat.isTimedOut
                                  ? "bg-rose-50/60"
                                  : undefined}
                              >
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4"
                                >
                                  <div class="font-semibold text-slate-900">
                                    {seat.seatIndex}
                                  </div>
                                  <div class="text-xs text-slate-500">
                                    {t(seatRoleLabelKeys[seat.role])}
                                  </div>
                                </td>
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4"
                                >
                                  <div class="font-medium text-slate-900">
                                    {seat.displayName ?? "—"}
                                  </div>
                                  <div class="text-xs text-slate-500">
                                    {t(seatStatusLabelKeys[seat.status])}
                                  </div>
                                </td>
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-slate-500"
                                >
                                  {seat.participantId ?? "—"}
                                </td>
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4 font-medium text-slate-900"
                                >
                                  {seat.isCurrentActor
                                    ? formatTimeBank(table)
                                    : "—"}
                                </td>
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-slate-500"
                                >
                                  {seat.userId ?? "—"}
                                </td>
                                <td
                                  class="border-b border-[var(--admin-border)] px-4 py-4 text-right"
                                >
                                  {#if isInterventionsModule && seat.canKick}
                                    <form
                                      method="post"
                                      action="?/kickSeat"
                                      class="flex flex-col items-end gap-2"
                                    >
                                      <input
                                        type="hidden"
                                        name="sourceKind"
                                        value={table.sourceKind}
                                      />
                                      <input
                                        type="hidden"
                                        name="tableId"
                                        value={table.tableId}
                                      />
                                      <input
                                        type="hidden"
                                        name="seatIndex"
                                        value={seat.seatIndex}
                                      />
                                      <input
                                        type="hidden"
                                        name="totpCode"
                                        value={stepUpCode}
                                      />
                                      <input
                                        name="reason"
                                        class="input input-bordered input-sm w-full max-w-xs"
                                        placeholder={t(
                                          "tables.actions.kickReasonPlaceholder",
                                        )}
                                      />
                                      <button
                                        class="btn btn-error btn-xs"
                                        type="submit"
                                      >
                                        {t("tables.actions.kickSeat")}
                                      </button>
                                    </form>
                                  {:else if seat.isTimedOut}
                                    <span class="badge badge-warning">
                                      {t("tables.seatStatus.timedOut")}
                                    </span>
                                  {:else if seat.userId !== null}
                                    <span class="badge badge-outline">
                                      occupied
                                    </span>
                                  {:else}
                                    <span class="text-xs text-slate-400">—</span
                                    >
                                  {/if}
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {#if isInterventionsModule}
                      <aside class="space-y-4">
                        <section
                          class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                        >
                          <div class="space-y-3">
                            <div>
                              <p
                                class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                              >
                                Intervention Desk
                              </p>
                              <h3 class="mt-2 font-semibold text-slate-900">
                                {t("tables.actions.forceTimeout")}
                              </h3>
                              <p class="text-sm text-slate-500">
                                {t("tables.labels.currentActor")}: {table.currentActorSeatIndex ??
                                  t("tables.labels.none")}
                              </p>
                            </div>
                            <form
                              method="post"
                              action="?/forceTimeout"
                              class="space-y-3"
                            >
                              <input
                                type="hidden"
                                name="sourceKind"
                                value={table.sourceKind}
                              />
                              <input
                                type="hidden"
                                name="tableId"
                                value={table.tableId}
                              />
                              <input
                                type="hidden"
                                name="totpCode"
                                value={stepUpCode}
                              />
                              <label class="form-control">
                                <span class="label-text mb-2"
                                  >{t("tables.actions.reason")}</span
                                >
                                <input
                                  name="reason"
                                  class="input input-bordered"
                                  placeholder={t(
                                    "tables.actions.timeoutReasonPlaceholder",
                                  )}
                                />
                              </label>
                              <button
                                class="btn btn-warning"
                                type="submit"
                                disabled={!table.canForceTimeout}
                              >
                                {t("tables.actions.forceTimeout")}
                              </button>
                            </form>
                          </div>
                        </section>

                        <section
                          class="rounded-[1rem] border border-rose-200 bg-rose-50 p-4"
                        >
                          <div class="space-y-3">
                            <div>
                              <p
                                class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-rose-700"
                              >
                                Closure Protocol
                              </p>
                              <h3 class="mt-2 font-semibold text-rose-900">
                                {t("tables.actions.closeTable")}
                              </h3>
                              <p class="text-sm text-rose-800">
                                {t("tables.labels.updatedAt")}: {formatDateTime(
                                  table.updatedAt,
                                )}
                              </p>
                            </div>
                            <form
                              method="post"
                              action="?/closeTable"
                              class="space-y-3"
                            >
                              <input
                                type="hidden"
                                name="sourceKind"
                                value={table.sourceKind}
                              />
                              <input
                                type="hidden"
                                name="tableId"
                                value={table.tableId}
                              />
                              <input
                                type="hidden"
                                name="totpCode"
                                value={stepUpCode}
                              />
                              <label class="form-control">
                                <span class="label-text mb-2"
                                  >{t("tables.actions.reason")}</span
                                >
                                <input
                                  name="reason"
                                  class="input input-bordered"
                                  placeholder={t(
                                    "tables.actions.closeReasonPlaceholder",
                                  )}
                                  required
                                />
                              </label>
                              <button class="btn btn-error" type="submit">
                                {t("tables.actions.closeTable")}
                              </button>
                            </form>
                          </div>
                        </section>
                      </aside>
                    {/if}
                  </div>
                </div>
              </article>
            {/each}
          </section>
        {/if}
      </div>

      <aside class="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <section class={`alert ${connectionClass(socketStatus)} shadow-sm`}>
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold">
                {#if socketStatus === "connected"}
                  {t("tables.connection.connected")}
                {:else if socketStatus === "disconnected"}
                  {t("tables.connection.disconnected")}
                {:else}
                  {t("tables.connection.connecting")}
                {/if}
              </span>
              <span class={`badge ${connectionBadgeClass(socketStatus)}`}>
                {socketStatus}
              </span>
            </div>
            <span class="text-xs"
              >Snapshot {formatDateTime(snapshot.generatedAt)}</span
            >
            {#if realtimeError}
              <span class="text-xs">{realtimeError}</span>
            {/if}
          </div>
        </section>

        {#if isInterventionsModule}
          <section class="card border border-base-300 bg-base-100 shadow-sm">
            <div class="card-body gap-3">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Operator Verification
                </p>
                <h2 class="card-title mt-2">{t("tables.stepUp.title")}</h2>
                <p class="text-sm text-slate-500">
                  {t("tables.stepUp.description")}
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
                  placeholder={t("tables.stepUp.placeholder")}
                />
              </label>
            </div>
          </section>
        {/if}

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Source Mix
              </p>
              <h2 class="card-title mt-2">Runtime Composition</h2>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              {#each sourceSummary as item}
                <div class="flex items-center justify-between gap-4">
                  <dt>{t(sourceLabelKeys[item.sourceKind])}</dt>
                  <dd class="font-mono text-xs">{item.count}</dd>
                </div>
              {/each}
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
