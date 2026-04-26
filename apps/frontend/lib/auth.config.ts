import type { NextAuthConfig } from 'next-auth';
import { USER_API_ROUTES } from '@/lib/api/user';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';
import { getBackendAccessTokenFromRequest } from '@/lib/auth/backend-token';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const secureCookies = process.env.NODE_ENV === 'production';

type AuthTokenState = {
  backendToken?: string;
  role?: string;
  userId?: number;
};

type AuthorizedUserState = {
  backendToken?: string;
  id?: string | number;
  role?: string;
};

const hasActiveBackendSession = async (backendToken?: string | null) => {
  if (!backendToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${USER_API_ROUTES.auth.session}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${backendToken}`,
      },
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
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
      const isAppRoute = nextUrl.pathname.startsWith('/app');
      const isAuthPage =
        nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');
      const backendToken = await getBackendAccessTokenFromRequest(request);
      const isLoggedIn = await hasActiveBackendSession(backendToken);

      if (isAppRoute) {
        return isLoggedIn;
      }

      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL('/app', nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      const authToken = token as typeof token & AuthTokenState;

      if (user) {
        const authorizedUser = user as AuthorizedUserState;
        authToken.role = authorizedUser.role ?? 'user';
        authToken.userId = Number(authorizedUser.id ?? 0);
        authToken.backendToken = authorizedUser.backendToken;
      }

      return authToken;
    },
    session({ session, token }) {
      const authToken = token as typeof token & AuthTokenState;

      if (session.user) {
        session.user.role = authToken.role ?? 'user';
        session.user.id = authToken.userId ?? 0;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
