import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAdminRoute = nextUrl.pathname.startsWith('/admin');
      const isAppRoute = nextUrl.pathname.startsWith('/app');
      const isAuthPage =
        nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');

      if (isAdminRoute) {
        return isLoggedIn && auth?.user?.role === 'admin';
      }

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
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string) ?? 'user';
        session.user.id = (token.userId as number) ?? 0;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
