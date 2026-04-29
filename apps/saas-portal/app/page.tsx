import { redirect } from "next/navigation";

import { getCurrentUserSession } from "@/lib/current-user-session";
import { buildLegalPath, buildLoginPath } from "@/lib/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const invite = resolvedSearchParams?.invite?.trim();
  const portalPath = invite
    ? `/portal?invite=${encodeURIComponent(invite)}`
    : "/portal";
  const currentSession = await getCurrentUserSession();

  if (currentSession.ok) {
    if (currentSession.data.legal.requiresAcceptance) {
      redirect(buildLegalPath(portalPath));
    }
    redirect(portalPath);
  }

  redirect(buildLoginPath(portalPath));
}
