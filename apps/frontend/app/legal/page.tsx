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

  const t = await getServerTranslations();
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
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const t = await getServerTranslations();
  const currentSession = await requireCurrentUserSession();
  if (!currentSession.legal.requiresAcceptance) {
    redirect("/app");
  }

  const documentsResult = await loadCurrentLegalDocuments();
  const documents = documentsResult.ok ? documentsResult.data.items : [];
  const errorMessage = resolvedSearchParams?.error
    ? decodeURIComponent(resolvedSearchParams.error)
    : !documentsResult.ok
      ? t("legal.loadFailed")
      : null;

  return (
    <AuthPageShell>
      <Card className="retro-panel-featured w-full max-w-6xl overflow-hidden rounded-[2rem] border-none">
        <CardContent className="retro-ivory-surface relative p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative space-y-6">
            <CardHeader className="space-y-3 px-0 pt-0">
              <span className="retro-kicker w-fit">{t("legal.title")}</span>
              <div className="space-y-2">
                <CardTitle className="text-[2.55rem] tracking-[-0.05em] text-[var(--retro-ink)]">
                  {t("legal.title")}
                </CardTitle>
                <CardDescription className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {t("legal.description")}
                </CardDescription>
              </div>
            </CardHeader>

            <form action={acceptLegalAction} className="grid gap-6 xl:grid-cols-[0.82fr,1.18fr]">
              <div className="space-y-5">
                {errorMessage && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {errorMessage}
                  </p>
                )}

                <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                    {t("legal.submit")}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[rgba(15,17,31,0.64)]">
                    {t("legal.description")}
                  </p>
                </div>

                <SubmitButton
                  loadingLabel={t("common.loading")}
                  idleLabel={t("legal.submit")}
                >
                  {t("legal.submit")}
                </SubmitButton>
              </div>

              <div className="space-y-4">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-5 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-[var(--retro-ink)]">
                        {formatLegalSlug(document.slug)}
                      </p>
                      <p className="text-xs text-[rgba(15,17,31,0.52)]">
                        {t("legal.versionLabel", { version: document.version })}
                      </p>
                    </div>
                    <div
                      className="prose prose-sm mt-4 max-h-72 overflow-y-auto text-[rgba(15,17,31,0.78)]"
                      dangerouslySetInnerHTML={{ __html: document.html }}
                    />
                    <label className="mt-4 flex items-start gap-3 text-sm text-[var(--retro-ink)]">
                      <input
                        type="checkbox"
                        name={`accept:${document.id}`}
                        className="mt-1 h-4 w-4 rounded border-[rgba(15,17,31,0.22)]"
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
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
