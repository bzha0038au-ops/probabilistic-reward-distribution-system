import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildPortalHref,
  portalRouteMeta,
  portalRouteOrder,
  type PortalHrefState,
  type PortalOverviewSubview,
  type PortalSelection,
} from "@/modules/portal/lib/portal";
import { cn } from "@/lib/utils";

import {
  ENGINE_BASE_URL,
  SnippetLanguagePicker,
  formatDate,
  type OverviewUiCopy,
  type SnippetLanguage,
} from "./shared";

type OverviewPageProps = {
  currentHrefState: PortalHrefState;
  currentProjectKeys: PortalSelection["currentProjectKeys"];
  currentProjectPrizes: PortalSelection["currentProjectPrizes"];
  currentProjectUsage: PortalSelection["currentProjectUsage"];
  currentTenant: PortalSelection["currentTenant"];
  currentTenantBillingRuns: PortalSelection["currentTenantBillingRuns"];
  handleCopySandboxSnippet: () => void;
  handleIssueSandboxStarterKey: () => void;
  handleSelectSandboxProject: () => void;
  isPending: boolean;
  latestSandboxSecret: string | null;
  overviewSubview: PortalOverviewSubview | null;
  overviewUiCopy: OverviewUiCopy;
  sandboxProject: PortalSelection["sandboxProject"];
  sandboxProjectKeys: PortalSelection["sandboxProjectKeys"];
  sandboxProjectPrizes: PortalSelection["sandboxProjectPrizes"];
  sandboxSnippet: string;
  setSnippetLanguage: (language: SnippetLanguage) => void;
  snippetLanguage: SnippetLanguage;
  tenantEntries: PortalSelection["tenantEntries"];
};

