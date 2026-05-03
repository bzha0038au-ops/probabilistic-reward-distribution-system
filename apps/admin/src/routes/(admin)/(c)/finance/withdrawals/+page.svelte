<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import ConfirmDialog from "$lib/components/confirm-dialog.svelte"
  import {
    resolvePendingBreakGlassSubmission,
    upsertHiddenFormValue,
    type PendingBreakGlassSubmission,
  } from "$lib/break-glass"
  import FinanceModuleTabs from "../finance-module-tabs.svelte"
  import FinanceOperatorRail from "../finance-operator-rail.svelte"
  import FinanceWithdrawalsSection from "../finance-withdrawals-section.svelte"
  import { financeActionPolicies } from "../action-policies"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let processingChannel = $state("")
  let settlementReference = $state("")
  let confirmations = $state("")
  let operatorNote = $state("")
  let breakGlassCode = $state("")
  let breakGlassError = $state<string | null>(null)
  let pendingBreakGlass = $state<PendingBreakGlassSubmission | null>(null)
  let bypassBreakGlassSubmission: PendingBreakGlassSubmission | null = null

  const withdrawals = $derived(data.withdrawals ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const activeBreakGlassPolicy = $derived(pendingBreakGlass?.policy ?? null)
  const breakGlassStepUpHint = $derived(
    stepUpCode.trim() === "" ? t("saas.confirmDialog.stepUpHint") : null,
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
    if (!pending) return

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
    if (!pendingBreakGlass) return
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
    context="Finance · Withdrawals"
    eyebrow="FinanceOps"
    title={t("finance.withdrawals.title")}
    description="只处理 withdrawal queue、provider submit、paid、reject 和 reverse，不再跟 deposits 混排。"
  />

  <FinanceModuleTabs />

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

  <section
    class="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]"
  >
    <div class="admin-main--after-rail-xl min-w-0">
      <FinanceWithdrawalsSection
        {confirmations}
        filteredWithdrawals={withdrawals}
        {operatorNote}
        {processingChannel}
        {settlementReference}
        {stepUpCode}
        {t}
      />
    </div>

    <FinanceOperatorRail
      bind:stepUpCode
      bind:processingChannel
      bind:settlementReference
      bind:confirmations
      bind:operatorNote
      {t}
    />
  </section>
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
