import Link from "next/link";
import { redirect } from "next/navigation";
import type { RegisterResponse } from "@reward/shared-types/auth";
import type { CurrentLegalDocumentsResponse } from "@reward/shared-types/legal";

import { SubmitButton } from "@/app/submit-button";
import { AuthPageShell } from "@/components/auth-page-shell";
import { RegisterDeviceFingerprintField } from "@/components/register-device-fingerprint-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_API_ROUTES } from "@/lib/api/user";
import { apiRequestServer } from "@/lib/api/server";
import { getServerTranslations } from "@/lib/i18n/server";

const formatLegalSlug = (slug: string) =>
  slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const parseReferrerId = (
  value: FormDataEntryValue | string | null | undefined,
) => {
  const raw = String(value ?? "").trim();
  if (raw === "") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

async function loadCurrentLegalDocuments() {
  return apiRequestServer<CurrentLegalDocumentsResponse>(
    USER_API_ROUTES.legal.current,
    { cache: "no-store" },
    { auth: false },
  );
}

async function registerAction(formData: FormData) {
  "use server";

  const t = await getServerTranslations();
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const deviceFingerprint = String(
    formData.get("deviceFingerprint") ?? "",
  ).trim();
  const referrerId = parseReferrerId(formData.get("referrerId"));
  const legalDocumentsResult = await loadCurrentLegalDocuments();

  if (!email || !password || !birthDate) {
    redirect(`/register?error=${encodeURIComponent(t("auth.missingFields"))}`);
  }

  if (!legalDocumentsResult.ok) {
    redirect(
      `/register?error=${encodeURIComponent(t("auth.legalLoadFailed"))}`,
    );
  }

  const legalDocuments = legalDocumentsResult.data.items;
  for (const document of legalDocuments) {
    if (formData.get(`accept:${document.id}`) !== "on") {
      redirect(
        `/register?error=${encodeURIComponent(t("auth.legalRequired"))}`,
      );
    }
  }

  const result = await apiRequestServer<RegisterResponse>(
    USER_API_ROUTES.auth.register,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        birthDate,
        ...(deviceFingerprint ? { deviceFingerprint } : {}),
        ...(referrerId ? { referrerId } : {}),
        legalAcceptances: legalDocuments.map((document) => ({
          slug: document.slug,
          version: document.version,
        })),
      }),
    },
  );

  if (!result.ok) {
    const message = result.error?.message ?? t("auth.registerFailed");
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  redirect("/login?registered=1");
}

export default async function Register({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; ref?: string; referrerId?: string }>;
}) {
  return <RegisterPage searchParams={await searchParams} />;
}

async function RegisterPage({
  searchParams,
}: {
  searchParams?: { error?: string; ref?: string; referrerId?: string };
}) {
  const pageT = await getServerTranslations();
  const legalDocumentsResult = await loadCurrentLegalDocuments();
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : null;
  const referrerId = parseReferrerId(
    searchParams?.referrerId ?? searchParams?.ref,
  );
  const legalDocuments = legalDocumentsResult.ok
    ? legalDocumentsResult.data.items
    : [];
  const legalLoadError = legalDocumentsResult.ok
    ? null
    : pageT("auth.legalLoadFailed");

  return (
    <AuthPageShell>
      <Card className="retro-panel-featured w-full max-w-5xl overflow-hidden rounded-[2rem] border-none">
        <CardContent className="retro-ivory-surface relative p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 retro-dot-overlay opacity-15" />
          <div className="relative space-y-6">
            <CardHeader className="space-y-2 px-0 pt-0">
              <div className="space-y-2">
                <CardTitle className="text-[2.55rem] tracking-[-0.05em] text-[var(--retro-ink)]">
                  {pageT("auth.registerTitle")}
                </CardTitle>
                <CardDescription className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.68)]">
                  {pageT("auth.registerDescription")}
                </CardDescription>
              </div>
            </CardHeader>

            <form action={registerAction} className="grid gap-6 xl:grid-cols-[0.82fr,1.18fr]">
              <div className="space-y-5">
                <RegisterDeviceFingerprintField />
                {referrerId ? (
                  <input type="hidden" name="referrerId" value={referrerId} />
                ) : null}

                {errorMessage && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {errorMessage}
                  </p>
                )}
                {legalLoadError && (
                  <p className="rounded-[1rem] border-2 border-[var(--retro-gold)] bg-[#fff6d8] px-4 py-3 text-sm text-[var(--retro-ink)]">
                    {legalLoadError}
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[var(--retro-ink)]">
                    {pageT("common.email")}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={pageT("common.emailPlaceholder")}
                    autoComplete="email"
                    required
                    className="retro-field h-12 border-none px-4 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[var(--retro-ink)]">
                    {pageT("common.password")}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    className="retro-field h-12 border-none px-4 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate" className="text-[var(--retro-ink)]">
                    {pageT("common.birthDate")}
                  </Label>
                  <Input
                    id="birthDate"
                    type="date"
                    name="birthDate"
                    required
                    className="retro-field h-12 border-none px-4 text-base"
                  />
                </div>

                <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                    {pageT("auth.legalSectionTitle")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[rgba(15,17,31,0.64)]">
                    {pageT("auth.legalSectionDescription")}
                  </p>
                </div>

                <SubmitButton
                  loadingLabel={pageT("common.loading")}
                  idleLabel={pageT("common.submit")}
                >
                  {pageT("common.createAccount")}
                </SubmitButton>

                <p className="text-sm text-[rgba(15,17,31,0.64)]">
                  {pageT("auth.haveAccount")}{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-[var(--retro-orange)] transition hover:text-[var(--retro-violet)]"
                  >
                    {pageT("common.signIn")}
                  </Link>
                </p>
              </div>

              <div className="space-y-4">
                {legalDocuments.length > 0 ? (
                  legalDocuments.map((document) => (
                    <div
                      key={document.id}
                      className="rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-5 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]"
                    >
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-[var(--retro-ink)]">
                          {formatLegalSlug(document.slug)}
                        </p>
                        <p className="text-xs text-[rgba(15,17,31,0.52)]">
                          {pageT("auth.legalVersionLabel", {
                            version: document.version,
                          })}
                        </p>
                      </div>
                      <div
                        className="prose prose-sm mt-4 max-h-56 overflow-y-auto text-[rgba(15,17,31,0.78)]"
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
                          {pageT("auth.legalCheckboxLabel", {
                            slug: formatLegalSlug(document.slug),
                            version: document.version,
                          })}
                        </span>
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/84 p-5 text-sm text-[rgba(15,17,31,0.64)]">
                    {pageT("auth.legalSectionDescription")}
                  </div>
                )}
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
