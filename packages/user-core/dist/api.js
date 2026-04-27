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
};
export const LOCAL_API_BASE_URLS = {
    web: "http://localhost:4000",
    ios: "http://localhost:4000",
    android: "http://10.0.2.2:4000",
};
const fallbackError = { message: "Request failed." };
const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
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
    const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
        ...init,
        headers,
    });
    return parseApiResponse(response);
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
    const request = async (path, init = {}, overrides = {}) => requestUserApi({
        path,
        init,
        baseUrl: overrides.baseUrl ?? runtime.baseUrl,
        locale: await resolveLocale(overrides),
        authToken: await resolveAuthToken(overrides),
        fetchImpl: overrides.fetchImpl ?? runtime.fetchImpl,
    });
    return {
        request,
        register(payload) {
            return request(USER_API_ROUTES.auth.register, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, { auth: false });
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
        getWalletBalance(overrides = {}) {
            return request(USER_API_ROUTES.wallet, {}, overrides);
        },
        getTransactionHistory(limit, overrides = {}) {
            return request(`${USER_API_ROUTES.transactions}${toSearch({ limit })}`, { cache: "no-store" }, overrides);
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
        claimRewardMission(missionId, overrides = {}) {
            return request(USER_API_ROUTES.rewardClaim, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missionId }),
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
