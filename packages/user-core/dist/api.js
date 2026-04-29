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
};
export const LOCAL_API_BASE_URLS = {
    web: "http://localhost:4000",
    ios: "http://localhost:4000",
    android: "http://10.0.2.2:4000",
};
const fallbackError = { message: "Request failed." };
const networkFailureCode = "NETWORK_REQUEST_FAILED";
const genericNetworkFailureMessage = "Network request failed. Check that the API server is reachable and try again.";
const normalizeRequestFailure = (error) => {
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
const toRequestFailureResult = (error) => ({
    ok: false,
    error: normalizeRequestFailure(error),
    status: 0,
});
const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
const resolveRealtimeProtocol = (protocol) => protocol === "https:" ? "wss:" : "ws:";
const toSearch = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "")
            continue;
        search.set(key, String(value));
    }
    const output = search.toString();
    return output ? `?${output}` : "";
};
export const resolveLocalApiBaseUrl = (platform) => LOCAL_API_BASE_URLS[platform];
export const resolveUserRealtimeUrl = (payload) => {
    const url = new URL(USER_REALTIME_ROUTE, `${trimTrailingSlash(payload.baseUrl)}/`);
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
export const parseApiResponse = async (response) => {
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
        data: payload.data,
        requestId: payload?.requestId,
        status: response.status,
    };
};
export async function requestUserApi({ path, baseUrl, init = {}, locale, authToken, fetchImpl = fetch, }) {
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
        return parseApiResponse(response);
    }
    catch (error) {
        return toRequestFailureResult(error);
    }
}
export function createUserApiClient(runtime) {
    const resolveLocale = async (overrides) => {
        if (overrides.locale !== undefined) {
            return overrides.locale;
        }
        return runtime.getLocale ? await runtime.getLocale() : undefined;
    };
    const resolveAuthToken = async (overrides) => {
        if (overrides.auth === false) {
            return null;
        }
        if (overrides.authToken !== undefined) {
            return overrides.authToken;
        }
        return runtime.getAuthToken ? await runtime.getAuthToken() : undefined;
    };
    const request = async (path, init = {}, overrides = {}) => {
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
            return requestUserApi({
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
        }
        catch (error) {
            return toRequestFailureResult(error);
        }
    };
    return {
        request,
        register(payload) {
            return request(USER_API_ROUTES.auth.register, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, { auth: false });
        },
        getCurrentLegalDocuments(overrides = {}) {
            return request(USER_API_ROUTES.legal.current, { cache: "no-store" }, {
                ...overrides,
                auth: false,
            });
        },
        acceptCurrentLegalDocuments(payload, overrides = {}) {
            return request(USER_API_ROUTES.legal.acceptances, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        createSession(payload) {
            return request(USER_API_ROUTES.auth.session, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, { auth: false });
        },
        getCurrentSession(overrides = {}) {
            return request(USER_API_ROUTES.auth.session, { cache: "no-store" }, overrides);
        },
        getUserRealtimeToken(overrides = {}) {
            return request(USER_API_ROUTES.auth.realtimeToken, { cache: "no-store" }, overrides);
        },
        deleteCurrentSession(overrides = {}) {
            return request(USER_API_ROUTES.auth.session, {
                method: "DELETE",
                cache: "no-store",
            }, overrides);
        },
        listSessions(overrides = {}) {
            return request(USER_API_ROUTES.auth.sessions, { cache: "no-store" }, overrides);
        },
        revokeSession(sessionId, overrides = {}) {
            return request(`${USER_API_ROUTES.auth.sessions}/${encodeURIComponent(sessionId)}`, {
                method: "DELETE",
                cache: "no-store",
            }, overrides);
        },
        revokeAllSessions(overrides = {}) {
            return request(USER_API_ROUTES.auth.sessionsRevokeAll, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        getUserMfaStatus(overrides = {}) {
            return request(USER_API_ROUTES.auth.mfaStatus, { cache: "no-store" }, overrides);
        },
        createUserMfaEnrollment(overrides = {}) {
            return request(USER_API_ROUTES.auth.mfaEnrollment, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        verifyUserMfa(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.mfaVerify, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        disableUserMfa(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.mfaDisable, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        requestPasswordReset(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.passwordResetRequest, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, {
                ...overrides,
                auth: false,
            });
        },
        confirmPasswordReset(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.passwordResetConfirm, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, {
                ...overrides,
                auth: false,
            });
        },
        requestEmailVerification(payload = {}, overrides = {}) {
            return request(USER_API_ROUTES.auth.emailVerificationRequest, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        confirmEmailVerification(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.emailVerificationConfirm, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, {
                ...overrides,
                auth: false,
            });
        },
        requestPhoneVerification(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.phoneVerificationRequest, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        confirmPhoneVerification(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.phoneVerificationConfirm, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        listCommunityThreads(page, limit, overrides = {}) {
            return request(`${USER_API_ROUTES.communityThreads}${toSearch({ page, limit })}`, { cache: "no-store" }, overrides);
        },
        getCommunityThread(threadId, page, limit, overrides = {}) {
            return request(`${USER_API_ROUTES.communityThreads}/${threadId}${toSearch({
                page,
                limit,
            })}`, { cache: "no-store" }, overrides);
        },
        createCommunityThread(payload, overrides = {}) {
            return request(USER_API_ROUTES.communityThreads, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        createCommunityPost(threadId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.communityThreads}/${threadId}/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        getWalletBalance(overrides = {}) {
            return request(USER_API_ROUTES.wallet, {}, overrides);
        },
        getTransactionHistory(limit, overrides = {}) {
            return request(`${USER_API_ROUTES.transactions}${toSearch({ limit })}`, { cache: "no-store" }, overrides);
        },
        listNotifications(params = {}, overrides = {}) {
            return request(`${USER_API_ROUTES.notifications}${toSearch({
                limit: params.limit,
                unreadOnly: params.unreadOnly,
            })}`, { cache: "no-store" }, overrides);
        },
        getNotificationSummary(overrides = {}) {
            return request(USER_API_ROUTES.notificationSummary, { cache: "no-store" }, overrides);
        },
        markNotificationRead(notificationId, overrides = {}) {
            return request(`${USER_API_ROUTES.notifications}/${notificationId}/read`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        markAllNotificationsRead(overrides = {}) {
            return request(`${USER_API_ROUTES.notifications}/read-all`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        listNotificationPreferences(overrides = {}) {
            return request(USER_API_ROUTES.notificationPreferences, { cache: "no-store" }, overrides);
        },
        updateNotificationPreferences(payload, overrides = {}) {
            return request(USER_API_ROUTES.notificationPreferences, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        registerNotificationPushDevice(payload, overrides = {}) {
            return request(USER_API_ROUTES.notificationPushDevices, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        unregisterNotificationPushDevice(payload, overrides = {}) {
            return request(USER_API_ROUTES.notificationPushDevices, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        getKycProfile(overrides = {}) {
            return request(USER_API_ROUTES.kycProfile, { cache: "no-store" }, overrides);
        },
        submitKycProfile(payload, overrides = {}) {
            return request(USER_API_ROUTES.kycProfile, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        listBankCards(overrides = {}) {
            return request(USER_API_ROUTES.bankCards, { cache: "no-store" }, overrides);
        },
        createBankCard(payload, overrides = {}) {
            return request(USER_API_ROUTES.bankCards, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        setDefaultBankCard(bankCardId, overrides = {}) {
            return request(`${USER_API_ROUTES.bankCards}/${bankCardId}/default`, {
                method: "PATCH",
                cache: "no-store",
            }, overrides);
        },
        listCryptoDepositChannels(overrides = {}) {
            return request(USER_API_ROUTES.cryptoDepositChannels, { cache: "no-store" }, overrides);
        },
        createCryptoDeposit(payload, overrides = {}) {
            return request(USER_API_ROUTES.cryptoDeposits, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        listCryptoWithdrawAddresses(overrides = {}) {
            return request(USER_API_ROUTES.cryptoWithdrawAddresses, { cache: "no-store" }, overrides);
        },
        createCryptoWithdrawAddress(payload, overrides = {}) {
            return request(USER_API_ROUTES.cryptoWithdrawAddresses, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        setDefaultCryptoWithdrawAddress(payoutMethodId, overrides = {}) {
            return request(`${USER_API_ROUTES.cryptoWithdrawAddresses}/${payoutMethodId}/default`, {
                method: "PATCH",
                cache: "no-store",
            }, overrides);
        },
        listTopUps(limit, overrides = {}) {
            return request(`${USER_API_ROUTES.topUps}${toSearch({ limit })}`, { cache: "no-store" }, overrides);
        },
        createTopUp(payload, overrides = {}) {
            return request(USER_API_ROUTES.topUps, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        listWithdrawals(limit, overrides = {}) {
            return request(`${USER_API_ROUTES.withdrawals}${toSearch({ limit })}`, { cache: "no-store" }, overrides);
        },
        createWithdrawal(payload, overrides = {}) {
            return request(USER_API_ROUTES.withdrawals, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        createCryptoWithdrawal(payload, overrides = {}) {
            return request(USER_API_ROUTES.cryptoWithdrawals, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        getBlackjackOverview(overrides = {}) {
            return request(USER_API_ROUTES.blackjack, { cache: "no-store" }, overrides);
        },
        getHoldemTables(overrides = {}) {
            return request(USER_API_ROUTES.holdemTables, { cache: "no-store" }, overrides);
        },
        getHoldemTable(tableId, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}`, { cache: "no-store" }, overrides);
        },
        getHoldemTableMessages(tableId, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/messages`, { cache: "no-store" }, overrides);
        },
        reportHoldemRealtimeObservations(payload, overrides = {}) {
            return request(USER_API_ROUTES.holdemRealtimeObservations, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
                keepalive: true,
            }, overrides);
        },
        touchHoldemTablePresence(tableId, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/presence`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        setHoldemSeatMode(tableId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/seat-mode`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        postHoldemTableMessage(tableId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        createHoldemTable(payload, overrides = {}) {
            return request(USER_API_ROUTES.holdemTables, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        joinHoldemTable(tableId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        leaveHoldemTable(tableId, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/leave`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        startHoldemTable(tableId, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/start`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        actOnHoldemTable(tableId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.holdemTables}/${tableId}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        getHandHistory(roundId, overrides = {}) {
            return request(`${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}`, { cache: "no-store" }, overrides);
        },
        getHandHistoryEvidenceBundle(roundId, overrides = {}) {
            return request(`${USER_API_ROUTES.handHistory}/${encodeURIComponent(roundId)}/evidence-bundle`, { cache: "no-store" }, overrides);
        },
        startBlackjack(payload, overrides = {}) {
            return request(USER_API_ROUTES.blackjackStart, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        actOnBlackjack(gameId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.blackjack}/${gameId}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        getRewardCenter(overrides = {}) {
            return request(USER_API_ROUTES.rewardCenter, { cache: "no-store" }, overrides);
        },
        getExperimentVariant(expKey, overrides = {}) {
            return request(`${USER_API_ROUTES.experiments}/${encodeURIComponent(expKey)}/variant`, { cache: "no-store" }, overrides);
        },
        getFairnessCommit(overrides = {}) {
            return request(USER_API_ROUTES.fairnessCommit, { cache: "no-store" }, {
                ...overrides,
                auth: false,
            });
        },
        revealFairnessSeed(epoch, overrides = {}) {
            return request(`${USER_API_ROUTES.fairnessReveal}${toSearch({ epoch })}`, { cache: "no-store" }, {
                ...overrides,
                auth: false,
            });
        },
        getPlayMode(gameKey, overrides = {}) {
            return request(`${USER_API_ROUTES.playModes}/${gameKey}`, { cache: "no-store" }, overrides);
        },
        setPlayMode(gameKey, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.playModes}/${gameKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        claimRewardMission(missionId, overrides = {}) {
            return request(USER_API_ROUTES.rewardClaim, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missionId }),
                cache: "no-store",
            }, overrides);
        },
        listPredictionMarkets(overrides = {}) {
            return request(USER_API_ROUTES.markets, { cache: "no-store" }, overrides);
        },
        getPredictionMarketPortfolio(status, overrides = {}) {
            return request(`${USER_API_ROUTES.marketPortfolio}${toSearch({ status })}`, { cache: "no-store" }, overrides);
        },
        getPredictionMarketHistory(params = {}, overrides = {}) {
            return request(`${USER_API_ROUTES.marketHistory}${toSearch({
                status: params.status,
                page: params.page,
                limit: params.limit,
            })}`, { cache: "no-store" }, overrides);
        },
        getPredictionMarket(marketId, overrides = {}) {
            return request(`${USER_API_ROUTES.markets}/${marketId}`, { cache: "no-store" }, overrides);
        },
        placePredictionPosition(marketId, payload, overrides = {}) {
            return request(`${USER_API_ROUTES.markets}/${marketId}/positions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                cache: "no-store",
            }, overrides);
        },
        sellPredictionPosition(marketId, positionId, overrides = {}) {
            return request(`${USER_API_ROUTES.markets}/${marketId}/positions/${positionId}/sell`, {
                method: "POST",
                cache: "no-store",
            }, overrides);
        },
        getDrawOverview(overrides = {}) {
            return request(USER_API_ROUTES.drawOverview, {}, overrides);
        },
        getDrawCatalog(overrides = {}) {
            return request(USER_API_ROUTES.drawCatalog, { cache: "no-store" }, overrides);
        },
        runDraw(payload = {}, overrides = {}) {
            return request(USER_API_ROUTES.draw, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, overrides);
        },
        playQuickEight(payload, overrides = {}) {
            return request(USER_API_ROUTES.quickEight, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, overrides);
        },
        playDraw(payload, overrides = {}) {
            return request(USER_API_ROUTES.drawPlay, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, overrides);
        },
    };
}
