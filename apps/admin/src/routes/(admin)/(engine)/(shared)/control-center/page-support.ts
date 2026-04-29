export interface Prize {
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

export interface AnalyticsSummary {
  totalDrawCount: number
  wonCount: number
  missCount: number
  winRate: number
  systemPoolBalance: string
  topSpenders: { userId: number; spent: number }[]
}

export interface SystemConfig {
  poolBalance: string
  drawCost: string
  maintenanceMode: boolean
  registrationEnabled: boolean
  loginEnabled: boolean
  drawEnabled: boolean
  paymentDepositEnabled: boolean
  paymentWithdrawEnabled: boolean
  antiAbuseAutoFreezeEnabled: boolean
  withdrawRiskNewCardFirstWithdrawalReviewEnabled: boolean
  weightJitterEnabled: boolean
  weightJitterPct: string
  bonusAutoReleaseEnabled: boolean
  bonusUnlockWagerRatio: string
  authFailureWindowMinutes: string
  authFailureFreezeThreshold: string
  adminFailureFreezeThreshold: string
  blackjackMinStake: string
  blackjackMaxStake: string
  blackjackWinPayoutMultiplier: string
  blackjackPushPayoutMultiplier: string
  blackjackNaturalPayoutMultiplier: string
  blackjackDealerHitsSoft17: boolean
  blackjackDoubleDownAllowed: boolean
  blackjackSplitAcesAllowed: boolean
  blackjackHitSplitAcesAllowed: boolean
  blackjackResplitAllowed: boolean
  blackjackMaxSplitHands: number
  blackjackSplitTenValueCardsAllowed: boolean
}

export interface PaymentProviderRecord {
  id: number
  name: string
  providerType: string
  priority: number
  isActive: boolean
  isCircuitBroken: boolean
  circuitBrokenAt: string | null
  circuitBreakReason: string | null
  supportedFlows: Array<"deposit" | "withdrawal">
  executionMode: "manual" | "automated"
  adapter: string | null
  configViolations: { code: string; path: string; message: string }[]
}

export interface ChangeRequestRecord {
  id: number
  changeType:
    | "system_config_update"
    | "payment_provider_upsert"
    | "legal_document_publish"
    | "saas_tenant_risk_envelope_upsert"
  status: "draft" | "pending_approval" | "approved" | "published" | "rejected"
  targetType: string
  targetId: number | null
  reason: string | null
  requiresSecondConfirmation: boolean
  requiresMfa: boolean
  createdByAdminId: number
  submittedByAdminId: number | null
  approvedByAdminId: number | null
  publishedByAdminId: number | null
  rejectedByAdminId: number | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  rejectedAt: string | null
  summary: string
  changePayload: Record<string, unknown>
  confirmationPhrases: {
    submit: string | null
    publish: string | null
  }
}

export interface LegalDocumentRecord {
  id: number
  slug: string
  version: string
  html: string
  effectiveAt: string
  createdAt: string
  isCurrent: boolean
}

export interface CurrentAdmin {
  adminId: number
  userId: number
  email: string
  mfaEnabled: boolean
  mfaRecoveryMode: "none" | "recovery_code" | "break_glass"
}

export interface MfaEnrollment {
  secret: string
  otpauthUrl: string
  enrollmentToken: string
}

export interface MfaStatus {
  mfaEnabled: boolean
  recoveryCodesRemaining: number
  recoveryCodesGeneratedAt: string | null
  breakGlassConfigured: boolean
}

export interface ReconciliationAlertsSummary {
  openCount: number
  acknowledgedCount: number
  requireEngineeringCount: number
  resolvedCount: number
  unresolvedCount: number
  overdueCount: number
  slaHours: number
  zeroDriftStreakDays: number
  oldestOpenAt?: string | Date | null
}

export interface PageData {
  admin?: CurrentAdmin | null
  prizes: Prize[]
  legalDocuments: LegalDocumentRecord[]
  analytics: AnalyticsSummary | null
  config: SystemConfig | null
  providers: PaymentProviderRecord[]
  changeRequests: ChangeRequestRecord[]
  mfaStatus: MfaStatus | null
  reconciliationAlertsSummary?: ReconciliationAlertsSummary | null
  error: string | null
}

export type PrizeForm = {
  name: string
  stock: string
  weight: string
  poolThreshold: string
  userPoolThreshold: string
  rewardAmount: string
  payoutBudget: string
  payoutPeriodDays: string
  isActive: boolean
}

export type PrizeEditForm = PrizeForm & { id: number }

export function createPrizeForm(): PrizeForm {
  return {
    name: "",
    stock: "0",
    weight: "1",
    poolThreshold: "0",
    userPoolThreshold: "0",
    rewardAmount: "0",
    payoutBudget: "0",
    payoutPeriodDays: "1",
    isActive: true,
  }
}

export function buildEditPrizeForm(prize: Prize): PrizeEditForm {
  return {
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

export function createConfigForm() {
  return {
    poolBalance: "0",
    drawCost: "0",
    maintenanceMode: false,
    registrationEnabled: true,
    loginEnabled: true,
    drawEnabled: true,
    paymentDepositEnabled: true,
    paymentWithdrawEnabled: true,
    antiAbuseAutoFreezeEnabled: true,
    withdrawRiskNewCardFirstWithdrawalReviewEnabled: true,
    weightJitterEnabled: false,
    weightJitterPct: "0.05",
    bonusAutoReleaseEnabled: false,
    bonusUnlockWagerRatio: "1",
    authFailureWindowMinutes: "15",
    authFailureFreezeThreshold: "8",
    adminFailureFreezeThreshold: "5",
    blackjackMinStake: "1",
    blackjackMaxStake: "100",
    blackjackWinPayoutMultiplier: "2",
    blackjackPushPayoutMultiplier: "1",
    blackjackNaturalPayoutMultiplier: "2.5",
    blackjackDealerHitsSoft17: false,
    blackjackDoubleDownAllowed: true,
    blackjackSplitAcesAllowed: true,
    blackjackHitSplitAcesAllowed: true,
    blackjackResplitAllowed: false,
    blackjackMaxSplitHands: "4",
    blackjackSplitTenValueCardsAllowed: false,
  }
}

export function createProviderForm() {
  return {
    providerId: "",
    name: "",
    providerType: "manual",
    priority: "100",
    isActive: true,
    supportedFlows: ["deposit"] as Array<"deposit" | "withdrawal">,
    executionMode: "manual" as "manual" | "automated",
    adapter: "",
    reason: "",
  }
}

export function createBonusReleaseForm() {
  return {
    userId: "",
    amount: "",
  }
}

export const requestStatusLabel = (status: ChangeRequestRecord["status"]) => {
  if (status === "pending_approval") return "待审批"
  if (status === "approved") return "待发布"
  if (status === "published") return "已发布"
  if (status === "rejected") return "已驳回"
  return "草稿"
}

export const requestStatusClass = (status: ChangeRequestRecord["status"]) => {
  if (status === "pending_approval") return "badge-warning"
  if (status === "approved") return "badge-info"
  if (status === "published") return "badge-success"
  if (status === "rejected") return "badge-error"
  return "badge-ghost"
}

export const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—"

export const providerRuntimeLabel = (provider: PaymentProviderRecord) => {
  if (provider.isCircuitBroken) return "已熔断"
  if (provider.isActive) return "运行中"
  return "已停用"
}

export const providerRuntimeClass = (provider: PaymentProviderRecord) => {
  if (provider.isCircuitBroken) return "badge-error"
  if (provider.isActive) return "badge-success"
  return "badge-ghost"
}

type ChangeRequestPayload = Record<string, unknown>

type SaasRiskEnvelopeFieldKey =
  | "dailyBudgetCap"
  | "maxSinglePayout"
  | "varianceCap"
  | "emergencyStop"

type SaasRiskEnvelopeState = {
  dailyBudgetCap: string | null
  maxSinglePayout: string | null
  varianceCap: string | null
  emergencyStop: boolean
}

type SaasTenantRiskEnvelopeDisplayContext = {
  tenant: {
    id: number
    name: string | null
    slug: string | null
  }
  currentEnvelope: SaasRiskEnvelopeState | null
  proposedEnvelope: SaasRiskEnvelopeState | null
  changedKeys: SaasRiskEnvelopeFieldKey[]
}

export type ChangeRequestDiffRow = {
  label: string
  from: string
  to: string
}

const SAAS_RISK_ENVELOPE_FIELDS: Array<{
  key: SaasRiskEnvelopeFieldKey
  label: string
}> = [
  { key: "dailyBudgetCap", label: "每日预算上限" },
  { key: "maxSinglePayout", label: "单次最大派发" },
  { key: "varianceCap", label: "方差上限" },
  { key: "emergencyStop", label: "紧急停付" },
]

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return Object.fromEntries(Object.entries(value))
}

const isRiskEnvelopeState = (
  value: unknown,
): value is SaasRiskEnvelopeState => {
  const record = toRecord(value)
  return (
    record !== null &&
    typeof record.emergencyStop === "boolean" &&
    (typeof record.dailyBudgetCap === "string" ||
      record.dailyBudgetCap === null) &&
    (typeof record.maxSinglePayout === "string" ||
      record.maxSinglePayout === null) &&
    (typeof record.varianceCap === "string" || record.varianceCap === null)
  )
}

const isRiskEnvelopeDisplayContext = (
  value: unknown,
): value is SaasTenantRiskEnvelopeDisplayContext => {
  const record = toRecord(value)
  const tenant = toRecord(record?.tenant)
  const changedKeys = Array.isArray(record?.changedKeys)
    ? record.changedKeys
    : null

  return (
    record !== null &&
    tenant !== null &&
    typeof tenant.id === "number" &&
    (typeof tenant.name === "string" || tenant.name === null) &&
    (typeof tenant.slug === "string" || tenant.slug === null) &&
    (record.currentEnvelope === null ||
      isRiskEnvelopeState(record.currentEnvelope)) &&
    (record.proposedEnvelope === null ||
      isRiskEnvelopeState(record.proposedEnvelope)) &&
    changedKeys !== null &&
    changedKeys.every((key) =>
      SAAS_RISK_ENVELOPE_FIELDS.some((field) => field.key === key),
    )
  )
}

const formatRiskEnvelopeValue = (
  key: SaasRiskEnvelopeFieldKey,
  value: unknown,
) => {
  if (key === "emergencyStop") {
    return value === true ? "开启" : "关闭"
  }

  return typeof value === "string" && value.trim() !== "" ? value : "无上限"
}

const buildFallbackRiskEnvelopeContext = (payload: ChangeRequestPayload) => {
  const tenantId =
    typeof payload.tenantId === "number" ? payload.tenantId : null
  const changedKeys = SAAS_RISK_ENVELOPE_FIELDS.filter(({ key }) =>
    Object.hasOwn(payload, key),
  ).map(({ key }) => key)

  if (tenantId === null || changedKeys.length === 0) {
    return null
  }

  const proposedEnvelope: SaasRiskEnvelopeState = {
    dailyBudgetCap:
      typeof payload.dailyBudgetCap === "string" ||
      payload.dailyBudgetCap === null
        ? (payload.dailyBudgetCap as string | null)
        : null,
    maxSinglePayout:
      typeof payload.maxSinglePayout === "string" ||
      payload.maxSinglePayout === null
        ? (payload.maxSinglePayout as string | null)
        : null,
    varianceCap:
      typeof payload.varianceCap === "string" || payload.varianceCap === null
        ? (payload.varianceCap as string | null)
        : null,
    emergencyStop: Boolean(payload.emergencyStop),
  }

  return {
    tenant: {
      id: tenantId,
      name: null,
      slug: null,
    },
    currentEnvelope: null,
    proposedEnvelope,
    changedKeys,
  } satisfies SaasTenantRiskEnvelopeDisplayContext
}

export const requestTypeLabel = (request: ChangeRequestRecord) => {
  if (request.changeType === "saas_tenant_risk_envelope_upsert") {
    return "SaaS 风控兜底"
  }
  if (request.changeType === "payment_provider_upsert") {
    return "支付通道"
  }
  if (request.changeType === "legal_document_publish") {
    return "法务发布"
  }
  return "系统配置"
}

export const requestTypeClass = (request: ChangeRequestRecord) => {
  if (request.changeType === "saas_tenant_risk_envelope_upsert") {
    return "badge-secondary"
  }
  if (request.changeType === "payment_provider_upsert") {
    return "badge-accent"
  }
  if (request.changeType === "legal_document_publish") {
    return "badge-info"
  }
  return "badge-ghost"
}

export const requestMarketingCopy = (request: ChangeRequestRecord) => {
  if (request.changeType === "saas_tenant_risk_envelope_upsert") {
    return "给租户预算、单次派奖和波动范围加上运营兜底，防止前台把参数放到不可控。"
  }

  return null
}

export const getSaasTenantRiskEnvelopeDisplayContext = (
  request: ChangeRequestRecord,
) => {
  if (request.changeType !== "saas_tenant_risk_envelope_upsert") {
    return null
  }

  const payload = toRecord(request.changePayload)
  if (!payload) {
    return null
  }

  const displayContext = payload.displayContext
  if (isRiskEnvelopeDisplayContext(displayContext)) {
    return displayContext
  }

  return buildFallbackRiskEnvelopeContext(payload)
}

export const getSaasTenantRiskEnvelopeHeadline = (
  request: ChangeRequestRecord,
) => {
  const context = getSaasTenantRiskEnvelopeDisplayContext(request)
  if (!context) {
    return request.summary
  }

  if (context.tenant.name && context.tenant.slug) {
    return `${context.tenant.name} / ${context.tenant.slug}`
  }

  if (context.tenant.name) {
    return `${context.tenant.name} / #${context.tenant.id}`
  }

  return `Tenant #${context.tenant.id}`
}

export const getSaasTenantRiskEnvelopeDiffRows = (
  request: ChangeRequestRecord,
): ChangeRequestDiffRow[] => {
  const context = getSaasTenantRiskEnvelopeDisplayContext(request)
  if (!context || !context.proposedEnvelope) {
    return []
  }

  return SAAS_RISK_ENVELOPE_FIELDS.filter(({ key }) =>
    context.changedKeys.includes(key),
  ).map(({ key, label }) => ({
    label,
    from: formatRiskEnvelopeValue(key, context.currentEnvelope?.[key] ?? null),
    to: formatRiskEnvelopeValue(key, context.proposedEnvelope?.[key] ?? null),
  }))
}
