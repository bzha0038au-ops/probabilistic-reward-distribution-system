import { redirect } from "next/navigation";
import type { CurrentLegalDocumentsResponse } from "@reward/shared-types/legal";

import { AuthPageShell } from "@/components/auth-page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiRequestServer } from "@/lib/api/server";
import { requireCurrentUserSession } from "@/lib/current-user-session";
import { USER_API_ROUTES } from "@/lib/api/user";
import {
  buildLegalPath,
  PORTAL_HOME_PATH,
  sanitizePortalReturnTo,
} from "@/lib/navigation";

const formatLegalSlug = (slug: string) =>
  slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

async function loadCurrentLegalDocuments() {
  return apiRequestServer<CurrentLegalDocumentsResponse>(
    USER_API_ROUTES.legal.current,
    { cache: "no-store" },
    { auth: false },
  );
}

async function acceptLegalAction(formData: FormData) {
  "use server";

  const returnTo = sanitizePortalReturnTo(
    typeof formData.get("returnTo") === "string"
      ? String(formData.get("returnTo"))
      : null,
    PORTAL_HOME_PATH,
  );
  const currentSession = await requireCurrentUserSession({
    allowPendingLegal: true,
    returnTo: buildLegalPath(returnTo),
  });
  if (!currentSession.legal.requiresAcceptance) {
    redirect(returnTo);
  }

  const documentsResult = await loadCurrentLegalDocuments();
  if (!documentsResult.ok) {
    redirect(
      buildLegalPath(returnTo, "Unable to load the current legal documents."),
    );
  }

  const documents = documentsResult.data.items;
  for (const document of documents) {
    if (formData.get(`accept:${document.id}`) !== "on") {
      redirect(
        buildLegalPath(
          returnTo,
          "Accept every current legal document to continue.",
        ),
      );
    }
  }

  const result = await apiRequestServer(USER_API_ROUTES.legal.acceptances, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acceptances: documents.map((document) => ({
        slug: document.slug,
        version: document.version,
      })),
    }),
  });

  if (!result.ok) {
    redirect(
      buildLegalPath(
        returnTo,
        result.error?.message ?? "Failed to accept the current legal documents.",
      ),
    );
  }

  redirect(returnTo);
}

export default async function LegalPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; returnTo?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnTo = sanitizePortalReturnTo(
    resolvedSearchParams?.returnTo,
    PORTAL_HOME_PATH,
  );
  const currentSession = await requireCurrentUserSession({
    allowPendingLegal: true,
    returnTo: buildLegalPath(returnTo),
  });

  if (!currentSession.legal.requiresAcceptance) {
    redirect(returnTo);
  }

  const documentsResult = await loadCurrentLegalDocuments();
  const documents = documentsResult.ok ? documentsResult.data.items : [];
  const errorMessage =
    resolvedSearchParams?.error ??
    (!documentsResult.ok
      ? "Unable to load the current legal documents."
      : null);

  return (
    <AuthPageShell>
      <div className="w-full max-w-4xl">
        <Card className="border-white/75 bg-white/95 shadow-[0_32px_90px_rgba(15,23,42,0.14)]">
          <CardHeader className="gap-3 border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_32%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.9))]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">
                Reward SaaS Portal
              </p>
              <CardTitle className="text-3xl text-slate-950">
                Accept updated legal documents
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                This account can sign into the portal, but access to tenant,
                billing, and project operations stays blocked until every
                current required document is accepted.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-medium text-slate-900">
                {currentSession.user.email}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            {errorMessage && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </p>
            )}
            {documents.length === 0 && (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Current legal documents are temporarily unavailable. Refresh
                this page in a moment and try again.
              </p>
            )}
            <form action={acceptLegalAction} className="space-y-5">
              <input type="hidden" name="returnTo" value={returnTo} />
              {documents.map((document) => (
                <section
                  key={document.id}
                  className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-slate-950">
                        {formatLegalSlug(document.slug)}
                      </h2>
                      <p className="text-sm text-slate-500">
                        Version {document.version}
                      </p>
                    </div>
                    <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
                      Required
                    </div>
                  </div>
                  <div
                    className="prose prose-sm max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700"
                    dangerouslySetInnerHTML={{ __html: document.html }}
                  />
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name={`accept:${document.id}`}
                      className="mt-1"
                      required
                    />
                    <span>
                      I accept {formatLegalSlug(document.slug)} version{" "}
                      {document.version}.
                    </span>
                  </label>
                </section>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4">
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  After acceptance, the portal will send you back to{" "}
                  <span className="font-medium text-slate-900">{returnTo}</span>.
                </p>
                <Button
                  type="submit"
                  disabled={documents.length === 0}
                  className="rounded-full bg-sky-600 px-6 hover:bg-sky-700"
                >
                  Continue to portal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthPageShell>
  );
}
