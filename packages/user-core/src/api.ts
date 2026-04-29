import type {
  AcceptedResponse,
  AuthCredentials,
  CompletedResponse,
  CurrentUserSessionResponse,
  EmailVerificationRequest,
  EmailVerificationResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PhoneVerificationConfirmRequest,
  PhoneVerificationRequest,
  PhoneVerificationResponse,
  RegisterRequest,
  RegisterResponse,
  SessionBulkRevocationResponse,
  SessionRevocationResponse,
  UserRealtimeTokenResponse,
  UserMfaDisableRequest,
  UserMfaDisableResponse,
  UserMfaEnrollmentResponse,
  UserMfaStatusResponse,
  UserMfaVerifyRequest,
  UserMfaVerifyResponse,
  UserSessionResponse,
  UserSessionsResponse,
  VerificationTokenConfirmRequest,
} from "@reward/shared-types/auth";
import type { ApiError, ApiResponse } from "@reward/shared-types/api";
import type {
  BlackjackActionRequest,
  BlackjackMutationResponse,
  BlackjackOverviewResponse,
  BlackjackStartRequest,
} from "@reward/shared-types/blackjack";
import type {
  CommunityThreadDetailResponse,
  CommunityThreadListResponse,
  CommunityThreadMutationResponse,
  CreateCommunityPostRequest,
  CreateCommunityThreadRequest,
} from "@reward/shared-types/community";
import type {
  DrawCatalogResponse,
  DrawPlayRequest,
  DrawPlayResponse,
  DrawRequest,
  DrawOverviewResponse,
  DrawResult,
} from "@reward/shared-types/draw";
import type { ExperimentVariantResponse } from "@reward/shared-types/experiments";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
import type {
  PlayModeGameKey,
  PlayModeRequest,
  PlayModeStateResponse,
} from "@reward/shared-types/play-mode";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import type {
  HoldemCreateTableRequest,
  HoldemJoinTableRequest,
  HoldemRealtimeObservationsRequest,
  HoldemRealtimeObservationsResponse,
  HoldemPresenceResponse,
  HoldemTableBotsRequest,
  HoldemSeatModeRequest,
  HoldemTableMessage,
  HoldemTableMessageRequest,
  HoldemTableMessagesResponse,
  HoldemTableActionRequest,
  HoldemTableResponse,
  HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type {
  KycUserProfile,
  KycSubmitRequest,
} from "@reward/shared-types/kyc";
import type {
  QuickEightRequest,
  QuickEightRound,
} from "@reward/shared-types/quick-eight";
import type {
  RewardCenterResponse,
  RewardMissionClaimResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";
import type {
  PredictionMarketDetail,
  PredictionMarketHistoryResponse,
  PredictionMarketPortfolioFilter,
  PredictionMarketPortfolioResponse,
  PredictionMarketPositionMutationResponse,
  PredictionMarketPositionRequest,
  PredictionMarketSummary,
} from "@reward/shared-types/prediction-market";
import type {
  NotificationListResponse,
  NotificationPushDeviceDeleteRequest,
  NotificationPushDeviceRecord,
  NotificationPushDeviceRegisterRequest,
  NotificationPreferencesResponse,
  NotificationPreferencesUpdateRequest,
  NotificationRecord,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  LedgerEntryRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import type {
  AcceptCurrentLegalDocumentsRequest,
  CurrentLegalAcceptanceState,
  CurrentLegalDocumentsResponse,
} from "@reward/shared-types/legal";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

export type ApiResult<T> = ApiResponse<T>;

export const USER_REALTIME_ROUTE = "/realtime";

export const USER_API_ROUTES = {
  auth: {
    register: "/auth/register",
    session: "/auth/user/session",
    realtimeToken: "/auth/user/realtime-token",
    sessions: "/auth/user/sessions",
    sessionsRevokeAll: "/auth/user/sessions/revoke-all",
    mfaStatus: "/auth/user/mfa/status",
    mfaEnrollment: "/auth/user/mfa/enrollment",
    mfaVerify: "/auth/user/mfa/verify",
    mfaDisable: "/auth/user/mfa/disable",
    passwordResetRequest: "/auth/password-reset/request",
    passwordResetConfirm: "/auth/password-reset/confirm",
    emailVerificationRequest: "/auth/email-verification/request",
    emailVerificationConfirm: "/auth/email-verification/confirm",
    phoneVerificationRequest: "/auth/phone-verification/request",
    phoneVerificationConfirm: "/auth/phone-verification/confirm",
  },
  legal: {
    current: "/legal/current",
    acceptances: "/legal/acceptances",
  },
  communityThreads: "/community/threads",
  wallet: "/wallet",
  transactions: "/transactions",
  notifications: "/notifications",
  notificationSummary: "/notifications/summary",
  notificationPreferences: "/notification-preferences",
  notificationPushDevices: "/notification-push-devices",
  experiments: "/experiments",
  kycProfile: "/kyc/profile",
  rewardCenter: "/rewards/center",
  rewardClaim: "/rewards/claim",
  markets: "/markets",
  marketPortfolio: "/markets/portfolio",
  marketHistory: "/markets/history",
  fairnessCommit: "/fairness/commit",
  fairnessReveal: "/fairness/reveal",
  playModes: "/play-modes",
  handHistory: "/hand-history",
  holdemTables: "/holdem/tables",
  holdemRealtimeObservations: "/holdem/realtime-observations",
  blackjack: "/blackjack",
  blackjackStart: "/blackjack/start",
  draw: "/draw",
  quickEight: "/quick-eight",
  drawCatalog: "/draw/catalog",
  drawOverview: "/draw/overview",
  drawPlay: "/draw/play",
  bankCards: "/bank-cards",
  cryptoDepositChannels: "/crypto-deposit-channels",
  cryptoDeposits: "/crypto-deposits",
  cryptoWithdrawAddresses: "/crypto-withdraw-addresses",
  topUps: "/top-ups",
  withdrawals: "/withdrawals",
  cryptoWithdrawals: "/crypto-withdrawals",
  realtime: USER_REALTIME_ROUTE,
} as const;

export type SupportedUserPlatform = "web" | "ios" | "android";

export const LOCAL_API_BASE_URLS: Record<SupportedUserPlatform, string> = {
  web: "http://localhost:4000",
  ios: "http://localhost:4000",
  android: "http://10.0.2.2:4000",
};

const fallbackError: ApiError = { message: "Request failed." };
const networkFailureCode = "NETWORK_REQUEST_FAILED";
const genericNetworkFailureMessage =
  "Network request failed. Check that the API server is reachable and try again.";

const normalizeRequestFailure = (error: unknown): ApiError => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (!message) {
      return {
        message: genericNetworkFailureMessage,
        code: networkFailureCode,
      };
    }

    if (message.toLowerCase() === "network request failed") {
      return {
        message: genericNetworkFailureMessage,
        code: networkFailureCode,
      };
    }

    return {
      message: `Request failed: ${message}`,
      code: networkFailureCode,
    };
  }

  return {
    message: genericNetworkFailureMessage,
    code: networkFailureCode,
  };
};

const toRequestFailureResult = <T>(error: unknown): ApiResult<T> => ({
  ok: false,
  error: normalizeRequestFailure(error),
  status: 0,
});

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const resolveRealtimeProtocol = (protocol: string) =>
  protocol === "https:" ? "wss:" : "ws:";

const toSearch = (
  params: Record<string, string | number | boolean | undefined>,
) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const output = search.toString();
  return output ? `?${output}` : "";
};

