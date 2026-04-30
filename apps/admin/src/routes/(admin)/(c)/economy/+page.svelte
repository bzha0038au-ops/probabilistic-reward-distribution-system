<script lang="ts">
  import type { ActionData } from "./$types"

  type PageData = {
    overview: {
      assetTotals: Array<{
        assetCode: string
        userCount: number
        availableBalance: string
        lockedBalance: string
      }>
      giftSummary: {
        sentTodayCount: number
        sentTodayAmount: string
        sentLast24hCount: number
        sentLast24hAmount: string
      }
      energySummary: {
        exhaustedCount: number
        belowMaxCount: number
        accountCount: number
      }
      orderSummary: Array<{
        status: string
        count: number
      }>
      recentGifts: Array<{
        id: number
        senderUserId: number
        receiverUserId: number
        amount: string
        status: string
        energyCost: number
        createdAt: string | Date | null
      }>
      recentOrders: Array<{
        id: number
        userId: number
        recipientUserId: number | null
        status: string
        storeChannel: string
        metadata: Record<string, unknown> | null
        sku: string
        deliveryType: string
        createdAt: string | Date | null
      }>
      activeGiftLocks: Array<{
        id: number
        userId: number
        reason: string
        createdAt: string | Date | null
      }>
      riskSignals: Array<{
        senderUserId: number
        receiverUserId: number
        transferCount: number
        totalAmount: string
        sharedDeviceCount: number
        sharedIpCount: number
        lastTransferAt: string | Date | null
      }>
    } | null
    error: string | null
  }

  let { data, form }: { data: PageData; form: ActionData } = $props()
  let stepUpCode = $state("")

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.getTime())) return "—"
    return parsed.toLocaleString()
  }

  const isManualApprovalPending = (order: {
    metadata: Record<string, unknown> | null
    status: string
  }) =>
    order.status === "verified" &&
    order.metadata?.manualApprovalRequired === true &&
    order.metadata?.manualApprovalState !== "approved"
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-semibold text-slate-950">Economy Operations</h1>
    <p class="mt-2 text-sm text-slate-500">
      B luck / voucher / gift pack overview, operator controls, and fraud signals.
    </p>
  </div>

  {#if data.error}
    <div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {data.error}
    </div>
  {/if}

  {#if form?.error}
    <div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {form.success}
    </div>
  {/if}

  <section class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
    <div class="space-y-2">
      <h2 class="text-lg font-semibold text-slate-950">Step-Up MFA</h2>
      <p class="text-sm text-slate-500">
        Replay, reverse, manual adjustment, and gift lock actions require a fresh admin MFA code.
      </p>
    </div>
    <label class="form-control mt-4">
      <span class="label-text mb-2">Admin MFA code</span>
      <input
        data-testid="economy-step-up-code"
        name="totpCode"
        type="text"
        inputmode="text"
        autocomplete="one-time-code"
        class="input input-bordered max-w-sm"
        bind:value={stepUpCode}
        placeholder="Enter MFA code before submitting high-risk actions"
      />
    </label>
  </section>

  {#if data.overview}
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {#each data.overview.assetTotals as asset}
        <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            {asset.assetCode}
          </p>
          <p class="mt-3 text-2xl font-semibold text-slate-950">
            {asset.availableBalance}
          </p>
          <div class="mt-3 space-y-1 text-sm text-slate-600">
            <p>Locked: {asset.lockedBalance}</p>
            <p>Users: {asset.userCount}</p>
          </div>
        </div>
      {/each}
    </section>

    <section class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Gift Summary</h2>
        <div class="mt-4 space-y-2 text-sm text-slate-700">
          <p>Today: {data.overview.giftSummary.sentTodayCount} transfers</p>
          <p>Today amount: {data.overview.giftSummary.sentTodayAmount}</p>
          <p>24h: {data.overview.giftSummary.sentLast24hCount} transfers</p>
          <p>24h amount: {data.overview.giftSummary.sentLast24hAmount}</p>
        </div>
      </div>

      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Gift Energy</h2>
        <div class="mt-4 space-y-2 text-sm text-slate-700">
          <p>Accounts: {data.overview.energySummary.accountCount}</p>
          <p>Exhausted: {data.overview.energySummary.exhaustedCount}</p>
          <p>Below max: {data.overview.energySummary.belowMaxCount}</p>
        </div>
      </div>

      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Order States</h2>
        <div class="mt-4 space-y-2 text-sm text-slate-700">
          {#if data.overview.orderSummary.length === 0}
            <p>No store orders yet.</p>
          {:else}
            {#each data.overview.orderSummary as item}
              <p>{item.status}: {item.count}</p>
            {/each}
          {/if}
        </div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Store Orders</h2>
        <div class="mt-4 space-y-4">
          {#if data.overview.recentOrders.length === 0}
            <p class="text-sm text-slate-500">No store orders yet.</p>
          {:else}
            {#each data.overview.recentOrders as order}
              <div
                class="rounded-2xl border border-base-300 p-4"
                data-testid={`economy-order-${order.id}`}
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-1">
                    <p class="font-medium text-slate-950">
                      #{order.id} · {order.sku}
                    </p>
                    <p class="text-sm text-slate-500">
                      {order.storeChannel} · {order.deliveryType} · {order.status}
                    </p>
                    <p class="text-sm text-slate-500">
                      purchaser #{order.userId}
                      {#if order.recipientUserId}
                        · recipient #{order.recipientUserId}
                      {/if}
                    </p>
                    {#if isManualApprovalPending(order)}
                      <p class="text-xs font-medium text-amber-600">
                        Pending manual approval
                      </p>
                    {/if}
                    <p class="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <form
                      method="POST"
                      action="?/replayFulfillment"
                      data-testid={`economy-order-replay-form-${order.id}`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <button class="btn btn-sm btn-outline" type="submit">
                        {isManualApprovalPending(order) ? "Approve" : "Replay"}
                      </button>
                    </form>
                    <form
                      method="POST"
                      action="?/reverseOrder"
                      class="flex flex-wrap gap-2"
                      data-testid={`economy-order-reverse-form-${order.id}`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <select class="select select-bordered select-sm" name="targetStatus">
                        <option value="refunded">Refund</option>
                        <option value="revoked">Revoke</option>
                      </select>
                      <input
                        class="input input-bordered input-sm w-40"
                        name="reason"
                        placeholder="Reason"
                      />
                      <button class="btn btn-sm btn-outline" type="submit">
                        Reverse
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-950">Manual Adjustment</h2>
          <form method="POST" action="?/adjustAsset" class="mt-4 space-y-3">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <input class="input input-bordered w-full" name="userId" placeholder="User ID" />
            <select class="select select-bordered w-full" name="assetCode">
              <option value="B_LUCK">B_LUCK</option>
              <option value="IAP_VOUCHER">IAP_VOUCHER</option>
            </select>
            <select class="select select-bordered w-full" name="direction">
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            <input class="input input-bordered w-full" name="amount" placeholder="Amount" />
            <input class="input input-bordered w-full" name="reason" placeholder="Reason" />
            <button class="btn btn-primary btn-sm" type="submit">Submit adjustment</button>
          </form>
        </div>

        <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-950">Gift Lock</h2>
          <form
            method="POST"
            action="?/freezeGift"
            class="mt-4 space-y-3"
            data-testid="economy-freeze-gift-form"
          >
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <input class="input input-bordered w-full" name="userId" placeholder="User ID" />
            <input class="input input-bordered w-full" name="reason" placeholder="Operator note" />
            <button class="btn btn-primary btn-sm" type="submit">Freeze gift capability</button>
          </form>
        </div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Recent Gifts</h2>
        <div class="mt-4 space-y-3">
          {#if data.overview.recentGifts.length === 0}
            <p class="text-sm text-slate-500">No gifts yet.</p>
          {:else}
            {#each data.overview.recentGifts as gift}
              <div class="rounded-2xl border border-base-300 p-4 text-sm text-slate-700">
                <p class="font-medium text-slate-950">
                  #{gift.id} · {gift.amount} · {gift.status}
                </p>
                <p>sender #{gift.senderUserId} → receiver #{gift.receiverUserId}</p>
                <p>energy cost {gift.energyCost}</p>
                <p class="text-xs text-slate-400">{formatDate(gift.createdAt)}</p>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <div class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-950">Active Gift Locks</h2>
        <div class="mt-4 space-y-3">
          {#if data.overview.activeGiftLocks.length === 0}
            <p class="text-sm text-slate-500">No active gift locks.</p>
          {:else}
            {#each data.overview.activeGiftLocks as lock}
              <div class="rounded-2xl border border-base-300 p-4 text-sm text-slate-700">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="font-medium text-slate-950">user #{lock.userId}</p>
                    <p>{lock.reason}</p>
                    <p class="text-xs text-slate-400">{formatDate(lock.createdAt)}</p>
                  </div>
                  <form method="POST" action="?/releaseGiftFreeze" class="flex gap-2">
                    <input type="hidden" name="freezeRecordId" value={lock.id} />
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input class="input input-bordered input-sm w-32" name="reason" placeholder="Reason" />
                    <button class="btn btn-sm btn-outline" type="submit">Release</button>
                  </form>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </section>

    <section class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-950">Gift Risk Signals</h2>
      <div class="mt-4 overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Transfers</th>
              <th>Total</th>
              <th>Shared device</th>
              <th>Shared IP</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {#if data.overview.riskSignals.length === 0}
              <tr>
                <td colspan="6" class="text-sm text-slate-500">No gift risk signal yet.</td>
              </tr>
            {:else}
              {#each data.overview.riskSignals as signal}
                <tr>
                  <td>#{signal.senderUserId} → #{signal.receiverUserId}</td>
                  <td>{signal.transferCount}</td>
                  <td>{signal.totalAmount}</td>
                  <td>{signal.sharedDeviceCount}</td>
                  <td>{signal.sharedIpCount}</td>
                  <td>{formatDate(signal.lastTransferAt)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
