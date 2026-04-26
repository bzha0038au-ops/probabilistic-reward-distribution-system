<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import type {
    CryptoDepositChannelRecord,
    DepositRecord,
    PaymentCapabilityOverview,
    WithdrawalRecord,
  } from "@reward/shared-types"

  interface PageData {
    deposits: DepositRecord[]
    withdrawals: WithdrawalRecord[]
    cryptoDepositChannels: CryptoDepositChannelRecord[]
    paymentCapabilities: PaymentCapabilityOverview | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }
  let stepUpCode = $state("")
  let processingChannel = $state("")
  let settlementReference = $state("")
  let confirmations = $state("")
  let operatorNote = $state("")
  let cryptoProviderId = $state("")
  let cryptoChain = $state("")
  let cryptoNetwork = $state("")
  let cryptoToken = $state("")
  let cryptoReceiveAddress = $state("")
  let cryptoQrCodeUrl = $state("")
  let cryptoMemoRequired = $state(false)
  let cryptoMemoValue = $state("")
  let cryptoMinConfirmations = $state("1")
  let cryptoIsActive = $state(true)
  let financeChannelTab = $state<"fiat" | "crypto">("fiat")
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
  const matchesChannelTab = (channelType: string | null | undefined) =>
    (channelType ?? "fiat") === financeChannelTab
  const filteredDeposits = $derived(
    deposits.filter((deposit) => matchesChannelTab(deposit.channelType)),
  )
  const filteredWithdrawals = $derived(
    withdrawals.filter((withdrawal) => matchesChannelTab(withdrawal.channelType)),
  )
  const isCrypto = (channelType: string | null | undefined) => channelType === "crypto"

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const toRecord = (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null

  const readString = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null

  const readBool = (value: unknown) =>
    typeof value === "boolean" ? value : null

  const readStringArray = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === "string" && item.trim() !== "",
        )
      : []

  const getFinanceMetadata = (value: unknown) => toRecord(value)

  const getLatestReview = (value: unknown) =>
    toRecord(
      Reflect.get(getFinanceMetadata(value) ?? {}, "financeReviewLatest"),
    )

  const getWithdrawalControl = (value: unknown) =>
    toRecord(Reflect.get(getFinanceMetadata(value) ?? {}, "withdrawalControl"))

  const getWithdrawalApprovalState = (value: unknown) =>
    readString(Reflect.get(getWithdrawalControl(value) ?? {}, "approvalState"))

  const isPendingSecondApproval = (value: unknown) =>
    getWithdrawalApprovalState(value) === "pending_second_approval"

  const getWithdrawalRiskSignals = (value: unknown) =>
    readStringArray(Reflect.get(getWithdrawalControl(value) ?? {}, "riskSignals"))

  const titleCaseStatus = (value: string) =>
    value
      .split("_")
      .map((item) =>
        item.length > 0 ? item[0].toUpperCase() + item.slice(1) : item,
      )
      .join(" ")

  const depositStatusLabel = (status: string) => {
    if (status === "requested") return t("finance.deposits.statusRequested")
    if (status === "provider_pending")
      return t("finance.deposits.statusProviderPending")
    if (status === "provider_succeeded")
      return t("finance.deposits.statusProviderSucceeded")
    if (status === "credited") return t("finance.deposits.statusCredited")
    if (status === "provider_failed")
      return t("finance.deposits.statusProviderFailed")
    if (status === "reversed") return t("finance.deposits.statusReversed")
    return titleCaseStatus(status)
  }

  const withdrawalStatusLabel = (status: string, metadata?: unknown) => {
    if (status === "requested")
      return isPendingSecondApproval(metadata)
        ? t("finance.withdrawals.statusPendingSecondApproval")
        : t("finance.withdrawals.statusRequested")
    if (status === "approved") return t("finance.withdrawals.statusApproved")
    if (status === "provider_submitted")
      return t("finance.withdrawals.statusProviderSubmitted")
    if (status === "provider_processing")
      return t("finance.withdrawals.statusProviderProcessing")
    if (status === "provider_failed")
      return t("finance.withdrawals.statusProviderFailed")
    if (status === "rejected") return t("finance.withdrawals.statusRejected")
    if (status === "paid") return t("finance.withdrawals.statusPaid")
    if (status === "reversed") return t("finance.withdrawals.statusReversed")
    return titleCaseStatus(status)
  }

  const processingModeLabel = (value: unknown) => {
    const metadata = getFinanceMetadata(value)
    return Reflect.get(metadata ?? {}, "processingMode") === "manual"
      ? t("finance.processing.manual")
      : t("finance.processing.provider")
  }

  const manualFallbackStatusLabel = (
    value: unknown,
    type: "deposit" | "withdrawal",
  ) => {
    const metadata = getFinanceMetadata(value)
    const fallbackRequired = readBool(
      Reflect.get(metadata ?? {}, "manualFallbackRequired"),
    )
    if (!fallbackRequired) return null

    const status = readString(
      Reflect.get(metadata ?? {}, "manualFallbackStatus"),
    )
    if (!status) {
      return t("finance.processing.manualPending")
    }

    if (type === "deposit") {
      return depositStatusLabel(status)
    }

    if (type === "withdrawal") {
      return withdrawalStatusLabel(status)
    }

    return status
  }

  const manualFallbackReasonLabel = (value: unknown) => {
    const metadata = getFinanceMetadata(value)
    if (
      readBool(Reflect.get(metadata ?? {}, "manualFallbackRequired")) !== true
    ) {
      return null
    }

    const reason = readString(Reflect.get(metadata ?? {}, "manualFallbackReason"))
    if (reason === "no_active_payment_provider") {
      return t("finance.processing.noActiveProvider")
    }
    if (reason === "manual_provider_review_required") {
      return t("finance.processing.manualReviewRequired")
    }
    if (reason === "provider_execution_not_implemented") {
      return t("finance.processing.providerNotImplemented")
    }
    if (reason === "manual_review_mode") {
      return t("finance.processing.manualReviewMode")
    }
    if (reason === "outside_automation_gray_scope") {
      return t("finance.processing.outsideGrayScope")
    }
    if (reason === "risk_manual_review_required") {
      return t("finance.processing.riskManualReviewRequired")
    }

    return reason
  }

  const withdrawalRiskSignalLabel = (value: string) => {
    if (value === "new_card_first_withdrawal") {
      return t("finance.withdrawals.riskSignalNewCardFirstWithdrawal")
    }
    if (value === "shared_ip_cluster") {
      return t("finance.withdrawals.riskSignalSharedIpCluster")
    }
    if (value === "shared_device_cluster") {
      return t("finance.withdrawals.riskSignalSharedDeviceCluster")
    }
    if (value === "shared_payout_destination_cluster") {
      return t("finance.withdrawals.riskSignalSharedPayoutDestinationCluster")
    }

    return value
  }

  const withdrawalApproveActionLabel = (metadata?: unknown) =>
    isPendingSecondApproval(metadata)
      ? t("finance.withdrawals.actionSecondApprove")
      : t("finance.withdrawals.actionApprove")

  const reviewActionLabel = (action: string | null) => {
    if (action === "deposit_mark_provider_pending")
      return t("finance.deposits.actionProviderPending")
    if (action === "deposit_mark_provider_succeeded")
      return t("finance.deposits.actionProviderSucceeded")
    if (action === "deposit_credit") return t("finance.deposits.actionCredit")
    if (action === "deposit_mark_provider_failed")
      return t("finance.deposits.actionProviderFail")
    if (action === "deposit_reverse") return t("finance.deposits.actionReverse")
    if (action === "withdrawal_approve")
      return t("finance.withdrawals.actionApprove")
    if (action === "withdrawal_mark_provider_submitted")
      return t("finance.withdrawals.actionProviderSubmit")
    if (action === "withdrawal_mark_provider_processing")
      return t("finance.withdrawals.actionProviderProcessing")
    if (action === "withdrawal_mark_provider_failed")
      return t("finance.withdrawals.actionProviderFail")
    if (action === "withdrawal_reject")
      return t("finance.withdrawals.actionReject")
    if (action === "withdrawal_pay") return t("finance.withdrawals.actionPay")
    if (action === "withdrawal_reverse")
      return t("finance.withdrawals.actionReverse")
    return null
  }

  const formatReview = (value: unknown) => {
    const latest = getLatestReview(value)
    if (!latest) return null

    return {
      action: reviewActionLabel(readString(Reflect.get(latest, "action"))),
      adminId:
        typeof Reflect.get(latest, "adminId") === "number"
          ? (Reflect.get(latest, "adminId") as number)
          : null,
      reviewStage: readString(Reflect.get(latest, "reviewStage")),
      settlementReference: readString(
        Reflect.get(latest, "settlementReference"),
      ),
      processingChannel: readString(Reflect.get(latest, "processingChannel")),
      operatorNote: readString(Reflect.get(latest, "operatorNote")),
      recordedAt: readString(Reflect.get(latest, "recordedAt")),
    }
  }

  const financeStateLabel = (
    value: unknown,
    type: "deposit" | "withdrawal",
  ) => {
    const status = readString(value)
    if (!status) return null

    if (type === "deposit") {
      return depositStatusLabel(status)
    }

    return withdrawalStatusLabel(status)
  }

  const providerStatusLabel = (value: unknown, type: "deposit" | "withdrawal") => {
    const status = readString(value)
    if (!status) return null

    if (type === "deposit") {
      if (status === "provider_pending")
        return t("finance.deposits.statusProviderPending")
      if (status === "provider_succeeded")
        return t("finance.deposits.statusProviderSucceeded")
      if (status === "provider_failed")
        return t("finance.deposits.statusProviderFailed")
    }

    if (type === "withdrawal") {
      if (status === "provider_submitted")
        return t("finance.withdrawals.statusProviderSubmitted")
      if (status === "provider_processing")
        return t("finance.withdrawals.statusProviderProcessing")
      if (status === "provider_failed")
        return t("finance.withdrawals.statusProviderFailed")
    }

    return titleCaseStatus(status)
  }

  const ledgerStateLabel = (value: unknown) => {
    const state = readString(value)
    if (state === "written") return "Ledger written"
    if (state === "held") return "Ledger held"
    if (state === "not_written") return "Ledger not written"
    return null
  }

  const paymentOperatingModeLabel = (value?: string | null) => {
    if (value === "automated") return t("finance.capabilities.modeAutomated")
    return t("finance.capabilities.modeManualReview")
  }

  const paymentCapabilityGapLabel = (value: string) => {
    if (value === "outbound_gateway_execution") {
      return t("finance.capabilities.gapOutboundGatewayExecution")
    }
    if (value === "payment_webhook_entrypoint") {
      return t("finance.capabilities.gapWebhookEntrypoint")
    }
    if (value === "payment_webhook_signature_verification") {
      return t("finance.capabilities.gapWebhookSignature")
    }
    if (value === "idempotent_retry_handling") {
      return t("finance.capabilities.gapIdempotency")
    }
    if (value === "automated_reconciliation") {
      return t("finance.capabilities.gapReconciliation")
    }
    if (value === "compensation_and_recovery") {
      return t("finance.capabilities.gapCompensation")
    }

    return value
  }

  const formatAdapterList = (value: unknown) => {
    const adapters = readStringArray(value)
    return adapters.length > 0
      ? adapters.join(", ")
      : t("finance.capabilities.none")
  }

  const paymentConfigFieldLabel = (value: string) => {
    if (value === "isActive") return t("finance.capabilities.fieldIsActive")
    if (value === "priority") return t("finance.capabilities.fieldPriority")
    if (value === "supportedFlows")
      return t("finance.capabilities.fieldSupportedFlows")
    if (value === "grayCountryCodes")
      return t("finance.capabilities.fieldGrayCountryCodes")
    if (value === "grayCurrencies")
      return t("finance.capabilities.fieldGrayCurrencies")
    if (value === "grayMinAmount")
      return t("finance.capabilities.fieldGrayMinAmount")
    if (value === "grayMaxAmount")
      return t("finance.capabilities.fieldGrayMaxAmount")
    if (value === "grayRules") return t("finance.capabilities.fieldGrayRules")
    if (value === "singleTransactionLimit")
      return t("finance.capabilities.fieldSingleTransactionLimit")
    if (value === "dailyLimit") return t("finance.capabilities.fieldDailyLimit")
    if (value === "currency") return t("finance.capabilities.fieldCurrency")
    if (value === "callbackWhitelist")
      return t("finance.capabilities.fieldCallbackWhitelist")
    if (value === "routeTags") return t("finance.capabilities.fieldRouteTags")
    if (value === "riskThresholds")
      return t("finance.capabilities.fieldRiskThresholds")
    if (value === "apiKey") return t("finance.capabilities.fieldApiKey")
    if (value === "privateKey") return t("finance.capabilities.fieldPrivateKey")
    if (value === "certificate")
      return t("finance.capabilities.fieldCertificate")
    if (value === "signingKey") return t("finance.capabilities.fieldSigningKey")

    return value
  }

  const secretStorageRequirementLabel = (value: unknown) => {
    if (value === "secret_manager_or_kms") {
      return t("finance.capabilities.secretStorageSecretManagerOrKms")
    }

    return readString(value) ?? "-"
  }

  const getProviderConfigIssues = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (
            item,
          ): item is {
            providerId: number
            providerName: string
            issues?: Array<{ code?: string; path?: string; message?: string }>
          } =>
            typeof item === "object" &&
            item !== null &&
            typeof Reflect.get(item, "providerId") === "number" &&
            typeof Reflect.get(item, "providerName") === "string",
        )
      : []
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

