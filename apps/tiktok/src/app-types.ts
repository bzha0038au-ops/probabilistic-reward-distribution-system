import type {
  AuthSessionSummary,
  CurrentUserSessionResponse,
  UserMfaEnrollmentResponse,
  UserMfaStatusResponse,
} from "@reward/shared-types/auth";
import type { EconomyLedgerEntryRecord } from "@reward/shared-types/economy";
import type { DrawOverviewResponse, DrawPlayResponse } from "@reward/shared-types/draw";
import type { RewardCenterResponse } from "@reward/shared-types/gamification";
import type {
  NotificationPreferenceRecord,
  NotificationRecord,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

export type AppTab = "play" | "story" | "wallet" | "notifications" | "profile";
export type RuntimeMode = "preview" | "tiktok";
export type LiveDataStatus = "idle" | "loading" | "ready" | "error";
export type NotificationFilter = "all" | "rewards" | "games" | "market" | "security";
export type PlayStage =
  | "intro"
  | "ticket"
  | "decision"
  | "ticket-final"
  | "bust"
  | "ticket-win"
  | "walk-away"
  | "rex"
  | "rex-win";
export type ScratchOutcome = "bust" | "jackpot";
export type ScratchSlotKind = "cash" | "multiplier" | "bust";
export type Suit = "hearts" | "spades" | "diamonds" | "clubs";

export interface Card {
  rank: string;
  suit: Suit;
}

export interface ScratchSlot {
  id: number;
  label: string;
  kind: ScratchSlotKind;
  amount: number;
  revealed: boolean;
}

export interface PlayState {
  stage: PlayStage;
  scenario: ScratchOutcome;
  scratchTotal: number;
  slots: ScratchSlot[];
  continueLine: string;
  rexStake: number;
  rexCards: Card[];
  yoyoCards: Card[];
  rexDrawCard: Card;
  rexSpeech: string;
}

export interface StoredProgress {
  bestTake: number;
  runCount: number;
  lastEnding: string;
}

export interface LiveDataState {
  apiBaseUrl: string;
  authToken: string | null;
  rememberedEmail: string;
  authStatus: LiveDataStatus;
  authMessage: string;
  dashboardStatus: LiveDataStatus;
  dashboardMessage: string;
  drawStatus: LiveDataStatus;
  drawMessage: string;
  session: CurrentUserSessionResponse | null;
  wallet: WalletBalanceResponse | null;
  drawOverview: DrawOverviewResponse | null;
  activity: EconomyLedgerEntryRecord[];
  notifications: NotificationRecord[];
  notificationSummary: NotificationSummary | null;
  notificationPreferences: NotificationPreferenceRecord[];
  notificationFilter: NotificationFilter;
  notificationUnreadOnly: boolean;
  notificationStatus: LiveDataStatus;
  notificationMessage: string;
  notificationMutating: boolean;
  rewardCenter: RewardCenterResponse | null;
  sessions: AuthSessionSummary[];
  lastDraw: DrawPlayResponse | null;
  phoneDraft: string;
  phoneCodeDraft: string;
  phoneStatus: LiveDataStatus;
  phoneMessage: string;
  phoneRequestSubmitting: boolean;
  phoneConfirmSubmitting: boolean;
  mfaSummary: UserMfaStatusResponse | null;
  mfaEnrollment: UserMfaEnrollmentResponse | null;
  mfaCodeDraft: string;
  mfaStatus: LiveDataStatus;
  mfaMessage: string;
  mfaEnrollSubmitting: boolean;
  mfaVerifySubmitting: boolean;
  mfaDisableSubmitting: boolean;
}

export interface AppState {
  activeTab: AppTab;
  runtimeMode: RuntimeMode;
  runtimeMessage: string;
  bestTake: number;
  runCount: number;
  lastEnding: string;
  play: PlayState;
  live: LiveDataState;
  eventLog: string[];
}

export interface AppRoute {
  tab: AppTab;
  stage?: PlayStage;
}
