import type {
  CryptoDepositChannelRecord,
  DepositRecord,
  PaymentCapabilityOverview,
  WithdrawalRecord,
} from "@reward/shared-types/finance"

export interface PageData {
  deposits: DepositRecord[]
  withdrawals: WithdrawalRecord[]
  cryptoDepositChannels: CryptoDepositChannelRecord[]
  paymentCapabilities: PaymentCapabilityOverview | null
  error: string | null
}

type Translate = (key: string) => string

const toRecord = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export const readString = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const readBool = (value: unknown) => (typeof value === "boolean" ? value : null)

export const readStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : []

export const matchesChannelTab = (
  financeChannelTab: "fiat" | "crypto",
  channelType: string | null | undefined,
) => (channelType ?? "fiat") === financeChannelTab

export const isCrypto = (channelType: string | null | undefined) =>
  channelType === "crypto"

export const formatDate = (value?: string | Date | null) => {
  if (!value) return "-"
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
}

export const getFinanceMetadata = (value: unknown) => toRecord(value)

const getLatestReview = (value: unknown) =>
  toRecord(Reflect.get(getFinanceMetadata(value) ?? {}, "financeReviewLatest"))

const getWithdrawalControl = (value: unknown) =>
  toRecord(Reflect.get(getFinanceMetadata(value) ?? {}, "withdrawalControl"))

const getWithdrawalApprovalState = (value: unknown) =>
  readString(Reflect.get(getWithdrawalControl(value) ?? {}, "approvalState"))

export const isPendingSecondApproval = (value: unknown) =>
  getWithdrawalApprovalState(value) === "pending_second_approval"

export const getWithdrawalRiskSignals = (value: unknown) =>
  readStringArray(Reflect.get(getWithdrawalControl(value) ?? {}, "riskSignals"))

const titleCaseStatus = (value: string) =>
  value
    .split("_")
    .map((item) =>
      item.length > 0 ? item[0].toUpperCase() + item.slice(1) : item,
    )
    .join(" ")

export const getProviderConfigIssues = (value: unknown) =>
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

