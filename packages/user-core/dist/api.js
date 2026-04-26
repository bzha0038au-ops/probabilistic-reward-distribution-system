export const USER_API_ROUTES = {
    auth: {
        register: '/auth/register',
        session: '/auth/user/session',
        sessions: '/auth/user/sessions',
        sessionsRevokeAll: '/auth/user/sessions/revoke-all',
        passwordResetRequest: '/auth/password-reset/request',
        passwordResetConfirm: '/auth/password-reset/confirm',
        emailVerificationRequest: '/auth/email-verification/request',
        emailVerificationConfirm: '/auth/email-verification/confirm',
    },
    wallet: '/wallet',
    draw: '/draw',
};
export const LOCAL_API_BASE_URLS = {
    web: 'http://localhost:4000',
    ios: 'http://127.0.0.1:4000',
    android: 'http://10.0.2.2:4000',
};
const fallbackError = { message: 'Request failed.' };
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
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
        headers.set('x-locale', locale);
    }
    if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, { auth: false });
        },
        createSession(payload) {
            return request(USER_API_ROUTES.auth.session, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }, { auth: false });
        },
        getCurrentSession(overrides = {}) {
            return request(USER_API_ROUTES.auth.session, { cache: 'no-store' }, overrides);
        },
        deleteCurrentSession(overrides = {}) {
            return request(USER_API_ROUTES.auth.session, {
                method: 'DELETE',
                cache: 'no-store',
            }, overrides);
        },
        listSessions(overrides = {}) {
            return request(USER_API_ROUTES.auth.sessions, { cache: 'no-store' }, overrides);
        },
        revokeSession(sessionId, overrides = {}) {
            return request(`${USER_API_ROUTES.auth.sessions}/${encodeURIComponent(sessionId)}`, {
                method: 'DELETE',
                cache: 'no-store',
            }, overrides);
        },
        revokeAllSessions(overrides = {}) {
            return request(USER_API_ROUTES.auth.sessionsRevokeAll, {
                method: 'POST',
                cache: 'no-store',
            }, overrides);
        },
        requestPasswordReset(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.passwordResetRequest, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }, {
                ...overrides,
                auth: false,
            });
        },
        confirmPasswordReset(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.passwordResetConfirm, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }, {
                ...overrides,
                auth: false,
            });
        },
        requestEmailVerification(payload = {}, overrides = {}) {
            return request(USER_API_ROUTES.auth.emailVerificationRequest, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }, overrides);
        },
        confirmEmailVerification(payload, overrides = {}) {
            return request(USER_API_ROUTES.auth.emailVerificationConfirm, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }, {
                ...overrides,
                auth: false,
            });
        },
        getWalletBalance(overrides = {}) {
            return request(USER_API_ROUTES.wallet, {}, overrides);
        },
        runDraw(payload = {}, overrides = {}) {
            return request(USER_API_ROUTES.draw, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, overrides);
        },
    };
}
