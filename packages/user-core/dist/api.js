export const USER_API_ROUTES = {
    auth: {
        register: '/auth/register',
        session: '/auth/user/session',
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
        };
    }
    return {
        ok: true,
        data: payload.data,
        requestId: payload?.requestId,
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
        getWalletBalance() {
            return request(USER_API_ROUTES.wallet);
        },
        runDraw(payload = {}) {
            return request(USER_API_ROUTES.draw, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        },
    };
}
