import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserSessionResponse } from "@reward/shared-types/auth";
import { USER_API_ROUTES } from "@/lib/api/user";
import { authConfig } from "@/lib/auth.config";
import { apiRequestServer } from "@/lib/api/server";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().toLowerCase() ?? "";
        const password = credentials?.password?.toString() ?? "";

        if (!email || !password) {
          return null;
        }

        const result = await apiRequestServer<UserSessionResponse>(
          USER_API_ROUTES.auth.session,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
          },
          { auth: false },
        );

        if (!result.ok || !result.data?.token || !result.data.user) {
          return null;
        }

        return {
          id: result.data.user.id,
          email: result.data.user.email,
          role: result.data.user.role,
          backendToken: result.data.token,
        };
      },
    }),
  ],
});
