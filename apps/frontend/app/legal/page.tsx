import { redirect } from "next/navigation";
import type { CurrentLegalDocumentsResponse } from "@reward/shared-types/legal";

import { SubmitButton } from "@/app/submit-button";
import { AuthPageShell } from "@/components/auth-page-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { USER_API_ROUTES } from "@/lib/api/user";
import { apiRequestServer } from "@/lib/api/server";
import { getServerTranslations } from "@/lib/i18n/server";
import { requireCurrentUserSession } from "@/modules/app/server/current-session";

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

  const t = getServerTranslations();
  const documentsResult = await loadCurrentLegalDocuments();
  if (!documentsResult.ok) {
    redirect(`/legal?error=${encodeURIComponent(t("legal.loadFailed"))}`);
  }

  const documents = documentsResult.data.items;
  for (const document of documents) {
    if (formData.get(`accept:${document.id}`) !== "on") {
      redirect(`/legal?error=${encodeURIComponent(t("legal.required"))}`);
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
      `/legal?error=${encodeURIComponent(
        result.error?.message ?? t("legal.acceptFailed"),
      )}`,
    );
  }

  redirect("/app");
}

export default async function LegalPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const t = getServerTranslations();
  const currentSession = await requireCurrentUserSession();
  if (!currentSession.legal.requiresAcceptance) {
    redirect("/app");
  }

  const documentsResult = await loadCurrentLegalDocuments();
  const documents = documentsResult.ok ? documentsResult.data.items : [];
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : !documentsResult.ok
      ? t("legal.loadFailed")
      : null;

  return (
    <AuthPageShell>
      <Card className="w-full max-w-3xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t("legal.title")}</CardTitle>
          <CardDescription>{t("legal.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptLegalAction} className="space-y-5">
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            {documents.map((document) => (
              <div
                key={document.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900">
                    {formatLegalSlug(document.slug)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("legal.versionLabel", { version: document.version })}
                  </p>
                </div>
                <div
                  className="prose prose-sm max-h-72 overflow-y-auto text-slate-700"
                  dangerouslySetInnerHTML={{ __html: document.html }}
                />
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`accept:${document.id}`}
                    className="mt-1"
                    required
                  />
                  <span>
                    {t("legal.checkboxLabel", {
                      slug: formatLegalSlug(document.slug),
                      version: document.version,
                    })}
                  </span>
                </label>
              </div>
            ))}
            <SubmitButton
              loadingLabel={t("common.loading")}
              idleLabel={t("legal.submit")}
            >
              {t("legal.submit")}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