export function PortalDashboardOverviewPage({
  currentHrefState,
  currentProjectKeys,
  currentProjectPrizes,
  currentProjectUsage,
  currentTenant,
  currentTenantBillingRuns,
  handleCopySandboxSnippet,
  handleIssueSandboxStarterKey,
  handleSelectSandboxProject,
  isPending,
  latestSandboxSecret,
  overviewSubview,
  overviewUiCopy,
  sandboxProject,
  sandboxProjectKeys,
  sandboxProjectPrizes,
  sandboxSnippet,
  setSnippetLanguage,
  snippetLanguage,
  tenantEntries,
}: OverviewPageProps) {
  const activeSubview = overviewSubview ?? "launcher";
  const sandboxChecklistTotal = 4;
  const sandboxChecklistCompleted = [
    Boolean(sandboxProject),
    sandboxProjectPrizes.length > 0,
    sandboxProjectKeys.length > 0,
    Boolean(currentTenant?.tenant.onboardedAt),
  ].filter(Boolean).length;
  const sandboxChecklistPercent = Math.round(
    (sandboxChecklistCompleted / sandboxChecklistTotal) * 100,
  );

  if (activeSubview === "launcher") {
    return (
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {portalRouteOrder
          .filter((route) => route !== "overview")
          .map((route, index) => {
            const metric =
              route === "tenants"
                ? `${tenantEntries.length} accessible`
                : route === "keys"
                  ? `${currentProjectKeys.length} in project`
                  : route === "usage"
                    ? `${currentProjectUsage.length} recent events`
                    : route === "reports"
                      ? "Signed downloads"
                      : route === "prizes"
                        ? `${currentProjectPrizes.length} prizes`
                        : route === "billing"
                          ? `${currentTenantBillingRuns.length} invoice runs`
                          : sandboxProject
                            ? "Sandbox handoff ready"
                            : "Waiting for sandbox";

            return (
              <Link
                key={route}
                href={buildPortalHref(route, currentHrefState)}
                className="group"
              >
                <Card
                  className={cn(
                    "portal-shell-card portal-hover-rise h-full rounded-[1.6rem] bg-white/92",
                    "portal-fade-up",
                    index % 3 === 0
                      ? "portal-fade-up-delay-1"
                      : index % 3 === 1
                        ? "portal-fade-up-delay-2"
                        : "portal-fade-up-delay-3",
                  )}
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xl tracking-[-0.03em] text-slate-950">
                        {portalRouteMeta[route].label}
                      </CardTitle>
                      <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                        {metric}
                      </Badge>
                    </div>
                    <CardDescription className="leading-6">
                      {portalRouteMeta[route].description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
      </section>
    );
  }

  if (activeSubview === "snippet") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="tracking-[-0.04em] text-white">
                {overviewUiCopy.snippet.title}
              </CardTitle>
              <SnippetLanguagePicker
                value={snippetLanguage}
                onChange={setSnippetLanguage}
              />
            </div>
            <CardDescription className="max-w-xl text-slate-300">
              {overviewUiCopy.snippet.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                {snippetLanguage === "typescript" ? "SDK client" : "Python client"}
              </Badge>
              <Badge className="rounded-full bg-sky-400/15 px-3 py-1 text-sky-200 hover:bg-sky-400/15">
                {sandboxProject ? sandboxProject.slug : "project not provisioned"}
              </Badge>
            </div>
            <pre
              key={snippetLanguage}
              className="portal-code-surface overflow-x-auto rounded-[1.75rem] p-5 text-sm text-slate-100"
            >
              <code>{sandboxSnippet}</code>
            </pre>
            <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm leading-6 text-slate-300">
                Base URL {ENGINE_BASE_URL} · project{" "}
                {sandboxProject ? sandboxProject.slug : "not provisioned"} ·{" "}
                {latestSandboxSecret
                  ? "fresh secret embedded from the latest key issue or rotation response"
                  : "replace the placeholder key before running"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
        <Card className="portal-shell-card portal-fade-up portal-fade-up-delay-1 overflow-hidden rounded-[2rem] bg-white/92">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                  {overviewUiCopy.sandbox.badgePrimary}
                </Badge>
                <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                  {overviewUiCopy.sandbox.badgeSecondary}
                </Badge>
              </div>
              <div className="portal-soft-metric min-w-[13rem] rounded-[1.35rem] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Sandbox readiness
                  </p>
                  <p className="text-lg font-semibold tracking-[-0.03em] text-sky-700">
                    {sandboxChecklistPercent}%
                  </p>
                </div>
                <div className="portal-progress-track mt-3 h-2">
                  <div
                    className="portal-progress-fill"
                    style={{ width: `${sandboxChecklistPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-sky-800">
                  {sandboxChecklistCompleted} of {sandboxChecklistTotal} complete
                </p>
              </div>
            </div>
            <CardTitle className="tracking-[-0.04em]">
              {overviewUiCopy.sandbox.title}
            </CardTitle>
            <CardDescription className="max-w-3xl text-[15px] leading-7">
              {overviewUiCopy.sandbox.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {sandboxProject ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="portal-soft-metric rounded-[1.4rem] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Project
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProject.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {sandboxProject.slug}
                    </p>
                  </div>
                  <div className="portal-soft-metric rounded-[1.4rem] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Seed prizes
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProjectPrizes.length}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Ready for first-run hello-reward calls
                    </p>
                  </div>
                  <div className="portal-soft-metric rounded-[1.4rem] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Active keys
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {sandboxProjectKeys.length}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Starter key can be re-issued at any time
                    </p>
                  </div>
                </div>

                <div className="portal-banner rounded-[1.6rem] border border-sky-100 bg-sky-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {sandboxProject.environment}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      Draw cost {sandboxProject.drawCost}{" "}
                      {sandboxProject.currency}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    Seed catalog:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sandboxProjectPrizes.length > 0 ? (
                      sandboxProjectPrizes.slice(0, 6).map((prize) => (
                        <Badge
                          key={prize.id}
                          className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white"
                        >
                          {prize.name} · {prize.rewardAmount}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">
                        No sandbox prizes are visible yet.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-slate-200 bg-white/90 px-4 shadow-sm hover:border-sky-200 hover:bg-sky-50"
                    onClick={handleSelectSandboxProject}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.focusActionLabel}
                  </Button>
                  <Button
                    type="button"
                    className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.22)]"
                    onClick={handleIssueSandboxStarterKey}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.issueStarterKeyLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-slate-200 bg-white/90 px-4 shadow-sm hover:border-sky-200 hover:bg-sky-50"
                    onClick={() => {
                      void handleCopySandboxSnippet();
                    }}
                  >
                    {overviewUiCopy.sandbox.copySnippetLabel}
                  </Button>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {latestSandboxSecret
                    ? overviewUiCopy.sandbox.latestSecretMessage
                    : overviewUiCopy.sandbox.placeholderSecretMessage}
                </p>
                {currentTenant?.tenant.onboardedAt ? (
                  <p className="text-sm leading-6 text-emerald-700">
                    First successful call completed{" "}
                    {formatDate(currentTenant.tenant.onboardedAt)}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {overviewUiCopy.sandbox.emptyStateMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
  );
}
