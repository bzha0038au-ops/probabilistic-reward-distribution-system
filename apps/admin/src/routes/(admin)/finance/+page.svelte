<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  interface Deposit {
    id: number
    userId: number
    amount: string
    status: string
    createdAt?: string
  }

  interface Withdrawal {
    id: number
    userId: number
    amount: string
    status: string
    bankCardId?: number | null
    createdAt?: string
  }

  interface PageData {
    deposits: Deposit[]
    withdrawals: Withdrawal[]
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }
  let stepUpCode = $state("")

  const deposits = $derived(data.deposits ?? [])
  const withdrawals = $derived(data.withdrawals ?? [])
  const actionError = $derived($page.form?.error as string | undefined)

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const depositStatusLabel = (status: string) => {
    if (status === "success") return t("finance.deposits.statusSuccess")
    if (status === "failed") return t("finance.deposits.statusFailed")
    return t("finance.deposits.statusPending")
  }

  const withdrawalStatusLabel = (status: string) => {
    if (status === "approved") return t("finance.withdrawals.statusApproved")
    if (status === "rejected") return t("finance.withdrawals.statusRejected")
    if (status === "paid") return t("finance.withdrawals.statusPaid")
    return t("finance.withdrawals.statusPending")
  }
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("finance.title")}
  </p>
  <h1 class="text-3xl font-semibold">{t("finance.title")}</h1>
  <p class="text-sm text-slate-600">{t("finance.description")}</p>
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
      <h2 class="card-title">{t("finance.stepUp.title")}</h2>
      <p class="text-sm text-slate-500">{t("finance.stepUp.description")}</p>
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
        placeholder={t("finance.stepUp.placeholder")}
      />
    </label>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("finance.deposits.title")}</h2>
        <p class="text-sm text-slate-500">{t("finance.deposits.description")}</p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("finance.deposits.headers.id")}</th>
            <th>{t("finance.deposits.headers.userId")}</th>
            <th>{t("finance.deposits.headers.amount")}</th>
            <th>{t("finance.deposits.headers.status")}</th>
            <th>{t("finance.deposits.headers.createdAt")}</th>
            <th class="text-right">{t("finance.deposits.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each deposits as deposit}
            <tr>
              <td>{deposit.id}</td>
              <td>{deposit.userId}</td>
              <td>{deposit.amount}</td>
              <td>{depositStatusLabel(deposit.status)}</td>
              <td>{formatDate(deposit.createdAt)}</td>
              <td class="text-right">
                {#if deposit.status === "pending"}
                  <div class="flex justify-end gap-2">
                    <form method="post" action="?/approveDeposit">
                      <input type="hidden" name="id" value={deposit.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <button class="btn btn-xs btn-primary" type="submit">
                        {t("finance.deposits.actionApprove")}
                      </button>
                    </form>
                    <form method="post" action="?/failDeposit">
                      <input type="hidden" name="id" value={deposit.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <button class="btn btn-xs btn-outline" type="submit">
                        {t("finance.deposits.actionFail")}
                      </button>
                    </form>
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
          {#if deposits.length === 0}
            <tr>
              <td colspan="6" class="text-center text-slate-500">
                {t("finance.deposits.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("finance.withdrawals.title")}</h2>
        <p class="text-sm text-slate-500">{t("finance.withdrawals.description")}</p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("finance.withdrawals.headers.id")}</th>
            <th>{t("finance.withdrawals.headers.userId")}</th>
            <th>{t("finance.withdrawals.headers.amount")}</th>
            <th>{t("finance.withdrawals.headers.status")}</th>
            <th>{t("finance.withdrawals.headers.bankCardId")}</th>
            <th>{t("finance.withdrawals.headers.createdAt")}</th>
            <th class="text-right">{t("finance.withdrawals.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each withdrawals as withdrawal}
            <tr>
              <td>{withdrawal.id}</td>
              <td>{withdrawal.userId}</td>
              <td>{withdrawal.amount}</td>
              <td>{withdrawalStatusLabel(withdrawal.status)}</td>
              <td>{withdrawal.bankCardId ?? "-"}</td>
              <td>{formatDate(withdrawal.createdAt)}</td>
              <td class="text-right">
                {#if withdrawal.status === "pending" || withdrawal.status === "approved"}
                  <div class="flex justify-end gap-2">
                    {#if withdrawal.status === "pending"}
                      <form method="post" action="?/approveWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.withdrawals.actionApprove")}
                        </button>
                      </form>
                      <form method="post" action="?/rejectWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReject")}
                        </button>
                      </form>
                    {/if}
                    <form method="post" action="?/payWithdrawal">
                      <input type="hidden" name="id" value={withdrawal.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <button class="btn btn-xs btn-primary" type="submit">
                        {t("finance.withdrawals.actionPay")}
                      </button>
                    </form>
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
          {#if withdrawals.length === 0}
            <tr>
              <td colspan="7" class="text-center text-slate-500">
                {t("finance.withdrawals.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
