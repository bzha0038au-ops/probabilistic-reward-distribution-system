export type AuthLinkIntent =
  | {
      screen: 'resetPassword';
      token: string;
      rawUrl: string;
    }
  | {
      screen: 'verifyEmail';
      token: string;
      rawUrl: string;
    };

const normalizeRoute = (value: string) =>
  value
    .split('/')
    .filter(Boolean)
    .join('/')
    .toLowerCase();

const readRoute = (url: URL) => {
  const pathname = normalizeRoute(url.pathname);
  const host = normalizeRoute(url.host);

  if (pathname) {
    return pathname;
  }

  return host;
};

export const resolveAuthTokenInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = parseAuthLink(trimmed);
  return parsed?.token ?? trimmed;
};

export function parseAuthLink(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const token = parsed.searchParams.get('token')?.trim();
    const route = readRoute(parsed);

    if (!token) {
      return null;
    }

    if (route.endsWith('reset-password')) {
      return {
        screen: 'resetPassword',
        token,
        rawUrl: trimmed,
      } satisfies AuthLinkIntent;
    }

    if (route.endsWith('verify-email')) {
      return {
        screen: 'verifyEmail',
        token,
        rawUrl: trimmed,
      } satisfies AuthLinkIntent;
    }

    return null;
  } catch {
    return null;
  }
}
