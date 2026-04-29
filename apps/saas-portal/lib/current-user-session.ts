import "server-only";

import { redirect } from "next/navigation";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";

import { apiRequestServer } from "@/lib/api/server";
import { USER_API_ROUTES } from "@/lib/api/user";
import { buildLegalPath, buildLoginPath } from "@/lib/navigation";

export async function getCurrentUserSession() {
  return apiRequestServer<CurrentUserSessionResponse>(
    USER_API_ROUTES.auth.session,
    { cache: "no-store" },
  );
}

export async function requireCurrentUserSession(options: {
  returnTo?: string | null;
  allowPendingLegal?: boolean;
} = {}) {
  const currentSession = await getCurrentUserSession();
  if (!currentSession.ok) {
    redirect(buildLoginPath(options.returnTo));
  }

  if (
    !options.allowPendingLegal &&
    currentSession.data.legal.requiresAcceptance
  ) {
    redirect(buildLegalPath(options.returnTo));
  }

  return currentSession.data;
}
