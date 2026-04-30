import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PortalSelection } from "@/modules/portal/lib/portal";

import {
  ENGINE_BASE_URL,
  SnippetLanguagePicker,
  type OverviewUiCopy,
  type SnippetLanguage,
} from "./shared";

type DocsPageProps = {
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
  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="grid gap-6">
        <Card className="border-slate-200 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="gap-2">
            <CardTitle>Sandbox bootstrap</CardTitle>
            <CardDescription>
              Keep the first integration loop inside the tenant portal instead
              of redirecting developers into internal tooling.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-900">
                Current sandbox
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {sandboxProject
                  ? `${sandboxProject.name} · ${sandboxProject.slug} · ${sandboxProject.currency}`
                  : overviewUiCopy.sandbox.emptyStateMessage}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!sandboxProjectId || isPending}
                onClick={handleSelectSandboxProject}
              >
                {overviewUiCopy.sandbox.focusActionLabel}
              </Button>
              <Button
                type="button"
                disabled={!sandboxProjectId || isPending}
                onClick={handleIssueSandboxStarterKey}
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
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Docs and SDK handoff</CardTitle>
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
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">
                  Client bootstrap
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                  <code>{snippetBootstrap}</code>
                </pre>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-900">Base URL</p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                  <code>{ENGINE_BASE_URL}</code>
                </pre>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                Keys are project-scoped. Use sandbox keys against sandbox
                projects and rotate them as part of deployment or credential
                exposure drills.
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-sm text-slate-100">
              <pre className="overflow-x-auto">
                <code>{sandboxSnippet}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <CardHeader className="gap-2">
          <CardTitle className="text-white">
            Copy-and-run sandbox snippet
          </CardTitle>
          <CardDescription className="text-slate-400">
            This snippet uses the current sandbox selection and can embed a
            fresh secret from the latest issue or rotation response.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="overflow-x-auto rounded-3xl bg-black/30 p-5 text-sm text-slate-100">
            <code>{sandboxSnippet}</code>
          </pre>
          <p className="text-sm leading-6 text-slate-400">
            {latestSandboxSecret
              ? "A fresh secret is embedded in this snippet from the current browser session."
              : "Issue or rotate a sandbox key to replace the placeholder token automatically."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
