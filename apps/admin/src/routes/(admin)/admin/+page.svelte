<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  interface Prize {
    id: number
    name: string
    stock: number
    weight: number
    poolThreshold: string
    userPoolThreshold: string
    rewardAmount: string
    payoutBudget: string
    payoutPeriodDays: number
    isActive: boolean
  }

  interface AnalyticsSummary {
    totalDrawCount: number
    wonCount: number
    missCount: number
    winRate: number
    systemPoolBalance: string
    topSpenders: { userId: number; spent: number }[]
  }

  interface SystemConfig {
    poolBalance: string
    drawCost: string
    weightJitterEnabled: boolean
    weightJitterPct: string
    bonusAutoReleaseEnabled: boolean
    bonusUnlockWagerRatio: string
    authFailureWindowMinutes: string
    authFailureFreezeThreshold: string
    adminFailureFreezeThreshold: string
  }

  interface CurrentAdmin {
    adminId: number
    userId: number
    email: string
    mfaEnabled: boolean
  }

  interface MfaEnrollment {
    secret: string
    otpauthUrl: string
    enrollmentToken: string
  }

  interface PageData {
    admin?: CurrentAdmin | null
    prizes: Prize[]
    analytics: AnalyticsSummary | null
    config: SystemConfig | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  let createForm = $state({
    name: "",
    stock: "0",
    weight: "1",
    poolThreshold: "0",
    userPoolThreshold: "0",
    rewardAmount: "0",
    payoutBudget: "0",
    payoutPeriodDays: "1",
    isActive: true,
  })

  let editForm = $state<(typeof createForm & { id: number }) | null>(null)
  let configForm = $state({
    poolBalance: "0",
    drawCost: "0",
    weightJitterEnabled: false,
    weightJitterPct: "0.05",
    bonusAutoReleaseEnabled: false,
    bonusUnlockWagerRatio: "1",
    authFailureWindowMinutes: "15",
    authFailureFreezeThreshold: "8",
    adminFailureFreezeThreshold: "5",
  })

  let bonusReleaseForm = $state({
    userId: "",
    amount: "",
  })
  let stepUpCode = $state("")
  let mfaEnrollmentCode = $state("")

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const currentAdmin = $derived(data.admin ?? null)
  const analytics = $derived(data.analytics)
  const config = $derived(data.config)
  const prizes = $derived(data.prizes)
  const mfaEnrollment = $derived($page.form?.mfaEnrollment as MfaEnrollment | undefined)
  const mfaEnabled = $derived(
    Boolean(($page.form?.mfaEnabled as boolean | undefined) ?? currentAdmin?.mfaEnabled)
  )
  const winRateLabel = $derived(
    analytics ? `${(analytics.winRate * 100).toFixed(2)}%` : "0%"
  )

  const actionError = $derived($page.form?.error as string | undefined)

  const startEdit = (prize: Prize) => {
    editForm = {
      id: prize.id,
      name: prize.name,
      stock: String(prize.stock ?? 0),
      weight: String(prize.weight ?? 0),
      poolThreshold: String(prize.poolThreshold ?? "0"),
      userPoolThreshold: String(prize.userPoolThreshold ?? "0"),
      rewardAmount: String(prize.rewardAmount ?? "0"),
      payoutBudget: String(prize.payoutBudget ?? "0"),
      payoutPeriodDays: String(prize.payoutPeriodDays ?? 1),
      isActive: Boolean(prize.isActive),
    }
  }

  $effect(() => {
    if (!config) return
    configForm.poolBalance = String(config.poolBalance ?? "0")
    configForm.drawCost = String(config.drawCost ?? "0")
    configForm.weightJitterEnabled = Boolean(config.weightJitterEnabled)
    configForm.weightJitterPct = String(config.weightJitterPct ?? "0")
    configForm.bonusAutoReleaseEnabled = Boolean(config.bonusAutoReleaseEnabled)
    configForm.bonusUnlockWagerRatio = String(config.bonusUnlockWagerRatio ?? "1")
    configForm.authFailureWindowMinutes = String(
      config.authFailureWindowMinutes ?? "15"
    )
    configForm.authFailureFreezeThreshold = String(
      config.authFailureFreezeThreshold ?? "8"
    )
    configForm.adminFailureFreezeThreshold = String(
      config.adminFailureFreezeThreshold ?? "5"
    )
  })

  const confirmDelete = (event: SubmitEvent) => {
    if (!confirm(t("admin.confirmDelete"))) {
      event.preventDefault()
    }
  }
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("admin.eyebrow")}
  </p>
  <h1 class="text-3xl font-semibold">{t("admin.heading")}</h1>
  <p class="text-sm text-slate-600">{t("admin.description")}</p>
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

