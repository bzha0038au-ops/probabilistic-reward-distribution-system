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
  type PortalSelection,
} from "@/modules/portal/lib/portal";

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
  overviewUiCopy,
  sandboxProject,
  sandboxProjectKeys,
  sandboxProjectPrizes,
  sandboxSnippet,
  setSnippetLanguage,
  snippetLanguage,
  tenantEntries,
}: OverviewPageProps) {
  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {portalRouteOrder
          .filter((route) => route !== "overview")
          .map((route) => {
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
                <Card className="h-full border-slate-200 bg-white/90 transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                  <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xl text-slate-950">
                        {portalRouteMeta[route].label}
                      </CardTitle>
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {metric}
                      </Badge>
                    </div>
                    <CardDescription>
                      {portalRouteMeta[route].description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                {overviewUiCopy.sandbox.badgePrimary}
              </Badge>
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                {overviewUiCopy.sandbox.badgeSecondary}
              </Badge>
            </div>
            <CardTitle>{overviewUiCopy.sandbox.title}</CardTitle>
            <CardDescription>
              {overviewUiCopy.sandbox.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {sandboxProject ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
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
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
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
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
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

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {sandboxProject.environment}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      Draw cost {sandboxProject.drawCost}{" "}
                      {sandboxProject.currency}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Seed catalog:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sandboxProjectPrizes.length > 0 ? (
                      sandboxProjectPrizes.slice(0, 6).map((prize) => (
                        <Badge
                          key={prize.id}
                          className="rounded-full bg-white text-slate-700 hover:bg-white"
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
                    onClick={handleSelectSandboxProject}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.focusActionLabel}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleIssueSandboxStarterKey}
                    disabled={isPending}
                  >
                    {overviewUiCopy.sandbox.issueStarterKeyLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
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

        <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-white">
                {overviewUiCopy.snippet.title}
              </CardTitle>
              <SnippetLanguagePicker
                value={snippetLanguage}
                onChange={setSnippetLanguage}
              />
            </div>
            <CardDescription className="text-slate-400">
              {overviewUiCopy.snippet.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre className="overflow-x-auto rounded-3xl bg-black/30 p-5 text-sm text-slate-100">
              <code>{sandboxSnippet}</code>
            </pre>
            <p className="text-sm leading-6 text-slate-400">
              Base URL {ENGINE_BASE_URL} · project{" "}
              {sandboxProject ? sandboxProject.slug : "not provisioned"} ·{" "}
              {latestSandboxSecret
                ? "fresh secret embedded from the latest key issue or rotation response"
                : "replace the placeholder key before running"}
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
