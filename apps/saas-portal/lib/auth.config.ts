import type { NextAuthConfig } from 'next-auth';
import type { CurrentUserSessionResponse } from '@reward/shared-types/auth';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';
import { normalizeBackendPath } from '@/lib/api/proxy';
import { USER_API_ROUTES, parseApiResponse } from '@/lib/api/user';
import { getBackendAccessTokenFromRequest } from '@/lib/auth/backend-token';
import { hasValidBackendAccessToken } from '@/lib/auth/backend-session';
import {
  buildLegalPath,
  buildLoginPath,
  PORTAL_HOME_PATH,
  PORTAL_LEGAL_PATH,
  PORTAL_LOGIN_PATH,
  sanitizePortalReturnTo,
} from '@/lib/navigation';

const secureCookies = process.env.NODE_ENV === 'production';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

type AuthTokenState = {
  backendToken?: string;
  email?: string;
  role?: string;
  userId?: number;
};

type AuthorizedUserState = {
  backendToken?: string;
  email?: string | null;
  id?: string | number;
  role?: string;
};

const buildLocalPath = (pathname: string, search: string) =>
  search ? `${pathname}${search}` : pathname;

const withTrailingSlash = (value: string) =>
  value.endsWith('/') ? value : `${value}/`;

const buildBackendUrl = (path: string, baseUrl = API_BASE_URL) =>
  new URL(
    normalizeBackendPath(path).slice(1),
    withTrailingSlash(baseUrl),
  ).toString();

const resolveCurrentPortalPath = (nextUrl: URL) =>
  buildLocalPath(nextUrl.pathname, nextUrl.search);

const resolvePostGatePath = (nextUrl: URL) => {
  if (nextUrl.pathname.startsWith(PORTAL_LOGIN_PATH)) {
    return sanitizePortalReturnTo(
      nextUrl.searchParams.get('callbackUrl'),
      PORTAL_HOME_PATH,
    );
  }

  if (nextUrl.pathname.startsWith(PORTAL_LEGAL_PATH)) {
    return sanitizePortalReturnTo(
      nextUrl.searchParams.get('returnTo'),
      PORTAL_HOME_PATH,
    );
  }

  return PORTAL_HOME_PATH;
};

const loadCurrentUserSession = async (backendToken: string) => {
  try {
    const response = await fetch(buildBackendUrl(USER_API_ROUTES.auth.session), {
      headers: {
        Authorization: `Bearer ${backendToken}`,
      },
      cache: 'no-store',
    });
    const result =
      await parseApiResponse<CurrentUserSessionResponse>(response);

    if (!result.ok) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
};

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: secureCookies
        ? SECURE_AUTH_SESSION_COOKIE_NAME
        : AUTH_SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies,
      },
    },
  },
  providers: [],
  callbacks: {
    async authorized({ request }) {
      const { nextUrl } = request;
      const currentPath = resolveCurrentPortalPath(nextUrl);
      const isPortalRoute = nextUrl.pathname.startsWith('/portal');
      const isAuthPage = nextUrl.pathname.startsWith('/login');
      const isLegalPage = nextUrl.pathname.startsWith('/legal');
      const backendToken = await getBackendAccessTokenFromRequest(request);
      const isLoggedIn = await hasValidBackendAccessToken(backendToken);

      if (!isLoggedIn || !backendToken) {
        if (isPortalRoute || isLegalPage) {
          return Response.redirect(new URL(buildLoginPath(currentPath), nextUrl));
        }

        return true;
      }

      const currentSession = await loadCurrentUserSession(backendToken);
      if (!currentSession) {
        if (isPortalRoute || isLegalPage) {
          return Response.redirect(new URL(buildLoginPath(currentPath), nextUrl));
        }

        return true;
      }

      if (currentSession.legal.requiresAcceptance) {
        if (isLegalPage) {
          return true;
        }

        return Response.redirect(
          new URL(buildLegalPath(currentPath), nextUrl),
        );
      }

      if (isAuthPage || isLegalPage) {
        return Response.redirect(
          new URL(resolvePostGatePath(nextUrl), nextUrl),
        );
      }

      if (isPortalRoute) {
        return true;
      }

      return true;
    },
    jwt({ token, user }) {
      const authToken = token as typeof token & AuthTokenState;

      if (user) {
        const authorizedUser = user as AuthorizedUserState;
        authToken.email = authorizedUser.email ?? undefined;
        authToken.role = authorizedUser.role ?? 'user';
        authToken.userId = Number(authorizedUser.id ?? 0);
        authToken.backendToken = authorizedUser.backendToken;
      }

      return authToken;
    },
    session({ session, token }) {
      const authToken = token as typeof token & AuthTokenState;

      if (session.user) {
        Object.assign(session.user, {
          ...(authToken.email ? { email: authToken.email } : {}),
          role: authToken.role ?? 'user',
          id: authToken.userId ?? 0,
        });
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
