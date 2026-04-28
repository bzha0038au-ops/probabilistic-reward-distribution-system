import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth();
  const invite = resolvedSearchParams?.invite?.trim();
  const portalPath = invite
    ? `/portal?invite=${encodeURIComponent(invite)}`
    : "/portal";

  if (session?.user) {
    redirect(portalPath);
  }

  redirect(`/login?callbackUrl=${encodeURIComponent(portalPath)}`);
}