<section class="mt-6 grid gap-6 md:grid-cols-3">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.totalDraws")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.totalDrawCount ?? 0}
      </p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.winRate")}</p>
      <p class="text-2xl font-semibold">{winRateLabel}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.poolBalance")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.systemPoolBalance ?? 0}
      </p>
    </div>
  </div>
</section>

<section class="mt-8 grid gap-6 lg:grid-cols-2">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="card-title">{t("admin.mfa.title")}</h2>
          <p class="text-sm text-slate-500">{t("admin.mfa.description")}</p>
        </div>
        <span class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}>
          {mfaEnabled ? t("admin.mfa.enabled") : t("admin.mfa.disabled")}
        </span>
      </div>

      {#if !mfaEnabled}
        <form method="post" action="?/startMfaEnrollment">
          <button class="btn btn-outline" type="submit">
            {t("admin.mfa.start")}
          </button>
        </form>

        {#if mfaEnrollment}
          <div class="grid gap-4">
            <label class="form-control">
              <span class="label-text mb-2">{t("admin.mfa.secret")}</span>
              <input
                class="input input-bordered font-mono"
                readonly
                value={mfaEnrollment.secret}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("admin.mfa.otpauthUrl")}</span>
	              <textarea
	                class="textarea textarea-bordered min-h-24 font-mono text-xs"
	                readonly
	              >{mfaEnrollment.otpauthUrl}</textarea>
            </label>
            <form method="post" action="?/confirmMfaEnrollment" class="grid gap-4">
              <input
                type="hidden"
                name="enrollmentToken"
                value={mfaEnrollment.enrollmentToken}
              />
              <label class="form-control max-w-sm">
                <span class="label-text mb-2">{t("common.totpCode")}</span>
                <input
                  name="totpCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={mfaEnrollmentCode}
                  placeholder={t("admin.mfa.codePlaceholder")}
                />
              </label>
              <button class="btn btn-primary max-w-sm" type="submit">
                {t("admin.mfa.confirm")}
              </button>
            </form>
          </div>
        {/if}
      {:else}
        <p class="text-sm text-slate-500">{t("admin.mfa.enabledHint")}</p>
      {/if}
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.stepUp.description")}</p>
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
          placeholder={t("admin.stepUp.placeholder")}
          disabled={!mfaEnabled}
        />
      </label>
      {#if !mfaEnabled}
        <p class="text-sm text-warning">{t("admin.stepUp.mfaRequired")}</p>
      {/if}
    </div>
  </div>
</section>

<section class="mt-6 grid gap-6 lg:grid-cols-2">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.config.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.config.description")}</p>
      </div>

      <form method="post" action="?/config" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="config-pool">
              <span class="label-text">{t("admin.config.poolBalance")}</span>
            </label>
            <input
              id="config-pool"
              name="poolBalance"
              type="number"
              class="input input-bordered"
              bind:value={configForm.poolBalance}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-drawcost">
              <span class="label-text">{t("admin.config.drawCost")}</span>
            </label>
            <input
              id="config-drawcost"
              name="drawCost"
              type="number"
              class="input input-bordered"
              bind:value={configForm.drawCost}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-jitter">
              <span class="label-text">{t("admin.config.weightJitterPct")}</span>
            </label>
            <input
              id="config-jitter"
              name="weightJitterPct"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.weightJitterPct}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-bonus-ratio">
              <span class="label-text">{t("admin.config.bonusUnlockWagerRatio")}</span>
            </label>
            <input
              id="config-bonus-ratio"
              name="bonusUnlockWagerRatio"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.bonusUnlockWagerRatio}
            />
          </div>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="weightJitterEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.weightJitterEnabled}
            />
            <span class="label-text">{t("admin.config.weightJitterEnabled")}</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="bonusAutoReleaseEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.bonusAutoReleaseEnabled}
            />
            <span class="label-text">{t("admin.config.bonusAutoReleaseEnabled")}</span>
          </label>
          <div class="form-control">
            <label class="label" for="config-auth-window">
              <span class="label-text">{t("admin.config.authFailureWindowMinutes")}</span>
            </label>
            <input
              id="config-auth-window"
              name="authFailureWindowMinutes"
              type="number"
              class="input input-bordered"
              bind:value={configForm.authFailureWindowMinutes}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-auth-threshold">
              <span class="label-text">{t("admin.config.authFailureFreezeThreshold")}</span>
            </label>
            <input
              id="config-auth-threshold"
              name="authFailureFreezeThreshold"
              type="number"
              class="input input-bordered"
              bind:value={configForm.authFailureFreezeThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-admin-threshold">
              <span class="label-text">{t("admin.config.adminFailureFreezeThreshold")}</span>
            </label>
            <input
              id="config-admin-threshold"
              name="adminFailureFreezeThreshold"
              type="number"
              class="input input-bordered"
              bind:value={configForm.adminFailureFreezeThreshold}
            />
          </div>
        </div>
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <button class="btn btn-primary" type="submit">
          {t("admin.config.submit")}
        </button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.bonus.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.bonus.description")}</p>
      </div>

      <form method="post" action="?/bonusRelease" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="bonus-user-id">
              <span class="label-text">{t("admin.bonus.userId")}</span>
            </label>
            <input
              id="bonus-user-id"
              name="userId"
              type="number"
              class="input input-bordered"
              bind:value={bonusReleaseForm.userId}
              required
            />
          </div>
          <div class="form-control">
            <label class="label" for="bonus-amount">
              <span class="label-text">{t("admin.bonus.amount")}</span>
            </label>
            <input
              id="bonus-amount"
              name="amount"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={bonusReleaseForm.amount}
              placeholder={t("admin.bonus.amountPlaceholder")}
            />
          </div>
        </div>
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <button
          class="btn btn-primary"
          type="submit"
          disabled={configForm.bonusAutoReleaseEnabled}
        >
          {t("admin.bonus.release")}
        </button>
        {#if configForm.bonusAutoReleaseEnabled}
          <p class="text-xs text-slate-500">{t("admin.bonus.autoReleaseHint")}</p>
        {/if}
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.create.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.create.description")}</p>
      </div>

      <form method="post" action="?/create" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="create-name">
              <span class="label-text">{t("admin.form.name")}</span>
            </label>
            <input
              id="create-name"
              name="name"
              class="input input-bordered"
              bind:value={createForm.name}
              required
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-stock">
              <span class="label-text">{t("admin.form.stock")}</span>
            </label>
            <input
              id="create-stock"
              name="stock"
              type="number"
              class="input input-bordered"
              bind:value={createForm.stock}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-weight">
              <span class="label-text">{t("admin.form.weight")}</span>
            </label>
            <input
              id="create-weight"
              name="weight"
              type="number"
              class="input input-bordered"
              bind:value={createForm.weight}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-threshold">
              <span class="label-text">{t("admin.form.poolThreshold")}</span>
            </label>
            <input
              id="create-threshold"
              name="poolThreshold"
              type="number"
              class="input input-bordered"
              bind:value={createForm.poolThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-user-threshold">
              <span class="label-text">{t("admin.form.userPoolThreshold")}</span>
            </label>
            <input
              id="create-user-threshold"
              name="userPoolThreshold"
              type="number"
              class="input input-bordered"
              bind:value={createForm.userPoolThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-reward">
              <span class="label-text">{t("admin.form.rewardAmount")}</span>
            </label>
            <input
              id="create-reward"
              name="rewardAmount"
              type="number"
              class="input input-bordered"
              bind:value={createForm.rewardAmount}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-budget">
              <span class="label-text">{t("admin.form.payoutBudget")}</span>
            </label>
            <input
              id="create-budget"
              name="payoutBudget"
              type="number"
              class="input input-bordered"
              bind:value={createForm.payoutBudget}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-period">
              <span class="label-text">{t("admin.form.payoutPeriodDays")}</span>
            </label>
            <input
              id="create-period"
              name="payoutPeriodDays"
              type="number"
              class="input input-bordered"
              bind:value={createForm.payoutPeriodDays}
            />
          </div>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="isActive"
              class="checkbox checkbox-primary"
              bind:checked={createForm.isActive}
            />
            <span class="label-text">{t("admin.form.isActive")}</span>
          </label>
        </div>
        <button class="btn btn-primary" type="submit">
          {t("admin.create.submit")}
        </button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.edit.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.edit.description")}</p>
      </div>

      {#if editForm}
        <form method="post" action="?/update" class="grid gap-4">
          <input type="hidden" name="id" value={editForm.id} />
          <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="edit-name">
              <span class="label-text">{t("admin.form.name")}</span>
            </label>
              <input
                id="edit-name"
                name="name"
                class="input input-bordered"
                bind:value={editForm.name}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-stock">
              <span class="label-text">{t("admin.form.stock")}</span>
            </label>
              <input
                id="edit-stock"
                name="stock"
                type="number"
                class="input input-bordered"
                bind:value={editForm.stock}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-weight">
              <span class="label-text">{t("admin.form.weight")}</span>
            </label>
              <input
                id="edit-weight"
                name="weight"
                type="number"
                class="input input-bordered"
                bind:value={editForm.weight}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-threshold">
              <span class="label-text">{t("admin.form.poolThreshold")}</span>
            </label>
              <input
                id="edit-threshold"
                name="poolThreshold"
                type="number"
                class="input input-bordered"
                bind:value={editForm.poolThreshold}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-user-threshold">
              <span class="label-text">{t("admin.form.userPoolThreshold")}</span>
            </label>
              <input
                id="edit-user-threshold"
                name="userPoolThreshold"
                type="number"
                class="input input-bordered"
                bind:value={editForm.userPoolThreshold}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-reward">
              <span class="label-text">{t("admin.form.rewardAmount")}</span>
            </label>
              <input
                id="edit-reward"
                name="rewardAmount"
                type="number"
                class="input input-bordered"
                bind:value={editForm.rewardAmount}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-budget">
              <span class="label-text">{t("admin.form.payoutBudget")}</span>
            </label>
              <input
                id="edit-budget"
                name="payoutBudget"
                type="number"
                class="input input-bordered"
                bind:value={editForm.payoutBudget}
              />
            </div>
          <div class="form-control">
            <label class="label" for="edit-period">
              <span class="label-text">{t("admin.form.payoutPeriodDays")}</span>
            </label>
              <input
                id="edit-period"
                name="payoutPeriodDays"
                type="number"
                class="input input-bordered"
                bind:value={editForm.payoutPeriodDays}
              />
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary" type="submit">
              {t("admin.edit.save")}
            </button>
            <button
              class="btn btn-outline"
              type="button"
              onclick={() => (editForm = null)}
            >
              {t("admin.edit.cancel")}
            </button>
          </div>
        </form>
      {:else}
        <p class="text-sm text-slate-500">{t("admin.edit.empty")}</p>
      {/if}
    </div>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="card-title">{t("admin.table.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.table.description")}</p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("admin.table.headers.name")}</th>
            <th>{t("admin.table.headers.stock")}</th>
            <th>{t("admin.table.headers.weight")}</th>
            <th>{t("admin.table.headers.threshold")}</th>
            <th>{t("admin.table.headers.userThreshold")}</th>
            <th>{t("admin.table.headers.reward")}</th>
            <th>{t("admin.table.headers.budget")}</th>
            <th>{t("admin.table.headers.period")}</th>
            <th>{t("admin.table.headers.status")}</th>
            <th class="text-right">{t("admin.table.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each prizes as prize}
            <tr>
              <td class="font-medium">{prize.name}</td>
              <td>{prize.stock}</td>
              <td>{prize.weight}</td>
              <td>{prize.poolThreshold}</td>
              <td>{prize.userPoolThreshold}</td>
              <td>{prize.rewardAmount}</td>
              <td>{prize.payoutBudget}</td>
              <td>{prize.payoutPeriodDays}</td>
              <td>
                <span class={prize.isActive ? "badge badge-primary" : "badge"}>
                  {prize.isActive
                    ? t("admin.table.statusActive")
                    : t("admin.table.statusInactive")}
                </span>
              </td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    onclick={() => startEdit(prize)}
                  >
                    {t("admin.table.actionEdit")}
                  </button>
                  <form method="post" action="?/toggle">
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-xs" type="submit">
                      {t("admin.table.actionToggle")}
                    </button>
                  </form>
                  <form method="post" action="?/delete" onsubmit={confirmDelete}>
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-error btn-xs" type="submit">
                      {t("admin.table.actionDelete")}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
          {#if prizes.length === 0}
            <tr>
              <td colspan="10" class="text-center text-slate-500">
                {t("admin.table.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>

{#if analytics?.topSpenders?.length}
  <section class="mt-8 card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">{t("admin.topSpenders.title")}</h2>
      <div class="overflow-x-auto mt-4">
        <table class="table">
          <thead>
            <tr>
              <th>{t("admin.topSpenders.userId")}</th>
              <th>{t("admin.topSpenders.spend")}</th>
            </tr>
          </thead>
          <tbody>
            {#each analytics.topSpenders as spender}
              <tr>
                <td>{spender.userId}</td>
                <td>{spender.spent}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
{/if}
