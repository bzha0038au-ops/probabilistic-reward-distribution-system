import type { NextAuthConfig } from 'next-auth';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';
import { getBackendAccessTokenFromRequest } from '@/lib/auth/backend-token';
import { hasValidBackendAccessToken } from '@/lib/auth/backend-session';
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
      const isLoggedIn = await hasValidBackendAccessToken(backendToken);

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
        Object.assign(session.user, {
          role: authToken.role ?? 'user',
          id: authToken.userId ?? 0,
        });
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
