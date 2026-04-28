<script lang="ts">
  import { page } from "$app/stores"
  import { getContext, onMount } from "svelte"
  import type {
    TableMonitoringChannelEvent,
    TableMonitoringSnapshot,
    TableMonitoringTable,
  } from "@reward/shared-types/table-monitoring"

  interface PageData {
    snapshot: TableMonitoringSnapshot
    wsUrl: string
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const emptySnapshot: TableMonitoringSnapshot = {
    generatedAt: new Date(0).toISOString(),
    tables: [],
  }

  let stepUpCode = $state("")
  let snapshot = $state<TableMonitoringSnapshot>(emptySnapshot)
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
    tables.flatMap((table) => table.seats).filter((seat) => seat.userId !== null)
      .length,
  )
  const timedOutSeats = $derived(
    tables.flatMap((table) => table.seats).filter((seat) => seat.isTimedOut)
      .length,
  )
  const actionError = $derived($page.form?.error as string | undefined)

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
    return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString()
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

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("tables.title")}
  </p>
  <h1 class="text-3xl font-semibold">{t("tables.title")}</h1>
  <p class="text-sm text-slate-600">{t("tables.description")}</p>
</header>

<section class="mt-6 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
  <div class={`alert ${connectionClass(socketStatus)} shadow-sm`}>
    <div class="flex flex-col gap-1">
      <span class="font-semibold">
        {#if socketStatus === "connected"}
          {t("tables.connection.connected")}
        {:else if socketStatus === "disconnected"}
          {t("tables.connection.disconnected")}
        {:else}
          {t("tables.connection.connecting")}
        {/if}
      </span>
      {#if realtimeError}
        <span class="text-xs">{realtimeError}</span>
      {/if}
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <div>
        <h2 class="card-title">{t("tables.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("tables.stepUp.description")}</p>
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
  </div>
</section>

{#if actionError}
  <div class="alert alert-error mt-6 text-sm shadow-sm">
    <span>{actionError}</span>
  </div>
{/if}

<section class="mt-6 grid gap-4 md:grid-cols-3">
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("tables.summary.liveTables")}</p>
    <p class="mt-2 text-3xl font-semibold text-slate-900">{tables.length}</p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("tables.summary.occupiedSeats")}</p>
    <p class="mt-2 text-3xl font-semibold text-slate-900">{occupiedSeats}</p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("tables.summary.timedOutSeats")}</p>
    <p class="mt-2 text-3xl font-semibold text-rose-600">{timedOutSeats}</p>
  </article>
</section>

{#if tables.length === 0}
  <section class="mt-6 rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center shadow-sm">
    <p class="text-sm text-slate-500">{t("tables.labels.noTables")}</p>
  </section>
{:else}
  <section class="mt-6 space-y-5">
    {#each tables as table}
      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
              <h2 class="text-2xl font-semibold text-slate-900">
                {table.displayName}
              </h2>
              <p class="mt-1 text-sm text-slate-500">
                {t("tables.labels.roundId")}: {table.roundId ?? "—"}
              </p>
            </div>
          </div>

          <dl class="grid gap-3 text-sm text-slate-600 md:grid-cols-3 xl:min-w-[28rem]">
            <div class="rounded-2xl bg-slate-50 px-4 py-3">
              <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("tables.labels.timeBank")}
              </dt>
              <dd class="mt-1 text-lg font-semibold text-slate-900">
                {formatTimeBank(table)}
              </dd>
            </div>
            <div class="rounded-2xl bg-slate-50 px-4 py-3">
              <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("tables.labels.currentActor")}
              </dt>
              <dd class="mt-1 text-lg font-semibold text-slate-900">
                {table.currentActorSeatIndex ?? t("tables.labels.none")}
              </dd>
            </div>
            <div class="rounded-2xl bg-slate-50 px-4 py-3">
              <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("tables.labels.updatedAt")}
              </dt>
              <dd class="mt-1 text-sm font-medium text-slate-900">
                {formatDateTime(table.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div class="mt-6 grid gap-5 xl:grid-cols-[1.35fr,0.9fr]">
          <div class="overflow-x-auto rounded-2xl border border-slate-200">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("tables.labels.user")}</th>
                  <th>{t("tables.labels.participantId")}</th>
                  <th>{t("tables.labels.timeBank")}</th>
                  <th>{t("tables.labels.userId")}</th>
                  <th class="text-right">{t("tables.actions.kickSeat")}</th>
                </tr>
              </thead>
              <tbody>
                {#each table.seats as seat}
                  <tr class={seat.isTimedOut ? "bg-rose-50/70" : undefined}>
                    <td>
                      <div class="font-semibold text-slate-900">
                        {seat.seatIndex}
                      </div>
                      <div class="text-xs text-slate-500">
                        {t(seatRoleLabelKeys[seat.role])}
                      </div>
                    </td>
                    <td>
                      <div class="font-medium text-slate-900">
                        {seat.displayName ?? "—"}
                      </div>
                      <div class="text-xs text-slate-500">
                        {t(seatStatusLabelKeys[seat.status])}
                      </div>
                    </td>
                    <td class="text-xs text-slate-500">
                      {seat.participantId ?? "—"}
                    </td>
                    <td class="font-medium text-slate-900">
                      {seat.isCurrentActor ? formatTimeBank(table) : "—"}
                    </td>
                    <td class="text-xs text-slate-500">
                      {seat.userId ?? "—"}
                    </td>
                    <td class="text-right">
                      {#if seat.canKick}
                        <form
                          method="post"
                          action="?/kickSeat"
                          class="flex flex-col items-end gap-2"
                        >
                          <input type="hidden" name="sourceKind" value={table.sourceKind} />
                          <input type="hidden" name="tableId" value={table.tableId} />
                          <input type="hidden" name="seatIndex" value={seat.seatIndex} />
                          <input type="hidden" name="totpCode" value={stepUpCode} />
                          <input
                            name="reason"
                            class="input input-bordered input-sm w-full max-w-xs"
                            placeholder={t("tables.actions.kickReasonPlaceholder")}
                          />
                          <button class="btn btn-error btn-xs" type="submit">
                            {t("tables.actions.kickSeat")}
                          </button>
                        </form>
                      {:else}
                        <span class="text-xs text-slate-400">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="space-y-4">
            <form
              method="post"
              action="?/forceTimeout"
              class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div class="space-y-3">
                <div>
                  <h3 class="font-semibold text-slate-900">
                    {t("tables.actions.forceTimeout")}
                  </h3>
                  <p class="text-sm text-slate-500">
                    {t("tables.labels.currentActor")}: {table.currentActorSeatIndex ?? t("tables.labels.none")}
                  </p>
                </div>
                <input type="hidden" name="sourceKind" value={table.sourceKind} />
                <input type="hidden" name="tableId" value={table.tableId} />
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <label class="form-control">
                  <span class="label-text mb-2">{t("tables.actions.reason")}</span>
                  <input
                    name="reason"
                    class="input input-bordered"
                    placeholder={t("tables.actions.timeoutReasonPlaceholder")}
                  />
                </label>
                <button
                  class="btn btn-warning"
                  type="submit"
                  disabled={!table.canForceTimeout}
                >
                  {t("tables.actions.forceTimeout")}
                </button>
              </div>
            </form>

            <form
              method="post"
              action="?/closeTable"
              class="rounded-2xl border border-rose-200 bg-rose-50 p-4"
            >
              <div class="space-y-3">
                <div>
                  <h3 class="font-semibold text-rose-900">
                    {t("tables.actions.closeTable")}
                  </h3>
                  <p class="text-sm text-rose-800">
                    {t("tables.labels.updatedAt")}: {formatDateTime(table.updatedAt)}
                  </p>
                </div>
                <input type="hidden" name="sourceKind" value={table.sourceKind} />
                <input type="hidden" name="tableId" value={table.tableId} />
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <label class="form-control">
                  <span class="label-text mb-2">{t("tables.actions.reason")}</span>
                  <input
                    name="reason"
                    class="input input-bordered"
                    placeholder={t("tables.actions.closeReasonPlaceholder")}
                    required
                  />
                </label>
                <button class="btn btn-error" type="submit">
                  {t("tables.actions.closeTable")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </article>
    {/each}
  </section>
{/if}
