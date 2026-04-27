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
  DrawCatalogResponse,
  DrawPlayRequest,
  DrawPlayResponse,
  DrawRequest,
  DrawOverviewResponse,
  DrawResult,
} from "@reward/shared-types/draw";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
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
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  LedgerEntryRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

export type ApiResult<T> = ApiResponse<T>;

export const USER_API_ROUTES = {
  auth: {
    register: "/auth/register",
    session: "/auth/user/session",
    sessions: "/auth/user/sessions",
    sessionsRevokeAll: "/auth/user/sessions/revoke-all",
    passwordResetRequest: "/auth/password-reset/request",
    passwordResetConfirm: "/auth/password-reset/confirm",
    emailVerificationRequest: "/auth/email-verification/request",
    emailVerificationConfirm: "/auth/email-verification/confirm",
    phoneVerificationRequest: "/auth/phone-verification/request",
    phoneVerificationConfirm: "/auth/phone-verification/confirm",
  },
  wallet: "/wallet",
  transactions: "/transactions",
  rewardCenter: "/rewards/center",
  rewardClaim: "/rewards/claim",
  fairnessCommit: "/fairness/commit",
  fairnessReveal: "/fairness/reveal",
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
} as const;

export type SupportedUserPlatform = "web" | "ios" | "android";

export const LOCAL_API_BASE_URLS: Record<SupportedUserPlatform, string> = {
  web: "http://localhost:4000",
  ios: "http://localhost:4000",
  android: "http://10.0.2.2:4000",
};

const fallbackError: ApiError = { message: "Request failed." };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const toSearch = (params: Record<string, string | number | undefined>) => {
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

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
    ...init,
    headers,
  });

  return parseApiResponse<T>(response);
}

type AsyncValue<T> = T | Promise<T>;

export type UserApiRuntime = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getLocale?: () => AsyncValue<string | null | undefined>;
  getAuthToken?: () => AsyncValue<string | null | undefined>;
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
  ) =>
    requestUserApi<T>({
      path,
      init,
      baseUrl: overrides.baseUrl ?? runtime.baseUrl,
      locale: await resolveLocale(overrides),
      authToken: await resolveAuthToken(overrides),
      fetchImpl: overrides.fetchImpl ?? runtime.fetchImpl,
    });

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
    setDefaultBankCard(
      bankCardId: number,
      overrides: UserApiOverrides = {},
    ) {
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
    createTopUp(
      payload: TopUpCreateRequest,
      overrides: UserApiOverrides = {},
    ) {
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
