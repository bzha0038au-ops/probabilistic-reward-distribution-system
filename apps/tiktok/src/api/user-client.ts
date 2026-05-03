import { createUserApiClient, type ApiResult } from "@reward/user-core";
import type {
  AuthCredentials,
  CurrentUserSessionResponse,
  EmailVerificationRequest,
  AcceptedResponse,
  PhoneVerificationRequest,
  PhoneVerificationResponse,
  SessionBulkRevocationResponse,
  SessionRevocationResponse,
  UserMfaDisableResponse,
  UserMfaEnrollmentResponse,
  UserMfaStatusResponse,
  UserMfaVerifyResponse,
  UserSessionsResponse,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import type { EconomyLedgerResponse } from "@reward/shared-types/economy";
import type { DrawOverviewResponse, DrawPlayResponse } from "@reward/shared-types/draw";
import type {
  RewardCenterResponse,
  RewardMissionClaimResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";
import type {
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationPreferencesUpdateRequest,
  NotificationRecord,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

const DEFAULT_USER_API_BASE_URL = "/api/user";

export interface BrowserUserApiClient {
  createSession: (payload: AuthCredentials) => Promise<ApiResult<UserSessionResponse>>;
  getCurrentSession: () => Promise<ApiResult<CurrentUserSessionResponse>>;
  deleteCurrentSession: () => Promise<ApiResult<SessionRevocationResponse>>;
  listSessions: () => Promise<ApiResult<UserSessionsResponse>>;
  revokeSession: (sessionId: string) => Promise<ApiResult<SessionRevocationResponse>>;
  revokeAllSessions: () => Promise<ApiResult<SessionBulkRevocationResponse>>;
  requestEmailVerification: (payload?: EmailVerificationRequest) => Promise<ApiResult<AcceptedResponse>>;
  requestPhoneVerification: (payload: PhoneVerificationRequest) => Promise<ApiResult<AcceptedResponse>>;
  confirmPhoneVerification: (payload: { phone: string; code: string }) => Promise<ApiResult<PhoneVerificationResponse>>;
  getUserMfaStatus: () => Promise<ApiResult<UserMfaStatusResponse>>;
  createUserMfaEnrollment: () => Promise<ApiResult<UserMfaEnrollmentResponse>>;
  verifyUserMfa: (payload: { enrollmentToken: string; totpCode: string }) => Promise<ApiResult<UserMfaVerifyResponse>>;
  disableUserMfa: (payload: { totpCode: string }) => Promise<ApiResult<UserMfaDisableResponse>>;
  getWalletBalance: () => Promise<ApiResult<WalletBalanceResponse>>;
  getEconomyLedger: (limit?: number) => Promise<ApiResult<EconomyLedgerResponse>>;
  getRewardCenter: () => Promise<ApiResult<RewardCenterResponse>>;
  claimRewardMission: (missionId: RewardMissionId) => Promise<ApiResult<RewardMissionClaimResponse>>;
  listNotifications: (limit?: number) => Promise<ApiResult<NotificationListResponse>>;
  getNotificationSummary: () => Promise<ApiResult<NotificationSummary>>;
  markNotificationRead: (notificationId: number) => Promise<ApiResult<NotificationRecord>>;
  markAllNotificationsRead: () => Promise<ApiResult<{ updatedCount: number }>>;
  listNotificationPreferences: () => Promise<ApiResult<NotificationPreferencesResponse>>;
  updateNotificationPreferences: (
    payload: NotificationPreferencesUpdateRequest,
  ) => Promise<ApiResult<NotificationPreferencesResponse>>;
  getDrawOverview: () => Promise<ApiResult<DrawOverviewResponse>>;
  playDraw: (payload: { count: number; clientNonce?: string | null }) => Promise<ApiResult<DrawPlayResponse>>;
}

export function resolveUserApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_USER_API_BASE_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_USER_API_BASE_URL;
}

export function createBrowserUserApiClient(getAuthToken: () => string | null): BrowserUserApiClient {
  const client = createUserApiClient({
    baseUrl: resolveUserApiBaseUrl(),
    getLocale: () => navigator.language || "en-AU",
    getAuthToken,
  });

  return {
    createSession: (payload) => client.createSession(payload),
    getCurrentSession: () => client.getCurrentSession(),
    deleteCurrentSession: () => client.deleteCurrentSession(),
    listSessions: () => client.listSessions(),
    revokeSession: (sessionId) => client.revokeSession(sessionId),
    revokeAllSessions: () => client.revokeAllSessions(),
    requestEmailVerification: (payload = {}) => client.requestEmailVerification(payload),
    requestPhoneVerification: (payload) => client.requestPhoneVerification(payload),
    confirmPhoneVerification: (payload) => client.confirmPhoneVerification(payload),
    getUserMfaStatus: () => client.getUserMfaStatus(),
    createUserMfaEnrollment: () => client.createUserMfaEnrollment(),
    verifyUserMfa: (payload) => client.verifyUserMfa(payload),
    disableUserMfa: (payload) => client.disableUserMfa(payload),
    getWalletBalance: () => client.getWalletBalance(),
    getEconomyLedger: (limit = 8) => client.getEconomyLedger({ limit }),
    getRewardCenter: () => client.getRewardCenter(),
    claimRewardMission: (missionId) => client.claimRewardMission(missionId),
    listNotifications: (limit = 6) => client.listNotifications({ limit }),
    getNotificationSummary: () => client.getNotificationSummary(),
    markNotificationRead: (notificationId) => client.markNotificationRead(notificationId),
    markAllNotificationsRead: () => client.markAllNotificationsRead(),
    listNotificationPreferences: () => client.listNotificationPreferences(),
    updateNotificationPreferences: (payload) => client.updateNotificationPreferences(payload),
    getDrawOverview: () => client.getDrawOverview(),
    playDraw: (payload) => client.playDraw(payload),
  };
}
