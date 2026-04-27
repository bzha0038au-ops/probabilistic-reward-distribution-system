import { redirect } from "next/navigation";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";

import { USER_API_ROUTES } from "@/lib/api/user";
import { apiRequestServer } from "@/lib/api/server";

export async function requireCurrentUserSession() {
  const currentSession = await apiRequestServer<CurrentUserSessionResponse>(
    USER_API_ROUTES.auth.session,
    { cache: "no-store" },
  );

  if (!currentSession.ok) {
    redirect("/login");
  }

  return currentSession.data;
}