{#if paymentCapabilities}
  <section class="mt-6 card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">{t("finance.capabilities.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.capabilities.description")}
        </p>
      </div>
      <div
        class={`alert text-sm ${paymentCapabilities.automatedExecutionEnabled ? "alert-error" : "alert-warning"}`}
      >
        <span>
          {paymentCapabilities.automatedExecutionEnabled
            ? t("finance.capabilities.automatedRequested")
            : t("finance.capabilities.manualOnly")}
        </span>
      </div>
      <div class="grid gap-4 text-sm md:grid-cols-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.mode")}
          </p>
          <p class="mt-1 font-medium">
            {paymentOperatingModeLabel(paymentCapabilities.operatingMode)}
          </p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.activeProviders")}
          </p>
          <p class="mt-1 font-medium">{paymentCapabilities.activeProviderCount}</p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.configuredAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {formatAdapterList(paymentCapabilities.configuredProviderAdapters)}
          </p>
        </div>
        <div class="md:col-span-3">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.registeredAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {formatAdapterList(paymentCapabilities.registeredAdapterKeys)}
          </p>
        </div>
        <div class="md:col-span-3">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.implementedAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {formatAdapterList(paymentCapabilities.implementedAutomatedAdapters)}
          </p>
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {t("finance.capabilities.missingCapabilities")}
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {#each readStringArray(paymentCapabilities.missingCapabilities) as gap}
            <li>{paymentCapabilityGapLabel(gap)}</li>
          {/each}
        </ul>
      </div>
      <div class="border-t border-slate-200 pt-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("finance.capabilities.governanceTitle")}
          </p>
          <p class="mt-1 text-sm text-slate-500">
            {t("finance.capabilities.governanceDescription")}
          </p>
        </div>
        <div class="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {t("finance.capabilities.editableFields")}
            </p>
            <p class="mt-1 font-medium">
              {formatAdapterList(
                readStringArray(
                  paymentCapabilities.providerConfigGovernance?.adminEditableFields,
                ).map(paymentConfigFieldLabel),
              )}
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {t("finance.capabilities.secretReferenceFields")}
            </p>
            <p class="mt-1 font-medium">
              {formatAdapterList(
                readStringArray(
                  paymentCapabilities.providerConfigGovernance?.secretReferenceFields,
                ).map(paymentConfigFieldLabel),
              )}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {t("finance.capabilities.secretReferenceContainer")}:
              {" "}
              {paymentCapabilities.providerConfigGovernance
                ?.secretReferenceContainer ?? "-"}
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {t("finance.capabilities.secretStorage")}
            </p>
            <p class="mt-1 font-medium">
              {secretStorageRequirementLabel(
                paymentCapabilities.providerConfigGovernance
                  ?.secretStorageRequirement,
              )}
            </p>
          </div>
        </div>
        {#if getProviderConfigIssues(paymentCapabilities.providerConfigIssues).length > 0}
          <div class="alert alert-error mt-4 text-sm">
            <div class="space-y-2">
              <div>{t("finance.capabilities.configIssueDetected")}</div>
              <ul class="list-disc space-y-1 pl-5">
                {#each getProviderConfigIssues(paymentCapabilities.providerConfigIssues) as issue}
                  <li>
                    <span class="font-medium">{issue.providerName}</span>
                    {#each issue.issues ?? [] as detail}
                      <span>
                        : {detail.path ?? "-"}{#if detail.message}
                          {" - "}{detail.message}
                        {/if}
                      </span>
                    {/each}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {:else}
          <div class="alert alert-success mt-4 text-sm">
            <span>{t("finance.capabilities.noConfigIssues")}</span>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<section class="mt-6 card bg-base-100 shadow">
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
        <span class="label-text mb-2"
          >{t("finance.stepUp.processingChannel")}</span
        >
        <input
          name="processingChannel"
          type="text"
          class="input input-bordered"
          bind:value={processingChannel}
          placeholder={t("finance.stepUp.processingChannelPlaceholder")}
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-2"
          >{t("finance.stepUp.settlementReference")}</span
        >
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

<section class="mt-6 card bg-base-100 shadow">
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
  <section class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div>
          <h2 class="card-title">{t("finance.cryptoChannels.title")}</h2>
          <p class="text-sm text-slate-500">
            {t("finance.cryptoChannels.description")}
          </p>
        </div>

        <div class="overflow-x-auto mt-4">
          <table class="table">
            <thead>
              <tr>
                <th>{t("finance.cryptoChannels.headers.id")}</th>
                <th>{t("finance.cryptoChannels.headers.providerId")}</th>
                <th>{t("finance.cryptoChannels.headers.asset")}</th>
                <th>{t("finance.cryptoChannels.headers.receiveAddress")}</th>
                <th>{t("finance.cryptoChannels.headers.memo")}</th>
                <th>{t("finance.cryptoChannels.headers.confirmations")}</th>
                <th>{t("finance.cryptoChannels.headers.status")}</th>
                <th>{t("finance.cryptoChannels.headers.updatedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {#each cryptoDepositChannels as channel}
                <tr>
                  <td>{channel.id}</td>
                  <td>{channel.providerId ?? "-"}</td>
                  <td>
                    <div class="space-y-1 text-xs">
                      <div class="font-medium">{channel.token}</div>
                      <div class="text-slate-500">
                        {channel.chain} · {channel.network}
                      </div>
                    </div>
                  </td>
                  <td class="max-w-sm">
                    <div class="space-y-1 text-xs">
                      <div class="break-all">{channel.receiveAddress}</div>
                      {#if channel.qrCodeUrl}
                        <a
                          class="link link-primary"
                          href={channel.qrCodeUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          QR
                        </a>
                      {/if}
                    </div>
                  </td>
                  <td>
                    <div class="space-y-1 text-xs">
                      <div>
                        {channel.memoRequired
                          ? channel.memoValue ??
                            t("finance.cryptoChannels.memoRequiredOnly")
                          : channel.memoValue ?? "-"}
                      </div>
                    </div>
                  </td>
                  <td>{channel.minConfirmations}</td>
                  <td>
                    {channel.isActive
                      ? t("finance.cryptoChannels.statusActive")
                      : t("finance.cryptoChannels.statusInactive")}
                  </td>
                  <td>{formatDate(channel.updatedAt ?? channel.createdAt)}</td>
                </tr>
              {/each}
              {#if cryptoDepositChannels.length === 0}
                <tr>
                  <td colspan="8" class="text-center text-slate-500">
                    {t("finance.cryptoChannels.empty")}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body gap-4">
        <div>
          <h2 class="card-title">{t("finance.cryptoChannels.createTitle")}</h2>
          <p class="text-sm text-slate-500">
            {t("finance.cryptoChannels.createDescription")}
          </p>
        </div>

        <form method="post" action="?/createCryptoDepositChannel" class="space-y-4">
          <div class="grid gap-4">
            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.providerId")}
              </span>
              <input
                name="providerId"
                type="number"
                min="1"
                class="input input-bordered"
                bind:value={cryptoProviderId}
                placeholder={t("finance.cryptoChannels.providerIdPlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.chain")}
              </span>
              <input
                name="chain"
                type="text"
                class="input input-bordered"
                bind:value={cryptoChain}
                placeholder={t("finance.cryptoChannels.chainPlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.network")}
              </span>
              <input
                name="network"
                type="text"
                class="input input-bordered"
                bind:value={cryptoNetwork}
                placeholder={t("finance.cryptoChannels.networkPlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.token")}
              </span>
              <input
                name="token"
                type="text"
                class="input input-bordered"
                bind:value={cryptoToken}
                placeholder={t("finance.cryptoChannels.tokenPlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.receiveAddress")}
              </span>
              <textarea
                name="receiveAddress"
                class="textarea textarea-bordered min-h-24"
                bind:value={cryptoReceiveAddress}
                placeholder={t("finance.cryptoChannels.receiveAddressPlaceholder")}
              ></textarea>
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.qrCodeUrl")}
              </span>
              <input
                name="qrCodeUrl"
                type="url"
                class="input input-bordered"
                bind:value={cryptoQrCodeUrl}
                placeholder={t("finance.cryptoChannels.qrCodeUrlPlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.memoValue")}
              </span>
              <input
                name="memoValue"
                type="text"
                class="input input-bordered"
                bind:value={cryptoMemoValue}
                placeholder={t("finance.cryptoChannels.memoValuePlaceholder")}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">
                {t("finance.cryptoChannels.minConfirmations")}
              </span>
              <input
                name="minConfirmations"
                type="number"
                min="0"
                class="input input-bordered"
                bind:value={cryptoMinConfirmations}
              />
            </label>

            <label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-4 py-3">
              <input
                name="memoRequired"
                type="checkbox"
                class="checkbox"
                bind:checked={cryptoMemoRequired}
              />
              <span class="label-text">{t("finance.cryptoChannels.memoRequired")}</span>
            </label>

            <label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-4 py-3">
              <input
                name="isActive"
                type="checkbox"
                class="checkbox"
                bind:checked={cryptoIsActive}
              />
              <span class="label-text">{t("finance.cryptoChannels.isActive")}</span>
            </label>
          </div>

          <button class="btn btn-primary w-full" type="submit">
            {t("finance.cryptoChannels.submit")}
          </button>
        </form>
      </div>
    </div>
  </section>
{/if}

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("finance.deposits.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.deposits.description")}
        </p>
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
            <th>{t("finance.deposits.headers.processing")}</th>
            <th>{t("finance.deposits.headers.review")}</th>
            <th>{t("finance.deposits.headers.createdAt")}</th>
            <th class="text-right">{t("finance.deposits.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredDeposits as deposit}
            <tr>
              <td>{deposit.id}</td>
              <td>{deposit.userId}</td>
              <td>{deposit.amount}</td>
              <td>{depositStatusLabel(deposit.status)}</td>
              <td>
                <div class="space-y-1 text-xs">
                  <div>{processingModeLabel(deposit.metadata)}</div>
                  {#if financeStateLabel(Reflect.get(deposit.metadata ?? {}, "userVisibleStatus"), "deposit")}
                    <div class="text-slate-500">
                      User: {financeStateLabel(Reflect.get(deposit.metadata ?? {}, "userVisibleStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if providerStatusLabel(Reflect.get(deposit.metadata ?? {}, "providerStatus"), "deposit")}
                    <div class="text-slate-500">
                      Channel: {providerStatusLabel(Reflect.get(deposit.metadata ?? {}, "providerStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if financeStateLabel(Reflect.get(deposit.metadata ?? {}, "settlementStatus"), "deposit")}
                    <div class="text-slate-500">
                      Settlement: {financeStateLabel(Reflect.get(deposit.metadata ?? {}, "settlementStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if ledgerStateLabel(Reflect.get(deposit.metadata ?? {}, "ledgerState"))}
                    <div class="text-slate-500">
                      {ledgerStateLabel(Reflect.get(deposit.metadata ?? {}, "ledgerState"))}
                    </div>
                  {/if}
                  {#if readString(Reflect.get(deposit.metadata ?? {}, "failureReason"))}
                    <div class="text-slate-500">
                      Failure: {readString(Reflect.get(deposit.metadata ?? {}, "failureReason"))}
                    </div>
                  {/if}
                  {#if manualFallbackStatusLabel(deposit.metadata, "deposit")}
                    <div class="text-slate-500">
                      {manualFallbackStatusLabel(deposit.metadata, "deposit")}
                    </div>
                  {/if}
                  {#if manualFallbackReasonLabel(deposit.metadata)}
                    <div class="text-slate-500">
                      {manualFallbackReasonLabel(deposit.metadata)}
                    </div>
                  {/if}
                  {#if isCrypto(deposit.channelType)}
                    <div class="text-slate-500">
                      {deposit.assetCode ?? "-"} · {deposit.network ?? "-"}
                    </div>
                    {#if deposit.submittedTxHash}
                      <div class="text-slate-500 break-all">
                        Tx: {deposit.submittedTxHash}
                      </div>
                    {/if}
                  {/if}
                </div>
              </td>
              <td>
                {#if formatReview(deposit.metadata)}
                  <div class="space-y-1 text-xs">
                    <div>{formatReview(deposit.metadata)?.action ?? "-"}</div>
                    {#if formatReview(deposit.metadata)?.adminId}
                      <div class="text-slate-500">
                        Admin #{formatReview(deposit.metadata)?.adminId}
                      </div>
                    {/if}
                    {#if formatReview(deposit.metadata)?.reviewStage}
                      <div class="text-slate-500">
                        {formatReview(deposit.metadata)?.reviewStage}
                      </div>
                    {/if}
                    {#if formatReview(deposit.metadata)?.processingChannel}
                      <div class="text-slate-500">
                        {formatReview(deposit.metadata)?.processingChannel}
                      </div>
                    {/if}
                    {#if formatReview(deposit.metadata)?.settlementReference}
                      <div class="text-slate-500">
                        {formatReview(deposit.metadata)?.settlementReference}
                      </div>
                    {/if}
                    {#if formatReview(deposit.metadata)?.operatorNote}
                      <div class="text-slate-500">
                        {formatReview(deposit.metadata)?.operatorNote}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
              <td>{formatDate(deposit.createdAt)}</td>
              <td class="text-right">
                {#if isCrypto(deposit.channelType)}
                  <div class="flex justify-end gap-2">
                    {#if deposit.status !== "credited" && deposit.status !== "reversed"}
                      <form method="post" action="?/confirmCryptoDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionCryptoConfirm")}
                        </button>
                      </form>
                      <form method="post" action="?/rejectCryptoDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionCryptoReject")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "credited"}
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                  </div>
                {:else if deposit.status === "requested" || deposit.status === "provider_pending" || deposit.status === "provider_succeeded" || deposit.status === "credited"}
                  <div class="flex justify-end gap-2">
                    {#if deposit.status === "requested"}
                      <form method="post" action="?/markDepositProviderPending">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionProviderPending")}
                        </button>
                      </form>
                      <form method="post" action="?/markDepositProviderFailed">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "provider_pending"}
                      <form method="post" action="?/markDepositProviderSucceeded">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionProviderSucceeded")}
                        </button>
                      </form>
                      <form method="post" action="?/markDepositProviderFailed">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "provider_succeeded"}
                      <form method="post" action="?/creditDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionCredit")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "credited"}
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
          {#if filteredDeposits.length === 0}
            <tr>
              <td colspan="8" class="text-center text-slate-500">
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
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("finance.withdrawals.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.withdrawals.description")}
        </p>
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
            <th>{t("finance.withdrawals.headers.processing")}</th>
            <th>{t("finance.withdrawals.headers.review")}</th>
            <th>{t("finance.withdrawals.headers.createdAt")}</th>
            <th class="text-right"
              >{t("finance.withdrawals.headers.actions")}</th
            >
          </tr>
        </thead>
        <tbody>
          {#each filteredWithdrawals as withdrawal}
            <tr>
              <td>{withdrawal.id}</td>
              <td>{withdrawal.userId}</td>
              <td>{withdrawal.amount}</td>
              <td>
                <div class="space-y-1">
                  <div>
                    {withdrawalStatusLabel(withdrawal.status, withdrawal.metadata)}
                  </div>
                  {#if isPendingSecondApproval(withdrawal.metadata)}
                    <div class="text-xs text-amber-700">
                      {t("finance.withdrawals.actionSecondApprove")}
                    </div>
                  {/if}
                </div>
              </td>
              <td>{withdrawal.payoutMethodId ?? withdrawal.bankCardId ?? "-"}</td>
              <td>
                <div class="space-y-1 text-xs">
                  <div>{processingModeLabel(withdrawal.metadata)}</div>
                  {#if financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "userVisibleStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      User: {financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "userVisibleStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if providerStatusLabel(Reflect.get(withdrawal.metadata ?? {}, "providerStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      Channel: {providerStatusLabel(Reflect.get(withdrawal.metadata ?? {}, "providerStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "settlementStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      Settlement: {financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "settlementStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if ledgerStateLabel(Reflect.get(withdrawal.metadata ?? {}, "ledgerState"))}
                    <div class="text-slate-500">
                      {ledgerStateLabel(Reflect.get(withdrawal.metadata ?? {}, "ledgerState"))}
                    </div>
                  {/if}
                  {#if readString(Reflect.get(withdrawal.metadata ?? {}, "failureReason"))}
                    <div class="text-slate-500">
                      Failure: {readString(Reflect.get(withdrawal.metadata ?? {}, "failureReason"))}
                    </div>
                  {/if}
                  {#if manualFallbackStatusLabel(withdrawal.metadata, "withdrawal")}
                    <div class="text-slate-500">
                      {manualFallbackStatusLabel(
                        withdrawal.metadata,
                        "withdrawal",
                      )}
                    </div>
                  {/if}
                  {#if manualFallbackReasonLabel(withdrawal.metadata)}
                    <div class="text-slate-500">
                      {manualFallbackReasonLabel(withdrawal.metadata)}
                    </div>
                  {/if}
                  {#if isCrypto(withdrawal.channelType)}
                    <div class="text-slate-500">
                      {withdrawal.assetCode ?? "-"} · {withdrawal.network ?? "-"}
                    </div>
                    {#if withdrawal.submittedTxHash}
                      <div class="text-slate-500 break-all">
                        Tx: {withdrawal.submittedTxHash}
                      </div>
                    {/if}
                  {/if}
                  {#if getWithdrawalRiskSignals(withdrawal.metadata).length > 0}
                    <div class="pt-1 text-slate-500">
                      {t("finance.withdrawals.riskSignals")}
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each getWithdrawalRiskSignals(withdrawal.metadata) as signal}
                        <span class="badge badge-warning badge-outline badge-xs">
                          {withdrawalRiskSignalLabel(signal)}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </td>
              <td>
                {#if formatReview(withdrawal.metadata)}
                  <div class="space-y-1 text-xs">
                    <div>
                      {formatReview(withdrawal.metadata)?.action ?? "-"}
                    </div>
                    {#if formatReview(withdrawal.metadata)?.adminId}
                      <div class="text-slate-500">
                        Admin #{formatReview(withdrawal.metadata)?.adminId}
                      </div>
                    {/if}
                    {#if formatReview(withdrawal.metadata)?.reviewStage}
                      <div class="text-slate-500">
                        {formatReview(withdrawal.metadata)?.reviewStage}
                      </div>
                    {/if}
                    {#if formatReview(withdrawal.metadata)?.processingChannel}
                      <div class="text-slate-500">
                        {formatReview(withdrawal.metadata)?.processingChannel}
                      </div>
                    {/if}
                    {#if formatReview(withdrawal.metadata)?.settlementReference}
                      <div class="text-slate-500">
                        {formatReview(withdrawal.metadata)?.settlementReference}
                      </div>
                    {/if}
                    {#if formatReview(withdrawal.metadata)?.operatorNote}
                      <div class="text-slate-500">
                        {formatReview(withdrawal.metadata)?.operatorNote}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
              <td>{formatDate(withdrawal.createdAt)}</td>
              <td class="text-right">
                {#if withdrawal.status === "requested" || withdrawal.status === "approved" || withdrawal.status === "provider_submitted" || withdrawal.status === "provider_processing" || withdrawal.status === "provider_failed" || withdrawal.status === "paid"}
                  <div class="flex justify-end gap-2">
                    {#if withdrawal.status === "requested"}
                      <form method="post" action="?/approveWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input
                          type="hidden"
                          name="totpCode"
                          value={stepUpCode}
                        />
                        <input
                          type="hidden"
                          name="processingChannel"
                          value={processingChannel}
                        />
                        <input
                          type="hidden"
                          name="settlementReference"
                          value={settlementReference}
                        />
                        <input
                          type="hidden"
                          name="operatorNote"
                          value={operatorNote}
                        />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {withdrawalApproveActionLabel(withdrawal.metadata)}
                        </button>
                      </form>
                      <form method="post" action="?/rejectWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input
                          type="hidden"
                          name="totpCode"
                          value={stepUpCode}
                        />
                        <input
                          type="hidden"
                          name="processingChannel"
                          value={processingChannel}
                        />
                        <input
                          type="hidden"
                          name="settlementReference"
                          value={settlementReference}
                        />
                        <input
                          type="hidden"
                          name="operatorNote"
                          value={operatorNote}
                        />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReject")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "approved"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/submitCryptoWithdrawal"
                            : "?/markWithdrawalProviderSubmitted"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoSubmit")
                            : t("finance.withdrawals.actionProviderSubmit")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_failed"}
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_submitted"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/confirmCryptoWithdrawal"
                            : "?/markWithdrawalProviderProcessing"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoConfirm")
                            : t("finance.withdrawals.actionProviderProcessing")}
                        </button>
                      </form>
                      <form method="post" action="?/markWithdrawalProviderFailed">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_processing"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/confirmCryptoWithdrawal"
                            : "?/payWithdrawal"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoConfirm")
                            : t("finance.withdrawals.actionPay")}
                        </button>
                      </form>
                      <form method="post" action="?/markWithdrawalProviderFailed">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "paid"}
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
          {#if filteredWithdrawals.length === 0}
            <tr>
              <td colspan="9" class="text-center text-slate-500">
                {t("finance.withdrawals.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
