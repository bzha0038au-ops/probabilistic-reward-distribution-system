import Link from "next/link";
import { redirect } from "next/navigation";
import type { RegisterResponse } from "@reward/shared-types/auth";
import type { CurrentLegalDocumentsResponse } from "@reward/shared-types/legal";

import { Form } from "@/app/form";
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
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{pageT("auth.registerTitle")}</CardTitle>
          <CardDescription>{pageT("auth.registerDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            action={registerAction}
            labels={{
              emailLabel: pageT("common.email"),
              passwordLabel: pageT("common.password"),
              emailPlaceholder: pageT("common.emailPlaceholder"),
            }}
          >
            <RegisterDeviceFingerprintField />
            {referrerId ? (
              <input type="hidden" name="referrerId" value={referrerId} />
            ) : null}
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            {legalLoadError && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {legalLoadError}
              </p>
            )}
            <label className="grid gap-2 text-sm text-slate-700">
              <span>{pageT("common.birthDate")}</span>
              <input
                type="date"
                name="birthDate"
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </label>
            {legalDocuments.length > 0 && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {pageT("auth.legalSectionTitle")}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {pageT("auth.legalSectionDescription")}
                  </p>
                </div>
                {legalDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatLegalSlug(document.slug)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {pageT("auth.legalVersionLabel", {
                          version: document.version,
                        })}
                      </p>
                    </div>
                    <div
                      className="prose prose-sm max-h-56 overflow-y-auto text-slate-700"
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
                        {pageT("auth.legalCheckboxLabel", {
                          slug: formatLegalSlug(document.slug),
                          version: document.version,
                        })}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            <SubmitButton
              loadingLabel={pageT("common.loading")}
              idleLabel={pageT("common.submit")}
            >
              {pageT("common.createAccount")}
            </SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              {pageT("auth.haveAccount")}{" "}
              <Link href="/login" className="font-semibold text-foreground">
                {pageT("common.signIn")}
              </Link>
            </p>
          </Form>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