export const resolveLocalApiBaseUrl = (platform: SupportedUserPlatform) =>
  LOCAL_API_BASE_URLS[platform];

export const resolveUserRealtimeUrl = (payload: {
  baseUrl: string;
  authToken?: string | null;
  query?: Record<string, string | number | boolean | undefined>;
}) => {
  const url = new URL(
    USER_REALTIME_ROUTE,
    `${trimTrailingSlash(payload.baseUrl)}/`,
  );
  url.protocol = resolveRealtimeProtocol(url.protocol);

  if (payload.authToken) {
    url.searchParams.set("token", payload.authToken);
  }

  for (const [key, value] of Object.entries(payload.query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
};

export const parseApiResponse = async <T>(
  response: Response,
): Promise<ApiResult<T>> => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? fallbackError,
      requestId: payload?.requestId,
      status: response.status,
    };
  }

  return {
    ok: true,
    data: payload.data as T,
    requestId: payload?.requestId,
    status: response.status,
  };
};

export type UserApiRequestOptions = {
  path: string;
  baseUrl: string;
  init?: RequestInit;
  locale?: string | null;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
};

export async function requestUserApi<T>({
  path,
  baseUrl,
  init = {},
  locale,
  authToken,
  fetchImpl = fetch,
}: UserApiRequestOptions): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});

  if (locale) {
    headers.set("x-locale", locale);
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  try {
    const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
      ...init,
      headers,
    });

    return parseApiResponse<T>(response);
  } catch (error) {
    return toRequestFailureResult<T>(error);
  }
}

