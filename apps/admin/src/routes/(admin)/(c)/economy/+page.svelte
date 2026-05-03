<script lang="ts">
  import { page } from "$app/stores"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import type { ActionData } from "./$types"
  import EconomyModuleTabs from "./economy-module-tabs.svelte"
  import type { PageData } from "./page-support"

  let {
    data,
    form,
  }: {
    data: PageData
    form?: ActionData
  } = $props()

  let stepUpCode = $state("")

  const overview = $derived(data.overview)
  const assetTotals = $derived(overview?.assetTotals ?? [])
  const orderSummary = $derived(overview?.orderSummary ?? [])
  const recentOrders = $derived(overview?.recentOrders ?? [])
  const recentGifts = $derived(overview?.recentGifts ?? [])
  const activeGiftLocks = $derived(overview?.activeGiftLocks ?? [])
  const riskSignals = $derived(overview?.riskSignals ?? [])
  const giftSummary = $derived(
    overview?.giftSummary ?? {
      sentTodayCount: 0,
      sentTodayAmount: "0",
      sentLast24hCount: 0,
      sentLast24hAmount: "0",
    },
  )
  const energySummary = $derived(
    overview?.energySummary ?? {
      exhaustedCount: 0,
      belowMaxCount: 0,
      accountCount: 0,
    },
  )
  const totalAvailableBalance = $derived(
    assetTotals.reduce(
      (total, asset) => total + parseNumeric(asset.availableBalance),
      0,
    ),
  )
  const totalLockedBalance = $derived(
    assetTotals.reduce(
      (total, asset) => total + parseNumeric(asset.lockedBalance),
      0,
    ),
  )
  const manualApprovalPendingCount = $derived(
    recentOrders.filter((order) => isManualApprovalPending(order)).length,
  )
  const totalOrderCount = $derived(
    orderSummary.reduce((total, item) => total + item.count, 0),
  )
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/economy/assets") return "assets"
    if ($page.url.pathname === "/economy/orders") return "orders"
    if ($page.url.pathname === "/economy/controls") return "controls"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isAssetsModule = $derived(activeModule === "assets")
  const isOrdersModule = $derived(activeModule === "orders")
  const isControlsModule = $derived(activeModule === "controls")
  const pageDescription = $derived.by(() => {
    if (activeModule === "assets") {
      return "资产余额、recent gifts 和 risk signals 单独成页，方便只做 economy 审查。"
    }
    if (activeModule === "orders") {
      return "Store orders 与 replay / reverse 流程拆成独立队列，不再和资产台账混排。"
    }
    if (activeModule === "controls") {
      return "MFA、manual adjustment 和 gift lock 进入同一个控制面，便于高风险操作集中执行。"
    }
    return "B luck、voucher、gift pack、store order 与 gift 风控都在这里统一进入运营审查与人工干预流程。"
  })
  const economyModules = $derived([
    {
      href: "/economy/assets",
      eyebrow: "Asset Ledger",
      title: "Assets",
      description:
        "资产余额、gift ledger 和风险信号拆成独立工作台，只看 economy 曝险和转赠路径。",
      badge: `${assetTotals.length}`,
    },
    {
      href: "/economy/orders",
      eyebrow: "Order Queue",
      title: "Orders",
      description:
        "store order 的 replay、approve、refund 和 revoke 集中在单独 procedural queue。",
      badge: `${recentOrders.length}`,
    },
    {
      href: "/economy/controls",
      eyebrow: "Control Desk",
      title: "Controls",
      description:
        "step-up、manual adjustment、gift lock 和 release 流程拆进 operator 控制面。",
      badge: `${activeGiftLocks.length}`,
    },
  ])

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.getTime())) return "—"
    return parsed.toLocaleString()
  }

  const formatAmount = (value: number | string) =>
    parseNumeric(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  const isManualApprovalPending = (order: {
    metadata: Record<string, unknown> | null
    status: string
  }) =>
    order.status === "verified" &&
    order.metadata?.manualApprovalRequired === true &&
    order.metadata?.manualApprovalState !== "approved"

  const orderBadgeClass = (status: string) =>
    status === "fulfilled"
      ? "badge-success"
      : status === "verified"
        ? "badge-warning"
        : status === "refunded" || status === "revoked"
          ? "badge-ghost"
          : "badge-outline"

  const riskTone = (signal: {
    sharedDeviceCount: number
    sharedIpCount: number
    transferCount: number
  }) =>
    signal.sharedDeviceCount > 0 || signal.sharedIpCount > 0
      ? "border-[var(--admin-danger)]"
      : signal.transferCount >= 3
        ? "border-[var(--admin-warning)]"
        : "border-[var(--admin-border)]"

  function parseNumeric(value: number | string | null | undefined) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (value === null || value === undefined) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · economyOps"
    eyebrow="Consumer"
    title="Economy"
    description={pageDescription}
  />

  <EconomyModuleTabs />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if form?.error}
    <div class="alert alert-error text-sm">
      <span>{form.error}</span>
    </div>
  {/if}

  {#if form?.success}
    <div class="alert alert-success text-sm">
      <span>{form.success}</span>
    </div>
  {/if}

  {#if overview}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Asset Exposure
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {formatAmount(totalAvailableBalance)}
            </p>
            <span class="badge badge-outline">available</span>
          </div>
          <p class="text-sm text-slate-500">
            Locked {formatAmount(totalLockedBalance)} across {assetTotals.length}
            tracked economy assets.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Gift Flow
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {giftSummary.sentTodayCount}
            </p>
            <span class="badge badge-outline">today</span>
          </div>
          <p class="text-sm text-slate-500">
            {formatAmount(giftSummary.sentTodayAmount)} sent today; 24h volume {formatAmount(
              giftSummary.sentLast24hAmount,
            )}.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Manual Queue
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {manualApprovalPendingCount}
            </p>
            <span class="badge badge-outline">orders</span>
          </div>
          <p class="text-sm text-slate-500">
            {totalOrderCount} visible store orders with manual approval and reversal
            controls.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Risk Signals
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {riskSignals.length}
            </p>
            <span class="badge badge-outline">gift</span>
          </div>
          <p class="text-sm text-slate-500">
            {activeGiftLocks.length} active locks; {energySummary.exhaustedCount}
            accounts currently exhausted on gift energy.
          </p>
        </div>
      </article>
    </section>

    {#if isHubModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
      >
        <div class="card bg-base-100 shadow">
          <div class="card-body space-y-5">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Economy Drawer
                </p>
                <h2
                  class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
                >
                  分域操作入口
                </h2>
              </div>
            </div>

            <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              选择一个子模块进入。资产、订单和高风险控制已经拆开，不再让一个页面同时承担
              ledger、queue 和 operator command。
            </p>

            <div class="grid gap-4 lg:grid-cols-3">
              {#each economyModules as module}
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
                  Signal Lens
                </p>
                <h2 class="card-title mt-2">Economy Snapshot</h2>
              </div>

              <dl class="space-y-3 text-sm text-slate-700">
                <div class="flex items-center justify-between gap-4">
                  <dt>24h transfers</dt>
                  <dd class="font-mono text-xs">
                    {giftSummary.sentLast24hCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>24h amount</dt>
                  <dd class="font-mono text-xs">
                    {giftSummary.sentLast24hAmount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Gift accounts</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.accountCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Below max energy</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.belowMaxCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Exhausted</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.exhaustedCount}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </section>
    {/if}

    {#if isAssetsModule}
      <section class="space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-5">
            <div
              class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
            >
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Asset Ledger
                </p>
                <h2 class="card-title mt-2">Economy Balances</h2>
                <p class="text-sm text-slate-500">
                  Current exposure by asset code, with available and locked
                  balances split for operator review.
                </p>
              </div>
              <span class="badge badge-outline"
                >{assetTotals.length} assets</span
              >
            </div>

            <div class="overflow-x-auto">
              <table
                class="min-w-full border-separate border-spacing-0 text-sm"
              >
                <thead class="bg-[var(--admin-paper)]">
                  <tr>
                    <th
                      class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                      >Asset</th
                    >
                    <th
                      class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                      >Available</th
                    >
                    <th
                      class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                      >Locked</th
                    >
                    <th
                      class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                      >Users</th
                    >
                  </tr>
                </thead>
                <tbody>
                  {#if assetTotals.length === 0}
                    <tr>
                      <td
                        colspan="4"
                        class="px-4 py-10 text-center text-sm text-[var(--admin-muted)]"
                      >
                        No economy assets tracked yet.
                      </td>
                    </tr>
                  {:else}
                    {#each assetTotals as asset}
                      <tr>
                        <td
                          class="border-b border-[var(--admin-border)] px-4 py-4"
                        >
                          <div class="font-medium text-[var(--admin-ink)]">
                            {asset.assetCode}
                          </div>
                        </td>
                        <td
                          class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-[var(--admin-ink)]"
                        >
                          {asset.availableBalance}
                        </td>
                        <td
                          class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-[var(--admin-muted)]"
                        >
                          {asset.lockedBalance}
                        </td>
                        <td
                          class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-[var(--admin-muted)]"
                        >
                          {asset.userCount}
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Gift Ledger
                </p>
                <h2 class="card-title mt-2">Recent Gifts</h2>
              </div>

              {#if recentGifts.length === 0}
                <div
                  class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-muted)]"
                >
                  No gifts yet.
                </div>
              {:else}
                <div class="space-y-3">
                  {#each recentGifts as gift}
                    <article
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm"
                    >
                      <div
                        class="flex flex-wrap items-center justify-between gap-3"
                      >
                        <p class="font-medium text-[var(--admin-ink)]">
                          #{gift.id} · {gift.amount} · {gift.status}
                        </p>
                        <span
                          class="font-mono text-xs text-[var(--admin-muted-soft)]"
                        >
                          {formatDate(gift.createdAt)}
                        </span>
                      </div>
                      <p class="mt-2 text-[var(--admin-muted)]">
                        sender #{gift.senderUserId} → receiver #{gift.receiverUserId}
                      </p>
                      <p
                        class="mt-1 font-mono text-xs text-[var(--admin-muted)]"
                      >
                        energy cost {gift.energyCost}
                      </p>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Investigation Matrix
                </p>
                <h2 class="card-title mt-2">Gift Risk Signals</h2>
              </div>

              {#if riskSignals.length === 0}
                <div
                  class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-muted)]"
                >
                  No gift risk signal yet.
                </div>
              {:else}
                <div class="space-y-3">
                  {#each riskSignals as signal}
                    <article
                      class={`rounded-[0.95rem] border bg-[var(--admin-paper)] p-4 ${riskTone(signal)}`}
                    >
                      <div
                        class="flex flex-wrap items-center justify-between gap-3"
                      >
                        <p class="font-medium text-[var(--admin-ink)]">
                          #{signal.senderUserId} → #{signal.receiverUserId}
                        </p>
                        <span
                          class="font-mono text-xs text-[var(--admin-muted-soft)]"
                        >
                          {formatDate(signal.lastTransferAt)}
                        </span>
                      </div>
                      <div
                        class="mt-3 grid gap-3 text-sm text-[var(--admin-muted)] md:grid-cols-2"
                      >
                        <div>Transfers: {signal.transferCount}</div>
                        <div>Total: {signal.totalAmount}</div>
                        <div>Shared device: {signal.sharedDeviceCount}</div>
                        <div>Shared IP: {signal.sharedIpCount}</div>
                      </div>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          </section>
        </section>
      </section>
    {/if}

    {#if isOrdersModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1.24fr)_minmax(320px,0.76fr)]"
      >
        <div class="min-w-0">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
              >
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Order Queue
                  </p>
                  <h2 class="card-title mt-2">Store Orders</h2>
                  <p class="text-sm text-slate-500">
                    Replay, approve, refund, and revoke store orders from a
                    single procedural queue.
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each orderSummary as item}
                    <span class="badge badge-outline">
                      {item.status}: {item.count}
                    </span>
                  {/each}
                </div>
              </div>

              {#if recentOrders.length === 0}
                <div
                  class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
                >
                  No store orders yet.
                </div>
              {:else}
                <div class="space-y-4">
                  {#each recentOrders as order}
                    <article
                      class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      data-testid={`economy-order-${order.id}`}
                    >
                      <div
                        class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
                      >
                        <div class="space-y-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="font-medium text-[var(--admin-ink)]">
                              #{order.id} · {order.sku}
                            </p>
                            <span
                              class={`badge ${orderBadgeClass(order.status)}`}
                            >
                              {order.status}
                            </span>
                            {#if isManualApprovalPending(order)}
                              <span class="badge badge-warning">
                                manual approval
                              </span>
                            {/if}
                          </div>

                          <div class="text-sm text-[var(--admin-muted)]">
                            {order.storeChannel} · {order.deliveryType}
                          </div>
                          <div
                            class="font-mono text-xs text-[var(--admin-muted)]"
                          >
                            purchaser #{order.userId}
                            {#if order.recipientUserId}
                              · recipient #{order.recipientUserId}
                            {/if}
                          </div>
                          <div class="text-xs text-[var(--admin-muted-soft)]">
                            {formatDate(order.createdAt)}
                          </div>
                        </div>

                        <div class="grid gap-3 lg:grid-cols-2 xl:min-w-[28rem]">
                          <form
                            method="POST"
                            action="?/replayFulfillment"
                            class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-3"
                            data-testid={`economy-order-replay-form-${order.id}`}
                          >
                            <input
                              type="hidden"
                              name="orderId"
                              value={order.id}
                            />
                            <input
                              type="hidden"
                              name="totpCode"
                              value={stepUpCode}
                            />
                            <div class="space-y-2">
                              <p
                                class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                              >
                                Fulfillment
                              </p>
                              <p class="text-sm text-[var(--admin-muted)]">
                                {isManualApprovalPending(order)
                                  ? "Approve manual fulfillment and release the order."
                                  : "Replay fulfillment against the current delivery channel."}
                              </p>
                              <button
                                class="btn btn-outline btn-sm w-full"
                                type="submit"
                              >
                                {isManualApprovalPending(order)
                                  ? "Approve"
                                  : "Replay"}
                              </button>
                            </div>
                          </form>

                          <form
                            method="POST"
                            action="?/reverseOrder"
                            class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-3"
                            data-testid={`economy-order-reverse-form-${order.id}`}
                          >
                            <input
                              type="hidden"
                              name="orderId"
                              value={order.id}
                            />
                            <input
                              type="hidden"
                              name="totpCode"
                              value={stepUpCode}
                            />
                            <div class="space-y-3">
                              <p
                                class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                              >
                                Reversal
                              </p>
                              <select
                                class="select select-bordered select-sm w-full"
                                name="targetStatus"
                              >
                                <option value="refunded">Refund</option>
                                <option value="revoked">Revoke</option>
                              </select>
                              <input
                                class="input input-bordered input-sm w-full"
                                name="reason"
                                placeholder="Reason"
                              />
                              <button class="btn btn-sm w-full" type="submit">
                                Reverse
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          </section>
        </div>

        <aside class="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Operator Verification
                </p>
                <h2 class="card-title mt-2">Step-Up MFA</h2>
                <p class="text-sm text-slate-500">
                  Replay、reverse 和需要人工批准的 store order
                  都要求新鲜的管理员 MFA。
                </p>
              </div>

              <label class="form-control">
                <span class="label-text mb-2">Admin MFA code</span>
                <input
                  data-testid="economy-step-up-code"
                  name="totpCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={stepUpCode}
                  placeholder="Enter MFA code before high-risk actions"
                />
              </label>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Queue Lens
                </p>
                <h2 class="card-title mt-2">Order Snapshot</h2>
              </div>

              <dl class="space-y-3 text-sm text-slate-700">
                <div class="flex items-center justify-between gap-4">
                  <dt>Manual approvals</dt>
                  <dd class="font-mono text-xs">
                    {manualApprovalPendingCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Total visible orders</dt>
                  <dd class="font-mono text-xs">{totalOrderCount}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Fulfillable queue</dt>
                  <dd class="font-mono text-xs">{recentOrders.length}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Active gift locks</dt>
                  <dd class="font-mono text-xs">{activeGiftLocks.length}</dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </section>
    {/if}

    {#if isControlsModule}
      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]"
      >
        <div class="space-y-6">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Operator Verification
                </p>
                <h2 class="card-title mt-2">Step-Up MFA</h2>
                <p class="text-sm text-slate-500">
                  Replay、reverse、manual adjustment 和 gift freeze
                  都要求新鲜的管理员 MFA。
                </p>
              </div>

              <label class="form-control">
                <span class="label-text mb-2">Admin MFA code</span>
                <input
                  data-testid="economy-step-up-code"
                  name="totpCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={stepUpCode}
                  placeholder="Enter MFA code before high-risk actions"
                />
              </label>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Adjustment Desk
                </p>
                <h2 class="card-title mt-2">Manual Adjustment</h2>
                <p class="text-sm text-slate-500">
                  Credit 或 debit 指定资产余额，并留下明确的 operator
                  rationale。
                </p>
              </div>

              <form method="POST" action="?/adjustAsset" class="space-y-3">
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input
                  class="input input-bordered w-full"
                  name="userId"
                  placeholder="User ID"
                />
                <select class="select select-bordered w-full" name="assetCode">
                  <option value="B_LUCK">B_LUCK</option>
                  <option value="IAP_VOUCHER">IAP_VOUCHER</option>
                </select>
                <select class="select select-bordered w-full" name="direction">
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
                <input
                  class="input input-bordered w-full"
                  name="amount"
                  placeholder="Amount"
                />
                <input
                  class="input input-bordered w-full"
                  name="reason"
                  placeholder="Reason"
                />
                <button class="btn btn-primary btn-sm w-full" type="submit">
                  Submit adjustment
                </button>
              </form>
            </div>
          </section>
        </div>

        <aside class="space-y-6">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Capability Control
                </p>
                <h2 class="card-title mt-2">Gift Lock</h2>
                <p class="text-sm text-slate-500">
                  临时冻结 gift capability，并将操作原因写入冻结记录。
                </p>
              </div>

              <form
                method="POST"
                action="?/freezeGift"
                class="space-y-3"
                data-testid="economy-freeze-gift-form"
              >
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input
                  class="input input-bordered w-full"
                  name="userId"
                  placeholder="User ID"
                />
                <input
                  class="input input-bordered w-full"
                  name="reason"
                  placeholder="Operator note"
                />
                <button class="btn btn-primary btn-sm w-full" type="submit">
                  Freeze gift capability
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
                  Freeze Queue
                </p>
                <h2 class="card-title mt-2">Active Gift Locks</h2>
              </div>

              {#if activeGiftLocks.length === 0}
                <div
                  class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-[var(--admin-muted)]"
                >
                  No active gift locks.
                </div>
              {:else}
                <div class="space-y-3">
                  {#each activeGiftLocks as lock}
                    <article
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                    >
                      <p class="font-medium text-[var(--admin-ink)]">
                        user #{lock.userId}
                      </p>
                      <p class="mt-1 text-sm text-[var(--admin-muted)]">
                        {lock.reason}
                      </p>
                      <p class="mt-1 text-xs text-[var(--admin-muted-soft)]">
                        {formatDate(lock.createdAt)}
                      </p>

                      <form
                        method="POST"
                        action="?/releaseGiftFreeze"
                        class="mt-3 space-y-2"
                      >
                        <input
                          type="hidden"
                          name="freezeRecordId"
                          value={lock.id}
                        />
                        <input
                          type="hidden"
                          name="totpCode"
                          value={stepUpCode}
                        />
                        <input
                          class="input input-bordered input-sm w-full"
                          name="reason"
                          placeholder="Reason"
                        />
                        <button
                          class="btn btn-outline btn-sm w-full"
                          type="submit"
                        >
                          Release
                        </button>
                      </form>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Signal Lens
                </p>
                <h2 class="card-title mt-2">Economy Snapshot</h2>
              </div>

              <dl class="space-y-3 text-sm text-slate-700">
                <div class="flex items-center justify-between gap-4">
                  <dt>24h transfers</dt>
                  <dd class="font-mono text-xs">
                    {giftSummary.sentLast24hCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>24h amount</dt>
                  <dd class="font-mono text-xs">
                    {giftSummary.sentLast24hAmount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Gift accounts</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.accountCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Below max energy</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.belowMaxCount}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Exhausted</dt>
                  <dd class="font-mono text-xs">
                    {energySummary.exhaustedCount}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </section>
    {/if}
  {/if}
</div>
