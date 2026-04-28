import type { DbClient, DbTransaction } from "../../db";
import { reviewPaymentProviderConfig } from "../payment/provider-config";

export {
  getControlCenterOverview,
  listControlChangeRequests,
  listPaymentProvidersForAdmin,
  toSystemConfigResponse,
} from "./control-overview-service";
export {
  approveControlChangeRequest,
  createLegalDocumentPublishDraft,
  createPaymentProviderDraft,
  createSaasTenantRiskEnvelopeDraft,
  createSystemConfigDraft,
  publishControlChangeRequest,
  rejectControlChangeRequest,
  submitControlChangeRequest,
} from "./control-change-request-service";
export {
  resetPaymentProviderCircuitBreaker,
  tripPaymentProviderCircuitBreaker,
} from "./control-circuit-breaker-service";

export type DbExecutor = DbClient | DbTransaction;

export type ControlChangeRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "published"
  | "rejected";

export type ControlChangeRequestType =
  | "system_config_update"
  | "payment_provider_upsert"
  | "legal_document_publish"
  | "saas_tenant_risk_envelope_upsert";

export type PaymentProviderFlow = "deposit" | "withdrawal";
export type PaymentProviderExecutionMode = "manual" | "automated";

export type SystemConfigDraftPayload = {
  poolBalance?: string | number;
  drawCost?: string | number;
  weightJitterEnabled?: boolean;
  weightJitterPct?: string | number;
  bonusAutoReleaseEnabled?: boolean;
  bonusUnlockWagerRatio?: string | number;
  authFailureWindowMinutes?: string | number;
  authFailureFreezeThreshold?: string | number;
  adminFailureFreezeThreshold?: string | number;
  profileSecurityRewardAmount?: string | number;
  firstDrawRewardAmount?: string | number;
  drawStreakDailyRewardAmount?: string | number;
  topUpStarterRewardAmount?: string | number;
  blackjackMinStake?: string | number;
  blackjackMaxStake?: string | number;
  blackjackWinPayoutMultiplier?: string | number;
  blackjackPushPayoutMultiplier?: string | number;
  blackjackNaturalPayoutMultiplier?: string | number;
  blackjackDealerHitsSoft17?: boolean;
  blackjackDoubleDownAllowed?: boolean;
  blackjackSplitAcesAllowed?: boolean;
  blackjackHitSplitAcesAllowed?: boolean;
  blackjackResplitAllowed?: boolean;
  blackjackMaxSplitHands?: number;
  blackjackSplitTenValueCardsAllowed?: boolean;
  saasUsageAlertMaxMinuteQps?: string | number;
  saasUsageAlertMaxSinglePayoutAmount?: string | number;
  saasUsageAlertMaxAntiExploitRatePct?: string | number;
};

export type PaymentProviderGrayRuleDraftPayload = {
  grayPercent?: number | null;
  grayUserIds?: number[];
  grayCountryCodes?: string[];
  grayCurrencies?: string[];
  grayMinAmount?: string | null;
  grayMaxAmount?: string | null;
};

export type PaymentProviderDraftPayload = {
  providerId: number | null;
  name: string;
  providerType: string;
  priority: number;
  isActive: boolean;
  supportedFlows: PaymentProviderFlow[];
  executionMode: PaymentProviderExecutionMode;
  adapter: string | null;
  grayPercent?: number | null;
  grayUserIds?: number[];
  grayCountryCodes?: string[];
  grayCurrencies?: string[];
  grayMinAmount?: string | null;
  grayMaxAmount?: string | null;
  grayRules?: PaymentProviderGrayRuleDraftPayload[];
};

export type SaasTenantRiskEnvelopeDraftPayload = {
  tenantId: number;
  dailyBudgetCap?: string | number | null;
  maxSinglePayout?: string | number | null;
  varianceCap?: string | number | null;
  emergencyStop?: boolean;
};

export type LegalDocumentPublishPayload = {
  documentId: number;
  documentKey: string;
  locale: string;
  title: string;
  version: number;
  rolloutPercent: number;
};

export type ControlChangeRequestRecord = {
  id: number;
  changeType: ControlChangeRequestType;
  status: ControlChangeRequestStatus;
  targetType: string;
  targetId: number | null;
  reason: string | null;
  requiresSecondConfirmation: boolean;
  requiresMfa: boolean;
  createdByAdminId: number;
  submittedByAdminId: number | null;
  approvedByAdminId: number | null;
  publishedByAdminId: number | null;
  rejectedByAdminId: number | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  rejectedAt: Date | null;
  summary: string;
  changePayload: Record<string, unknown>;
  confirmationPhrases: {
    submit: string | null;
    publish: string | null;
  };
};

export type ControlChangeAuditField = {
  key: string;
  from: unknown;
  to: unknown;
};

export type PublishedControlChangeRequestAudit = {
  resource:
    | "system_config"
    | "payment_provider"
    | "legal_document_publication"
    | "saas_tenant_risk_envelope";
  targetId: number | null;
  changedKeys: string[];
  fieldDiff: ControlChangeAuditField[];
};

export type PublishControlChangeRequestResult = {
  changeRequest: ControlChangeRequestRecord;
  audit: PublishedControlChangeRequestAudit | null;
};

export type ControlSystemConfig = {
  poolBalance: string;
  drawCost: string;
  weightJitterEnabled: boolean;
  weightJitterPct: string;
  bonusAutoReleaseEnabled: boolean;
  bonusUnlockWagerRatio: string;
  authFailureWindowMinutes: string;
  authFailureFreezeThreshold: string;
  adminFailureFreezeThreshold: string;
  profileSecurityRewardAmount: string;
  firstDrawRewardAmount: string;
  drawStreakDailyRewardAmount: string;
  topUpStarterRewardAmount: string;
  blackjackMinStake: string;
  blackjackMaxStake: string;
  blackjackWinPayoutMultiplier: string;
  blackjackPushPayoutMultiplier: string;
  blackjackNaturalPayoutMultiplier: string;
  blackjackDealerHitsSoft17: boolean;
  blackjackDoubleDownAllowed: boolean;
  blackjackSplitAcesAllowed: boolean;
  blackjackHitSplitAcesAllowed: boolean;
  blackjackResplitAllowed: boolean;
  blackjackMaxSplitHands: number;
  blackjackSplitTenValueCardsAllowed: boolean;
  saasUsageAlertMaxMinuteQps: string;
  saasUsageAlertMaxSinglePayoutAmount: string;
  saasUsageAlertMaxAntiExploitRatePct: string;
};

export type ControlPaymentProviderRecord = {
  id: number;
  name: string;
  providerType: string;
  priority: number;
  isActive: boolean;
  isCircuitBroken: boolean;
  circuitBrokenAt: Date | null;
  circuitBreakReason: string | null;
  supportedFlows: PaymentProviderFlow[];
  executionMode: PaymentProviderExecutionMode;
  adapter: string | null;
  grayPercent: number | null;
  grayUserIds: number[];
  grayCountryCodes: string[];
  grayCurrencies: string[];
  grayMinAmount: string | null;
  grayMaxAmount: string | null;
  grayRules: PaymentProviderGrayRuleDraftPayload[];
  configViolations: ReturnType<
    typeof reviewPaymentProviderConfig
  >["violations"];
};

export type ControlCenterOverview = {
  systemConfig: ControlSystemConfig;
  providers: ControlPaymentProviderRecord[];
  changeRequests: ControlChangeRequestRecord[];
};