type AsyncValue<T> = T | Promise<T>;

export type UserApiRuntime = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getLocale?: () => AsyncValue<string | null | undefined>;
  getAuthToken?: () => AsyncValue<string | null | undefined>;
  getExtraHeaders?: () => AsyncValue<Record<string, string> | undefined>;
};

export type UserApiOverrides = {
  baseUrl?: string;
  locale?: string | null;
  authToken?: string | null;
  auth?: boolean;
  fetchImpl?: typeof fetch;
};

export type TopUpCreateRequest = {
  amount: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CryptoDepositCreateRequest = {
  channelId: number;
  amountClaimed: string;
  txHash: string;
  fromAddress?: string | null;
};

export type BankCardCreateRequest = {
  cardholderName: string;
  bankName?: string | null;
  brand?: string | null;
  last4?: string | null;
  isDefault?: boolean;
};

export type CryptoWithdrawAddressCreateRequest = {
  chain?: string | null;
  network?: string | null;
  token?: string | null;
  address: string;
  label?: string | null;
  isDefault?: boolean;
};

export type WithdrawalCreateRequest = {
  amount: string;
  payoutMethodId?: number | null;
  bankCardId?: number | null;
  totpCode?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function createUserApiClient(runtime: UserApiRuntime) {
  const resolveLocale = async (overrides: UserApiOverrides) => {
    if (overrides.locale !== undefined) {
      return overrides.locale;
    }

    return runtime.getLocale ? await runtime.getLocale() : undefined;
  };

  const resolveAuthToken = async (overrides: UserApiOverrides) => {
    if (overrides.auth === false) {
      return null;
    }

    if (overrides.authToken !== undefined) {
      return overrides.authToken;
    }

    return runtime.getAuthToken ? await runtime.getAuthToken() : undefined;
  };

  const request = async <T>(
    path: string,
    init: RequestInit = {},
    overrides: UserApiOverrides = {},
  ) => {
    try {
      const extraHeaders = runtime.getExtraHeaders
        ? await runtime.getExtraHeaders()
        : undefined;
      const headers = new Headers(init.headers ?? {});

      for (const [key, value] of Object.entries(extraHeaders ?? {})) {
        if (value.trim() !== "") {
          headers.set(key, value);
        }
      }

      return requestUserApi<T>({
        path,
        init: {
          ...init,
          headers,
        },
        baseUrl: overrides.baseUrl ?? runtime.baseUrl,
        locale: await resolveLocale(overrides),
        authToken: await resolveAuthToken(overrides),
        fetchImpl: overrides.fetchImpl ?? runtime.fetchImpl,
      });
    } catch (error) {
      return toRequestFailureResult<T>(error);
    }
  };

  return {
    request,
    register(payload: RegisterRequest) {
      return request<RegisterResponse>(
        USER_API_ROUTES.auth.register,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        { auth: false },
      );
    },
    getCurrentLegalDocuments(overrides: UserApiOverrides = {}) {
      return request<CurrentLegalDocumentsResponse>(
        USER_API_ROUTES.legal.current,
        { cache: "no-store" },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    acceptCurrentLegalDocuments(
      payload: AcceptCurrentLegalDocumentsRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CurrentLegalAcceptanceState>(
        USER_API_ROUTES.legal.acceptances,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    createSession(payload: AuthCredentials) {
      return request<UserSessionResponse>(
        USER_API_ROUTES.auth.session,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        { auth: false },
      );
    },
    getCurrentSession(overrides: UserApiOverrides = {}) {
      return request<CurrentUserSessionResponse>(
        USER_API_ROUTES.auth.session,
        { cache: "no-store" },
        overrides,
      );
    },
    getUserRealtimeToken(overrides: UserApiOverrides = {}) {
      return request<UserRealtimeTokenResponse>(
        USER_API_ROUTES.auth.realtimeToken,
        { cache: "no-store" },
        overrides,
      );
    },
    deleteCurrentSession(overrides: UserApiOverrides = {}) {
      return request<SessionRevocationResponse>(
        USER_API_ROUTES.auth.session,
        {
          method: "DELETE",
          cache: "no-store",
        },
        overrides,
      );
    },
    listSessions(overrides: UserApiOverrides = {}) {
      return request<UserSessionsResponse>(
        USER_API_ROUTES.auth.sessions,
        { cache: "no-store" },
        overrides,
      );
    },
    revokeSession(sessionId: string, overrides: UserApiOverrides = {}) {
      return request<SessionRevocationResponse>(
        `${USER_API_ROUTES.auth.sessions}/${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
          cache: "no-store",
        },
        overrides,
      );
    },
    revokeAllSessions(overrides: UserApiOverrides = {}) {
      return request<SessionBulkRevocationResponse>(
        USER_API_ROUTES.auth.sessionsRevokeAll,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    getUserMfaStatus(overrides: UserApiOverrides = {}) {
      return request<UserMfaStatusResponse>(
        USER_API_ROUTES.auth.mfaStatus,
        { cache: "no-store" },
        overrides,
      );
    },
    createUserMfaEnrollment(overrides: UserApiOverrides = {}) {
      return request<UserMfaEnrollmentResponse>(
        USER_API_ROUTES.auth.mfaEnrollment,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    verifyUserMfa(
      payload: UserMfaVerifyRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<UserMfaVerifyResponse>(
        USER_API_ROUTES.auth.mfaVerify,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    disableUserMfa(
      payload: UserMfaDisableRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<UserMfaDisableResponse>(
        USER_API_ROUTES.auth.mfaDisable,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    requestPasswordReset(
      payload: PasswordResetRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<AcceptedResponse>(
        USER_API_ROUTES.auth.passwordResetRequest,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    confirmPasswordReset(
      payload: PasswordResetConfirmRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CompletedResponse>(
        USER_API_ROUTES.auth.passwordResetConfirm,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    requestEmailVerification(
      payload: EmailVerificationRequest = {},
      overrides: UserApiOverrides = {},
    ) {
      return request<AcceptedResponse>(
        USER_API_ROUTES.auth.emailVerificationRequest,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    confirmEmailVerification(
      payload: VerificationTokenConfirmRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<EmailVerificationResponse>(
        USER_API_ROUTES.auth.emailVerificationConfirm,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    requestPhoneVerification(
      payload: PhoneVerificationRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<AcceptedResponse>(
        USER_API_ROUTES.auth.phoneVerificationRequest,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    confirmPhoneVerification(
      payload: PhoneVerificationConfirmRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<PhoneVerificationResponse>(
        USER_API_ROUTES.auth.phoneVerificationConfirm,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    listCommunityThreads(
      page?: number,
      limit?: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<CommunityThreadListResponse>(
        `${USER_API_ROUTES.communityThreads}${toSearch({ page, limit })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getCommunityThread(
      threadId: number,
      page?: number,
      limit?: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<CommunityThreadDetailResponse>(
        `${USER_API_ROUTES.communityThreads}/${threadId}${toSearch({
          page,
          limit,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    createCommunityThread(
      payload: CreateCommunityThreadRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CommunityThreadMutationResponse>(
        USER_API_ROUTES.communityThreads,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    createCommunityPost(
      threadId: number,
      payload: CreateCommunityPostRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CommunityThreadMutationResponse>(
        `${USER_API_ROUTES.communityThreads}/${threadId}/posts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    getWalletBalance(overrides: UserApiOverrides = {}) {
      return request<WalletBalanceResponse>(
        USER_API_ROUTES.wallet,
        {},
        overrides,
      );
    },
    getTransactionHistory(limit?: number, overrides: UserApiOverrides = {}) {
      return request<LedgerEntryRecord[]>(
        `${USER_API_ROUTES.transactions}${toSearch({ limit })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    listNotifications(
      params: {
        limit?: number;
        unreadOnly?: boolean;
      } = {},
      overrides: UserApiOverrides = {},
    ) {
      return request<NotificationListResponse>(
        `${USER_API_ROUTES.notifications}${toSearch({
          limit: params.limit,
          unreadOnly: params.unreadOnly,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getNotificationSummary(overrides: UserApiOverrides = {}) {
      return request<NotificationSummary>(
        USER_API_ROUTES.notificationSummary,
        { cache: "no-store" },
        overrides,
      );
    },
    markNotificationRead(
      notificationId: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<NotificationRecord>(
        `${USER_API_ROUTES.notifications}/${notificationId}/read`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    markAllNotificationsRead(overrides: UserApiOverrides = {}) {
      return request<{ updatedCount: number }>(
        `${USER_API_ROUTES.notifications}/read-all`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    listNotificationPreferences(overrides: UserApiOverrides = {}) {
      return request<NotificationPreferencesResponse>(
        USER_API_ROUTES.notificationPreferences,
        { cache: "no-store" },
        overrides,
      );
    },
    updateNotificationPreferences(
      payload: NotificationPreferencesUpdateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<NotificationPreferencesResponse>(
        USER_API_ROUTES.notificationPreferences,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    registerNotificationPushDevice(
      payload: NotificationPushDeviceRegisterRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<NotificationPushDeviceRecord>(
        USER_API_ROUTES.notificationPushDevices,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    unregisterNotificationPushDevice(
      payload: NotificationPushDeviceDeleteRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<NotificationPushDeviceRecord>(
        USER_API_ROUTES.notificationPushDevices,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    getKycProfile(overrides: UserApiOverrides = {}) {
      return request<KycUserProfile>(
        USER_API_ROUTES.kycProfile,
        { cache: "no-store" },
        overrides,
      );
    },
    submitKycProfile(
      payload: KycSubmitRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<KycUserProfile>(
        USER_API_ROUTES.kycProfile,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    listBankCards(overrides: UserApiOverrides = {}) {
      return request<BankCardRecord[]>(
        USER_API_ROUTES.bankCards,
        { cache: "no-store" },
        overrides,
      );
    },
    createBankCard(
      payload: BankCardCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<BankCardRecord>(
        USER_API_ROUTES.bankCards,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    setDefaultBankCard(bankCardId: number, overrides: UserApiOverrides = {}) {
      return request<BankCardRecord>(
        `${USER_API_ROUTES.bankCards}/${bankCardId}/default`,
        {
          method: "PATCH",
          cache: "no-store",
        },
        overrides,
      );
    },
    listCryptoDepositChannels(overrides: UserApiOverrides = {}) {
      return request<CryptoDepositChannelRecord[]>(
        USER_API_ROUTES.cryptoDepositChannels,
        { cache: "no-store" },
        overrides,
      );
    },
    createCryptoDeposit(
      payload: CryptoDepositCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<DepositRecord>(
        USER_API_ROUTES.cryptoDeposits,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    listCryptoWithdrawAddresses(overrides: UserApiOverrides = {}) {
      return request<CryptoWithdrawAddressViewRecord[]>(
        USER_API_ROUTES.cryptoWithdrawAddresses,
        { cache: "no-store" },
        overrides,
      );
    },
    createCryptoWithdrawAddress(
      payload: CryptoWithdrawAddressCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<CryptoWithdrawAddressViewRecord>(
        USER_API_ROUTES.cryptoWithdrawAddresses,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    setDefaultCryptoWithdrawAddress(
      payoutMethodId: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<CryptoWithdrawAddressViewRecord>(
        `${USER_API_ROUTES.cryptoWithdrawAddresses}/${payoutMethodId}/default`,
        {
          method: "PATCH",
          cache: "no-store",
        },
        overrides,
      );
    },
    listTopUps(limit?: number, overrides: UserApiOverrides = {}) {
      return request<DepositRecord[]>(
        `${USER_API_ROUTES.topUps}${toSearch({ limit })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    createTopUp(payload: TopUpCreateRequest, overrides: UserApiOverrides = {}) {
      return request<DepositRecord>(
        USER_API_ROUTES.topUps,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    listWithdrawals(limit?: number, overrides: UserApiOverrides = {}) {
      return request<WithdrawalRecord[]>(
        `${USER_API_ROUTES.withdrawals}${toSearch({ limit })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    createWithdrawal(
      payload: WithdrawalCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<WithdrawalRecord>(
        USER_API_ROUTES.withdrawals,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    createCryptoWithdrawal(
      payload: WithdrawalCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<WithdrawalRecord>(
        USER_API_ROUTES.cryptoWithdrawals,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    getBlackjackOverview(overrides: UserApiOverrides = {}) {
      return request<BlackjackOverviewResponse>(
        USER_API_ROUTES.blackjack,
        { cache: "no-store" },
        overrides,
      );
    },
    getHoldemTables(overrides: UserApiOverrides = {}) {
      return request<HoldemTablesResponse>(
        USER_API_ROUTES.holdemTables,
        { cache: "no-store" },
        overrides,
      );
    },
    getHoldemTable(tableId: number, overrides: UserApiOverrides = {}) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getHoldemTableMessages(tableId: number, overrides: UserApiOverrides = {}) {
      return request<HoldemTableMessagesResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/messages`,
        { cache: "no-store" },
        overrides,
      );
    },
    reportHoldemRealtimeObservations(
      payload: HoldemRealtimeObservationsRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemRealtimeObservationsResponse>(
        USER_API_ROUTES.holdemRealtimeObservations,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          keepalive: true,
        },
        overrides,
      );
    },
    touchHoldemTablePresence(
      tableId: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemPresenceResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/presence`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    setHoldemSeatMode(
      tableId: number,
      payload: HoldemSeatModeRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/seat-mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    postHoldemTableMessage(
      tableId: number,
      payload: HoldemTableMessageRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableMessage>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    createHoldemTable(
      payload: HoldemCreateTableRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableResponse>(
        USER_API_ROUTES.holdemTables,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    addHoldemBots(
      tableId: number,
      payload: HoldemTableBotsRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/bots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    joinHoldemTable(
      tableId: number,
      payload: HoldemJoinTableRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    leaveHoldemTable(tableId: number, overrides: UserApiOverrides = {}) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/leave`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    startHoldemTable(tableId: number, overrides: UserApiOverrides = {}) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/start`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    actOnHoldemTable(
      tableId: number,
      payload: HoldemTableActionRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemTableResponse>(
        `${USER_API_ROUTES.holdemTables}/${tableId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    getHandHistory(roundId: string, overrides: UserApiOverrides = {}) {
      return request<HandHistory>(
        `${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getHandHistoryEvidenceBundle(
      roundId: string,
      overrides: UserApiOverrides = {},
    ) {
      return request<HoldemSignedEvidenceBundle>(
        `${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}/evidence-bundle`,
        { cache: "no-store" },
        overrides,
      );
    },
    startBlackjack(
      payload: BlackjackStartRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<BlackjackMutationResponse>(
        USER_API_ROUTES.blackjackStart,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    actOnBlackjack(
      gameId: number,
      payload: BlackjackActionRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<BlackjackMutationResponse>(
        `${USER_API_ROUTES.blackjack}/${gameId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    getRewardCenter(overrides: UserApiOverrides = {}) {
      return request<RewardCenterResponse>(
        USER_API_ROUTES.rewardCenter,
        { cache: "no-store" },
        overrides,
      );
    },
    getExperimentVariant(expKey: string, overrides: UserApiOverrides = {}) {
      return request<ExperimentVariantResponse>(
        `${USER_API_ROUTES.experiments}/${encodeURIComponent(expKey)}/variant`,
        { cache: "no-store" },
        overrides,
      );
    },
    getFairnessCommit(overrides: UserApiOverrides = {}) {
      return request<FairnessCommit>(
        USER_API_ROUTES.fairnessCommit,
        { cache: "no-store" },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    revealFairnessSeed(epoch: number, overrides: UserApiOverrides = {}) {
      return request<FairnessReveal>(
        `${USER_API_ROUTES.fairnessReveal}${toSearch({ epoch })}`,
        { cache: "no-store" },
        {
          ...overrides,
          auth: false,
        },
      );
    },
    getPlayMode(gameKey: PlayModeGameKey, overrides: UserApiOverrides = {}) {
      return request<PlayModeStateResponse>(
        `${USER_API_ROUTES.playModes}/${gameKey}`,
        { cache: "no-store" },
        overrides,
      );
    },
    setPlayMode(
      gameKey: PlayModeGameKey,
      payload: PlayModeRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<PlayModeStateResponse>(
        `${USER_API_ROUTES.playModes}/${gameKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    claimRewardMission(
      missionId: RewardMissionId,
      overrides: UserApiOverrides = {},
    ) {
      return request<RewardMissionClaimResponse>(
        USER_API_ROUTES.rewardClaim,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId }),
          cache: "no-store",
        },
        overrides,
      );
    },
    listPredictionMarkets(overrides: UserApiOverrides = {}) {
      return request<PredictionMarketSummary[]>(
        USER_API_ROUTES.markets,
        { cache: "no-store" },
        overrides,
      );
    },
    getPredictionMarketPortfolio(
      status?: PredictionMarketPortfolioFilter,
      overrides: UserApiOverrides = {},
    ) {
      return request<PredictionMarketPortfolioResponse>(
        `${USER_API_ROUTES.marketPortfolio}${toSearch({ status })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getPredictionMarketHistory(
      params: {
        status?: PredictionMarketPortfolioFilter;
        page?: number;
        limit?: number;
      } = {},
      overrides: UserApiOverrides = {},
    ) {
      return request<PredictionMarketHistoryResponse>(
        `${USER_API_ROUTES.marketHistory}${toSearch({
          status: params.status,
          page: params.page,
          limit: params.limit,
        })}`,
        { cache: "no-store" },
        overrides,
      );
    },
    getPredictionMarket(marketId: number, overrides: UserApiOverrides = {}) {
      return request<PredictionMarketDetail>(
        `${USER_API_ROUTES.markets}/${marketId}`,
        { cache: "no-store" },
        overrides,
      );
    },
    placePredictionPosition(
      marketId: number,
      payload: PredictionMarketPositionRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<PredictionMarketPositionMutationResponse>(
        `${USER_API_ROUTES.markets}/${marketId}/positions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
        overrides,
      );
    },
    sellPredictionPosition(
      marketId: number,
      positionId: number,
      overrides: UserApiOverrides = {},
    ) {
      return request<PredictionMarketPositionMutationResponse>(
        `${USER_API_ROUTES.markets}/${marketId}/positions/${positionId}/sell`,
        {
          method: "POST",
          cache: "no-store",
        },
        overrides,
      );
    },
    getDrawOverview(overrides: UserApiOverrides = {}) {
      return request<DrawOverviewResponse>(
        USER_API_ROUTES.drawOverview,
        {},
        overrides,
      );
    },
    getDrawCatalog(overrides: UserApiOverrides = {}) {
      return request<DrawCatalogResponse>(
        USER_API_ROUTES.drawCatalog,
        { cache: "no-store" },
        overrides,
      );
    },
    runDraw(payload: DrawRequest = {}, overrides: UserApiOverrides = {}) {
      return request<DrawResult>(
        USER_API_ROUTES.draw,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        overrides,
      );
    },
    playQuickEight(
      payload: QuickEightRequest,
      overrides: UserApiOverrides = {},
    ) {
      return request<QuickEightRound>(
        USER_API_ROUTES.quickEight,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        overrides,
      );
    },
    playDraw(payload: DrawPlayRequest, overrides: UserApiOverrides = {}) {
      return request<DrawPlayResponse>(
        USER_API_ROUTES.drawPlay,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        overrides,
      );
    },
  };
}
