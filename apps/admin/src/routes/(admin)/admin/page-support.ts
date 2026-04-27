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
  weightJitterEnabled: boolean
  weightJitterPct: string
  bonusAutoReleaseEnabled: boolean
  bonusUnlockWagerRatio: string
  authFailureWindowMinutes: string
  authFailureFreezeThreshold: string
  adminFailureFreezeThreshold: string
  profileSecurityRewardAmount: string
  firstDrawRewardAmount: string
  drawStreakDailyRewardAmount: string
  topUpStarterRewardAmount: string
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
  changeType: "system_config_update" | "payment_provider_upsert"
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

export interface PageData {
  admin?: CurrentAdmin | null
  prizes: Prize[]
  analytics: AnalyticsSummary | null
  config: SystemConfig | null
  providers: PaymentProviderRecord[]
  changeRequests: ChangeRequestRecord[]
  mfaStatus: MfaStatus | null
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
    weightJitterEnabled: false,
    weightJitterPct: "0.05",
    bonusAutoReleaseEnabled: false,
    bonusUnlockWagerRatio: "1",
    authFailureWindowMinutes: "15",
    authFailureFreezeThreshold: "8",
    adminFailureFreezeThreshold: "5",
    profileSecurityRewardAmount: "8",
    firstDrawRewardAmount: "3",
    drawStreakDailyRewardAmount: "5",
    topUpStarterRewardAmount: "10",
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
