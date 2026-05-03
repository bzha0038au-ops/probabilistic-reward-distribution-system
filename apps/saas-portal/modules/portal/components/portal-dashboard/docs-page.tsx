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
  ENGINE_BASE_URL,
  SnippetLanguagePicker,
  type OverviewUiCopy,
  type SnippetLanguage,
} from "./shared";
import type { PortalDocsSubview, PortalSelection } from "@/modules/portal/lib/portal";

type DocsPageProps = {
  docsSubview: PortalDocsSubview | null;
  handleCopySandboxSnippet: () => void;
  handleIssueSandboxStarterKey: () => void;
  handleSelectSandboxProject: () => void;
  isPending: boolean;
  latestSandboxSecret: string | null;
  overviewUiCopy: OverviewUiCopy;
  sandboxProject: PortalSelection["sandboxProject"];
  sandboxProjectId: number | null;
  sandboxSnippet: string;
  setSnippetLanguage: (language: SnippetLanguage) => void;
  snippetBootstrap: string;
  snippetLanguage: SnippetLanguage;
};

export function PortalDashboardDocsPage({
  docsSubview,
  handleCopySandboxSnippet,
  handleIssueSandboxStarterKey,
  handleSelectSandboxProject,
  isPending,
  latestSandboxSecret,
  overviewUiCopy,
  sandboxProject,
  sandboxProjectId,
  sandboxSnippet,
  setSnippetLanguage,
  snippetBootstrap,
  snippetLanguage,
}: DocsPageProps) {
  const activeSubview = docsSubview ?? "bootstrap";

  if (activeSubview === "snippet") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-3 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Copy-and-run
              </Badge>
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                {snippetLanguage === "typescript" ? "SDK client" : "Python client"}
              </Badge>
            </div>
            <CardTitle className="text-white tracking-[-0.04em]">
              Copy-and-run sandbox snippet
            </CardTitle>
            <CardDescription className="text-slate-400">
              This snippet uses the current sandbox selection and can embed a
              fresh secret from the latest issue or rotation response.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre
              key={`docs-preview-${snippetLanguage}`}
              className="portal-code-surface overflow-x-auto rounded-[1.7rem] p-5 text-sm text-slate-100"
            >
              <code>{sandboxSnippet}</code>
            </pre>
            <div className="portal-kpi-card rounded-[1.45rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Secret state
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {latestSandboxSecret
                  ? "A fresh secret is embedded in this snippet from the current browser session."
                  : "Issue or rotate a sandbox key to replace the placeholder token automatically."}
              </p>
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Keep this snippet tied to the selected sandbox project until the
              project catalog, quota, and billing guardrails are ready for
              production handoff.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (activeSubview === "handoff") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] bg-white/92">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-2">
                <CardTitle className="tracking-[-0.04em] text-slate-950">
                  Docs and SDK handoff
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                    {snippetLanguage === "typescript" ? "TypeScript" : "Python"}
                  </Badge>
                  <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                    {ENGINE_BASE_URL}
                  </Badge>
                </div>
              </div>
              <SnippetLanguagePicker
                value={snippetLanguage}
                onChange={setSnippetLanguage}
              />
            </div>
            <CardDescription>
              Give your developers a working base path, install command, and
              first request without redirecting them through the internal admin
              product.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col gap-4">
              <div className="portal-soft-metric rounded-[1.5rem] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Client bootstrap
                </p>
                <pre className="portal-code-surface mt-3 overflow-x-auto rounded-[1.35rem] p-4 text-sm text-slate-100">
                  <code>{snippetBootstrap}</code>
                </pre>
              </div>
              <div className="portal-soft-metric rounded-[1.5rem] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Base URL
                </p>
                <pre className="portal-code-surface mt-3 overflow-x-auto rounded-[1.35rem] p-4 text-sm text-slate-100">
                  <code>{ENGINE_BASE_URL}</code>
                </pre>
              </div>
              <div className="portal-banner rounded-[1.5rem] border border-slate-200/90 bg-slate-50/85 p-4 text-sm leading-6 text-slate-600">
                Keys are project-scoped. Use sandbox keys against sandbox
                projects and rotate them as part of deployment or credential
                exposure drills.
              </div>
            </div>

            <div className="portal-code-surface rounded-[1.7rem] p-5 text-sm text-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
              <pre
                key={`docs-inline-${snippetLanguage}`}
                className="overflow-x-auto"
              >
                <code>{sandboxSnippet}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <Card className="portal-shell-card-strong portal-fade-up portal-fade-up-delay-1 overflow-hidden rounded-[2rem] bg-white/94">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                Sandbox handoff
              </Badge>
              {sandboxProject ? (
                <Badge className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white">
                  {sandboxProject.environment}
                </Badge>
              ) : null}
            </div>
            <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
              {latestSandboxSecret
                ? "Fresh secret in session"
                : "Placeholder token"}
            </Badge>
          </div>
          <CardTitle className="tracking-[-0.04em] text-slate-950">
            Sandbox bootstrap
          </CardTitle>
          <CardDescription>
            Keep the first integration loop inside the tenant portal instead of
            redirecting developers into internal tooling.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="portal-soft-metric rounded-[1.5rem] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Current sandbox
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {sandboxProject
                ? `${sandboxProject.name} · ${sandboxProject.slug} · ${sandboxProject.currency}`
                : overviewUiCopy.sandbox.emptyStateMessage}
            </p>
          </div>

          <div className="portal-banner rounded-[1.6rem] border border-sky-100 bg-sky-50/75 p-4">
            <p className="text-sm font-medium text-slate-900">
              Start with the tenant-scoped sandbox project, issue a fresh
              starter key, and copy the snippet directly into the first SDK call
              loop.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The portal stays responsible for project scope, secret lifecycle,
              and environment safety before a developer ever opens a separate
              docs tab.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-slate-200 bg-white/90 px-4 shadow-sm hover:border-sky-200 hover:bg-sky-50"
              disabled={!sandboxProjectId || isPending}
              onClick={handleSelectSandboxProject}
            >
              {overviewUiCopy.sandbox.focusActionLabel}
            </Button>
            <Button
              type="button"
              className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.22)]"
              disabled={!sandboxProjectId || isPending}
              onClick={handleIssueSandboxStarterKey}
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
        </CardContent>
      </Card>
    </section>
  );
}
