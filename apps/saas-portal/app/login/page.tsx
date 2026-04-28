import { redirect } from "next/navigation";

import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const redirectTo =
    resolvedSearchParams?.callbackUrl &&
    resolvedSearchParams.callbackUrl.startsWith("/") &&
    !resolvedSearchParams.callbackUrl.startsWith("//")
      ? resolvedSearchParams.callbackUrl
      : "/portal";
  const session = await auth();
  if (session?.user) {
    redirect(redirectTo);
  }

  const error = resolvedSearchParams?.error;
  const errorMessage =
    error === "CredentialsSignin"
      ? "Invalid credentials."
      : error
        ? decodeURIComponent(error)
        : null;

  return (
    <AuthPageShell>
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between gap-8 rounded-[2rem] border border-sky-100 bg-white/85 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-500 text-lg font-semibold text-white shadow-lg shadow-sky-500/30">
                RS
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">
                  Reward SaaS Portal
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Independent tenant control plane
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Self-serve access for tenant operators. Manage project keys,
              monitor quota windows, edit prize catalogs, jump into billing, and
              onboard developers with SDK docs without touching the internal
              admin console.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Tenant and project switcher scoped by existing memberships.",
              "One-time key issue and controlled rotation or revocation.",
              "Stripe setup, invoices, and SDK onboarding in one place.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4 text-sm leading-6 text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="w-full border-white/70 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
          <CardHeader className="gap-2 text-center">
            <CardTitle>Portal sign in</CardTitle>
            <CardDescription>
              Use the same account linked to your SaaS tenant membership or
              invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              emailLabel="Email"
              passwordLabel="Password"
              emailPlaceholder="ops@tenant.example"
              submitLabel="Sign in"
              loadingLabel="Signing in"
              idleLabel="Submit"
              initialErrorMessage={errorMessage}
              redirectTo={redirectTo}
            />
          </CardContent>
        </Card>
      </div>
    </AuthPageShell>
  );
}