export const createFinancePageSupport = (t: Translate) => {
  const depositStatusLabel = (status: string) => {
    if (status === "requested") return t("finance.deposits.statusRequested")
    if (status === "provider_pending") {
      return t("finance.deposits.statusProviderPending")
    }
    if (status === "provider_succeeded") {
      return t("finance.deposits.statusProviderSucceeded")
    }
    if (status === "credited") return t("finance.deposits.statusCredited")
    if (status === "provider_failed") {
      return t("finance.deposits.statusProviderFailed")
    }
    if (status === "reversed") return t("finance.deposits.statusReversed")
    return titleCaseStatus(status)
  }

  const withdrawalStatusLabel = (status: string, metadata?: unknown) => {
    if (status === "requested") {
      return isPendingSecondApproval(metadata)
        ? t("finance.withdrawals.statusPendingSecondApproval")
        : t("finance.withdrawals.statusRequested")
    }
    if (status === "approved") return t("finance.withdrawals.statusApproved")
    if (status === "provider_submitted") {
      return t("finance.withdrawals.statusProviderSubmitted")
    }
    if (status === "provider_processing") {
      return t("finance.withdrawals.statusProviderProcessing")
    }
    if (status === "provider_failed") {
      return t("finance.withdrawals.statusProviderFailed")
    }
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

    const reason = readString(
      Reflect.get(metadata ?? {}, "manualFallbackReason"),
    )
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
    if (action === "deposit_mark_provider_pending") {
      return t("finance.deposits.actionProviderPending")
    }
    if (action === "deposit_mark_provider_succeeded") {
      return t("finance.deposits.actionProviderSucceeded")
    }
    if (action === "deposit_credit") return t("finance.deposits.actionCredit")
    if (action === "deposit_mark_provider_failed") {
      return t("finance.deposits.actionProviderFail")
    }
    if (action === "deposit_reverse") return t("finance.deposits.actionReverse")
    if (action === "withdrawal_approve") {
      return t("finance.withdrawals.actionApprove")
    }
    if (action === "withdrawal_mark_provider_submitted") {
      return t("finance.withdrawals.actionProviderSubmit")
    }
    if (action === "withdrawal_mark_provider_processing") {
      return t("finance.withdrawals.actionProviderProcessing")
    }
    if (action === "withdrawal_mark_provider_failed") {
      return t("finance.withdrawals.actionProviderFail")
    }
    if (action === "withdrawal_reject") {
      return t("finance.withdrawals.actionReject")
    }
    if (action === "withdrawal_pay") return t("finance.withdrawals.actionPay")
    if (action === "withdrawal_reverse") {
      return t("finance.withdrawals.actionReverse")
    }
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

  const providerStatusLabel = (
    value: unknown,
    type: "deposit" | "withdrawal",
  ) => {
    const status = readString(value)
    if (!status) return null

    if (type === "deposit") {
      if (status === "provider_pending") {
        return t("finance.deposits.statusProviderPending")
      }
      if (status === "provider_succeeded") {
        return t("finance.deposits.statusProviderSucceeded")
      }
      if (status === "provider_failed") {
        return t("finance.deposits.statusProviderFailed")
      }
    }

    if (type === "withdrawal") {
      if (status === "provider_submitted") {
        return t("finance.withdrawals.statusProviderSubmitted")
      }
      if (status === "provider_processing") {
        return t("finance.withdrawals.statusProviderProcessing")
      }
      if (status === "provider_failed") {
        return t("finance.withdrawals.statusProviderFailed")
      }
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
    if (value === "supportedFlows") {
      return t("finance.capabilities.fieldSupportedFlows")
    }
    if (value === "grayCountryCodes") {
      return t("finance.capabilities.fieldGrayCountryCodes")
    }
    if (value === "grayCurrencies") {
      return t("finance.capabilities.fieldGrayCurrencies")
    }
    if (value === "grayMinAmount") {
      return t("finance.capabilities.fieldGrayMinAmount")
    }
    if (value === "grayMaxAmount") {
      return t("finance.capabilities.fieldGrayMaxAmount")
    }
    if (value === "grayRules") return t("finance.capabilities.fieldGrayRules")
    if (value === "singleTransactionLimit") {
      return t("finance.capabilities.fieldSingleTransactionLimit")
    }
    if (value === "dailyLimit") return t("finance.capabilities.fieldDailyLimit")
    if (value === "currency") return t("finance.capabilities.fieldCurrency")
    if (value === "callbackWhitelist") {
      return t("finance.capabilities.fieldCallbackWhitelist")
    }
    if (value === "routeTags") return t("finance.capabilities.fieldRouteTags")
    if (value === "riskThresholds") {
      return t("finance.capabilities.fieldRiskThresholds")
    }
    if (value === "apiKey") return t("finance.capabilities.fieldApiKey")
    if (value === "privateKey") return t("finance.capabilities.fieldPrivateKey")
    if (value === "certificate") {
      return t("finance.capabilities.fieldCertificate")
    }
    if (value === "signingKey") return t("finance.capabilities.fieldSigningKey")

    return value
  }

  const secretStorageRequirementLabel = (value: unknown) => {
    if (value === "secret_manager_or_kms") {
      return t("finance.capabilities.secretStorageSecretManagerOrKms")
    }

    return readString(value) ?? "-"
  }

  return {
    depositStatusLabel,
    financeStateLabel,
    formatAdapterList,
    formatReview,
    ledgerStateLabel,
    manualFallbackReasonLabel,
    manualFallbackStatusLabel,
    paymentCapabilityGapLabel,
    paymentConfigFieldLabel,
    paymentOperatingModeLabel,
    processingModeLabel,
    providerStatusLabel,
    reviewActionLabel,
    secretStorageRequirementLabel,
    withdrawalApproveActionLabel,
    withdrawalRiskSignalLabel,
    withdrawalStatusLabel,
  }
}
