const BACKEND_TOKEN_COOKIE_NAME = 'reward.backend-token';
const DEFAULT_BACKEND_TOKEN_TTL_SECONDS = 60 * 60 * 8;

const secureCookies = process.env.NODE_ENV === 'production';

const parseCookieHeader = (cookieHeader?: string | null) =>
  Object.fromEntries(
    (cookieHeader ?? '')
      .split(';')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex === -1) {
          return [segment, ''];
        }

        const key = segment.slice(0, separatorIndex).trim();
        const value = segment.slice(separatorIndex + 1).trim();
        return [key, value];
      })
  );

export const getBackendTokenCookieName = () => BACKEND_TOKEN_COOKIE_NAME;

export const getBackendTokenCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: secureCookies,
  maxAge: Number(process.env.USER_SESSION_TTL ?? DEFAULT_BACKEND_TOKEN_TTL_SECONDS),
});

export const readBackendTokenCookie = (cookieHeader?: string | null) => {
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[BACKEND_TOKEN_COOKIE_NAME];
  return token ? decodeURIComponent(token) : null;
};
