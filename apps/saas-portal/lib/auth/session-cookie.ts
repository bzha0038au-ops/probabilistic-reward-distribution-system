export const AUTH_SESSION_COOKIE_NAME = 'saas-portal.authjs.session-token';
export const SECURE_AUTH_SESSION_COOKIE_NAME =
  '__Secure-saas-portal.authjs.session-token';

const AUTH_SESSION_COOKIE_NAMES = [
  SECURE_AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_COOKIE_NAME,
] as const;

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const resolveAuthSessionCookieName = (
  cookieHeader?: string | null
) => {
  const headerValue = cookieHeader ?? '';

  for (const cookieName of AUTH_SESSION_COOKIE_NAMES) {
    const matcher = new RegExp(
      `(?:^|;\\s*)${escapeForRegExp(cookieName)}(?:=|\\.)`
    );
    if (matcher.test(headerValue)) {
      return cookieName;
    }
  }

  return process.env.NODE_ENV === 'production'
    ? SECURE_AUTH_SESSION_COOKIE_NAME
    : AUTH_SESSION_COOKIE_NAME;
};
