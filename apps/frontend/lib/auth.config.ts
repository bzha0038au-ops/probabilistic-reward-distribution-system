import type { NextAuthConfig } from 'next-auth';
import { USER_API_ROUTES } from '@/lib/api/user';
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from '@/lib/auth/session-cookie';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const secureCookies = process.env.NODE_ENV === 'production';

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
    async authorized({ auth, request: { nextUrl } }) {
      const isAppRoute = nextUrl.pathname.startsWith('/app');
      const isAuthPage =
        nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');
      const backendToken =
        auth && typeof auth === 'object' && 'backendToken' in auth
          ? ((auth as { backendToken?: string }).backendToken ?? null)
          : null;
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
      if (user) {
        token.role = (user as { role?: string }).role ?? 'user';
        token.userId = Number((user as { id?: string | number }).id ?? 0);
        token.backendToken = (user as { backendToken?: string }).backendToken;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string) ?? 'user';
        session.user.id = (token.userId as number) ?? 0;
      }

      session.backendToken = token.backendToken as string | undefined;

      return session;
    },
  },
} satisfies NextAuthConfig;
