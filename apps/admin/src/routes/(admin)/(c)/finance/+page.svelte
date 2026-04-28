<script lang="ts">
  import { page } from "$app/stores"
  import ConfirmDialog from "$lib/components/confirm-dialog.svelte"
  import {
    resolvePendingBreakGlassSubmission,
    upsertHiddenFormValue,
    type PendingBreakGlassSubmission,
  } from "$lib/break-glass"
  import { getContext } from "svelte"
  import FinanceCapabilitiesSection from "./finance-capabilities-section.svelte"
  import FinanceCryptoChannelsSection from "./finance-crypto-channels-section.svelte"
  import FinanceDepositsSection from "./finance-deposits-section.svelte"
  import FinanceWithdrawalsSection from "./finance-withdrawals-section.svelte"
  import { financeActionPolicies } from "./action-policies"
  import {
    matchesChannelTab,
    type PageData,
  } from "./page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let processingChannel = $state("")
  let settlementReference = $state("")
  let confirmations = $state("")
  let operatorNote = $state("")
  let financeChannelTab = $state<"fiat" | "crypto">("fiat")
  let breakGlassCode = $state("")
  let breakGlassError = $state<string | null>(null)
  let pendingBreakGlass = $state<PendingBreakGlassSubmission | null>(null)
  let bypassBreakGlassSubmission: PendingBreakGlassSubmission | null = null

  $effect(() => {
    const submittedTab = $page.form?.financeChannelTab
    if (submittedTab === "fiat" || submittedTab === "crypto") {
      financeChannelTab = submittedTab
    }
  })

  const deposits = $derived(data.deposits ?? [])
  const withdrawals = $derived(data.withdrawals ?? [])
  const cryptoDepositChannels = $derived(data.cryptoDepositChannels ?? [])
  const paymentCapabilities = $derived(data.paymentCapabilities)
  const actionError = $derived($page.form?.error as string | undefined)
  const filteredDeposits = $derived(
    deposits.filter((deposit) =>
      matchesChannelTab(financeChannelTab, deposit.channelType),
    ),
  )
  const filteredWithdrawals = $derived(
    withdrawals.filter((withdrawal) =>
      matchesChannelTab(financeChannelTab, withdrawal.channelType),
    ),
  )
  const activeBreakGlassPolicy = $derived(pendingBreakGlass?.policy ?? null)
  const breakGlassStepUpHint = $derived(
    stepUpCode.trim() === ""
      ? t("saas.confirmDialog.stepUpHint")
      : null,
  )

  const closeBreakGlassDialog = () => {
    pendingBreakGlass = null
    breakGlassCode = ""
    breakGlassError = null
  }

  const handleBreakGlassSubmit = (event: SubmitEvent) => {
    const pending = resolvePendingBreakGlassSubmission(
      event,
      financeActionPolicies,
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

    upsertHiddenFormValue(
      pendingBreakGlass.form,
      "totpCode",
      stepUpCode.trim(),
    )
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
  <header class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {t("finance.title")}
    </p>
    <h1 class="text-3xl font-semibold">{t("finance.title")}</h1>
    <p class="text-sm text-slate-600">{t("finance.description")}</p>
  </header>

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

  <FinanceCapabilitiesSection {paymentCapabilities} {t} />

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3">
      <div>
        <h2 class="card-title">{t("finance.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("finance.stepUp.description")}</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-2">{t("common.totpCode")}</span>
          <input
            name="totpCode"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            class="input input-bordered"
            bind:value={stepUpCode}
            placeholder={t("finance.stepUp.placeholder")}
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">
            {t("finance.stepUp.processingChannel")}
          </span>
          <input
            name="processingChannel"
            type="text"
            class="input input-bordered"
            bind:value={processingChannel}
            placeholder={t("finance.stepUp.processingChannelPlaceholder")}
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">
            {t("finance.stepUp.settlementReference")}
          </span>
          <input
            name="settlementReference"
            type="text"
            class="input input-bordered"
            bind:value={settlementReference}
            placeholder={t("finance.stepUp.settlementReferencePlaceholder")}
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("finance.stepUp.confirmations")}</span>
          <input
            name="confirmations"
            type="number"
            min="0"
            class="input input-bordered"
            bind:value={confirmations}
            placeholder={t("finance.stepUp.confirmationsPlaceholder")}
          />
        </label>
        <label class="form-control md:col-span-2">
          <span class="label-text mb-2">{t("finance.stepUp.operatorNote")}</span>
          <textarea
            name="operatorNote"
            class="textarea textarea-bordered min-h-24"
            bind:value={operatorNote}
            placeholder={t("finance.stepUp.operatorNotePlaceholder")}
          ></textarea>
        </label>
      </div>
    </div>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <div class="tabs tabs-boxed w-fit">
        <button
          type="button"
          class="tab"
          class:tab-active={financeChannelTab === "fiat"}
          onclick={() => {
            financeChannelTab = "fiat"
          }}
        >
          {t("finance.channels.fiat")}
        </button>
        <button
          type="button"
          class="tab"
          class:tab-active={financeChannelTab === "crypto"}
          onclick={() => {
            financeChannelTab = "crypto"
          }}
        >
          {t("finance.channels.crypto")}
        </button>
      </div>
    </div>
  </section>

  {#if financeChannelTab === "crypto"}
    <FinanceCryptoChannelsSection {cryptoDepositChannels} {t} />
  {/if}

  <FinanceDepositsSection
    {confirmations}
    {filteredDeposits}
    {operatorNote}
    {processingChannel}
    {settlementReference}
    {stepUpCode}
    {t}
  />

  <FinanceWithdrawalsSection
    {confirmations}
    {filteredWithdrawals}
    {operatorNote}
    {processingChannel}
    {settlementReference}
    {stepUpCode}
    {t}
  />
</div>

<ConfirmDialog
  open={activeBreakGlassPolicy !== null}
  title={activeBreakGlassPolicy?.title ?? t("saas.confirmDialog.title")}
  description={
    activeBreakGlassPolicy?.description ??
    t("saas.confirmDialog.description")
  }
  bind:breakGlassCode
  breakGlassLabel={t("login.breakGlassCode")}
  breakGlassPlaceholder={t("login.breakGlassPlaceholder")}
  confirmLabel={activeBreakGlassPolicy?.confirmLabel ?? t("saas.confirmDialog.confirm")}
  cancelLabel={t("saas.confirmDialog.cancel")}
  error={breakGlassError}
  stepUpHint={breakGlassStepUpHint}
  on:cancel={closeBreakGlassDialog}
  on:confirm={confirmBreakGlassDialog}
/>
