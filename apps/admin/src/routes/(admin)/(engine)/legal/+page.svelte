<script lang="ts">
  import { page } from "$app/stores"
  import type { LegalDocumentAdminRecord } from "@reward/shared-types/legal"

  import AdminChangeRequestsSection from "../(shared)/control-center/admin-change-requests-section.svelte"
  import type { ChangeRequestRecord } from "../(shared)/control-center/page-support"

  type PageData = {
    admin?: { mfaEnabled?: boolean } | null
    documents: LegalDocumentAdminRecord[]
    changeRequests: ChangeRequestRecord[]
    mfaStatus: { mfaEnabled?: boolean } | null
    error: string | null
  }

  type DiffRow = {
    status: "same" | "changed" | "added" | "removed"
    previousLine: string
    currentLine: string
  }

  const createDraftForm = (document: LegalDocumentAdminRecord | null) => ({
    documentKey: document?.documentKey ?? "terms-of-service",
    locale: document?.locale ?? "zh-CN",
    title: document?.title ?? "Terms of Service",
    summary: document?.summary ?? "",
    changeNotes: document?.changeNotes ?? "",
    htmlContent: document?.htmlContent ?? "<h1>Terms of Service</h1>",
    isRequired: document?.isRequired ?? true,
  })

  const createEditForm = (document: LegalDocumentAdminRecord | null) => ({
    title: document?.title ?? "",
    summary: document?.summary ?? "",
    changeNotes: document?.changeNotes ?? "",
    htmlContent: document?.htmlContent ?? "",
    isRequired: document?.isRequired ?? true,
  })

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")
  let confirmationText = $state("")
  let rejectReason = $state("")
  let selectedDocumentId = $state<number | null>(null)
  let createForm = $state(createDraftForm(null))
  let editForm = $state(createEditForm(null))
  let publishRolloutPercent = $state("100")
  let publishReason = $state("")
  let didInitializeDocumentSelection = $state(false)

  const documents = $derived(data.documents ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const mfaEnabled = $derived(
    Boolean(data.admin?.mfaEnabled ?? data.mfaStatus?.mfaEnabled),
  )
  const changeRequests = $derived((data.changeRequests ?? []).filter(
    (request) => request.changeType === "legal_document_publish",
  ))

  const selectedDocument = $derived(
    documents.find((document) => document.id === selectedDocumentId) ?? null,
  )

  const selectedMutable = $derived(
    selectedDocument !== null &&
      selectedDocument.activePublication === null &&
      selectedDocument.queuedChangeRequestCount === 0,
  )

  const previousVersion = $derived(
    selectedDocument
      ? documents
          .filter(
            (document) =>
              document.documentKey === selectedDocument.documentKey &&
              document.locale === selectedDocument.locale &&
              document.version < selectedDocument.version,
          )
          .sort((left, right) => right.version - left.version)[0] ?? null
      : null,
  )

  const createBaseDocument = $derived(
    documents
      .filter(
        (document) =>
          document.documentKey === createForm.documentKey &&
          document.locale === createForm.locale,
      )
      .sort((left, right) => right.version - left.version)[0] ?? null,
  )

  const editorPreviewHtml = $derived(
    selectedDocument ? editForm.htmlContent : createForm.htmlContent,
  )

  const previewSrcDoc = $derived(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 24px;
        font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
        background: #fffdf7;
        color: #111827;
        line-height: 1.7;
      }
      h1, h2, h3 { line-height: 1.2; }
      a { color: #0f766e; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>${editorPreviewHtml}</body>
</html>`)

  const diffRows = $derived(
    buildLineDiff(
      selectedDocument
        ? previousVersion?.htmlContent ?? ""
        : createBaseDocument?.htmlContent ?? "",
      editorPreviewHtml,
    ),
  )

  $effect(() => {
    if (didInitializeDocumentSelection || documents.length === 0) return

    const firstDocument = documents[0]
    selectedDocumentId = firstDocument.id
    createForm = createDraftForm(firstDocument)
    editForm = createEditForm(firstDocument)
    didInitializeDocumentSelection = true
  })

  $effect(() => {
    if (!selectedDocument) return

    editForm = createEditForm(selectedDocument)
  })

  const statusLabel = (document: LegalDocumentAdminRecord) => {
    if (document.activePublication?.releaseMode === "gray") {
      return `Gray ${document.activePublication.rolloutPercent}%`
    }
    if (document.activePublication?.releaseMode === "rollback") {
      return "Rollback Live"
    }
    if (document.activePublication) {
      return "Live"
    }
    if (document.latestPublication) {
      return "Historical"
    }
    return "Draft"
  }

  const statusClass = (document: LegalDocumentAdminRecord) => {
    if (document.activePublication?.releaseMode === "gray") return "badge-warning"
    if (document.activePublication?.releaseMode === "rollback") return "badge-info"
    if (document.activePublication) return "badge-success"
    if (document.latestPublication) return "badge-ghost"
    return "badge-outline"
  }

  const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? "—" : parsed.toLocaleString()
  }

  const startNewVersionFromSelected = () => {
    if (!selectedDocument) return
    selectedDocumentId = null
    createForm = createDraftForm(selectedDocument)
  }

  function buildLineDiff(previousHtml: string, currentHtml: string): DiffRow[] {
    const previousLines = previousHtml.split(/\r?\n/)
    const currentLines = currentHtml.split(/\r?\n/)
    const length = Math.max(previousLines.length, currentLines.length)
    const rows: DiffRow[] = []

    for (let index = 0; index < length; index += 1) {
      const previousLine = previousLines[index] ?? ""
      const currentLine = currentLines[index] ?? ""

      if (previousLine === currentLine) {
        rows.push({
          status: "same",
          previousLine,
          currentLine,
        })
      } else if (previousLine === "") {
        rows.push({
          status: "added",
          previousLine: "",
          currentLine,
        })
      } else if (currentLine === "") {
        rows.push({
          status: "removed",
          previousLine,
          currentLine: "",
        })
      } else {
        rows.push({
          status: "changed",
          previousLine,
          currentLine,
        })
      }
    }

    return rows
  }
</script>

<header class="space-y-3">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Engine
  </p>
  <h1 class="text-3xl font-semibold">Legal</h1>
  <p class="max-w-3xl text-sm text-slate-600">
    条款版本、灰度发布、回滚与接受统计统一收口到共享引擎层，不再从配置页直接写入生产。
  </p>
</header>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if actionError}
  <div class="alert alert-error mt-6 text-sm">
    <span>{actionError}</span>
  </div>
{/if}

<section class="mt-6 grid gap-4 md:grid-cols-4">
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">Versions</p>
    <p class="mt-3 text-3xl font-semibold">{documents.length}</p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">Live</p>
    <p class="mt-3 text-3xl font-semibold">
      {documents.filter((document) => document.activePublication !== null).length}
    </p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">Queued</p>
    <p class="mt-3 text-3xl font-semibold">
      {documents.reduce(
        (total, document) => total + document.queuedChangeRequestCount,
        0,
      )}
    </p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">Acceptances</p>
    <p class="mt-3 text-3xl font-semibold">
      {documents.reduce((total, document) => total + document.acceptanceCount, 0)}
    </p>
  </article>
</section>

<section class="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1.8fr]">
  <div class="space-y-6">
    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="card-title">Version Registry</h2>
            <p class="text-sm text-slate-500">
              所有历史版本、当前生效状态和接受人数都在这里查看。
            </p>
          </div>
          <button
            class="btn btn-outline btn-sm"
            type="button"
            onclick={startNewVersionFromSelected}
          >
            New Version
          </button>
        </div>

        <div class="space-y-3">
          {#if documents.length === 0}
            <div class="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              还没有 legal 版本，先创建第一份条款。
            </div>
          {:else}
            {#each documents as document}
              <button
                type="button"
                class={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedDocumentId === document.id
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                onclick={() => {
                  selectedDocumentId = document.id
                }}
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="font-semibold text-slate-900">
                      {document.documentKey} v{document.version}
                    </div>
                    <div class="mt-1 text-xs text-slate-500">
                      {document.locale} · {document.title}
                    </div>
                  </div>
                  <span class={`badge ${statusClass(document)}`}>
                    {statusLabel(document)}
                  </span>
                </div>
                <div class="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <div>Accepted: {document.acceptanceCount}</div>
                  <div>Queued: {document.queuedChangeRequestCount}</div>
                  <div>
                    Updated: {formatDateTime(document.updatedAt)}
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div>
          <h2 class="card-title">
            {selectedDocument ? "Edit Version" : "Create Version"}
          </h2>
          <p class="text-sm text-slate-500">
            {selectedDocument
              ? "已发布或排队中的版本会锁定为只读；如需变更，请复制为新版本。"
              : "相同 document key + locale 会自动递增版本号。"}
          </p>
        </div>

        {#if selectedDocument}
          <form method="post" action="?/updateDocument" class="grid gap-4">
            <input type="hidden" name="documentId" value={selectedDocument.id} />
            <label class="form-control">
              <span class="label-text mb-2">Title</span>
              <input
                name="title"
                class="input input-bordered"
                bind:value={editForm.title}
                disabled={!selectedMutable}
              />
            </label>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">Summary</span>
                <input
                  name="summary"
                  class="input input-bordered"
                  bind:value={editForm.summary}
                  disabled={!selectedMutable}
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">Change Notes</span>
                <input
                  name="changeNotes"
                  class="input input-bordered"
                  bind:value={editForm.changeNotes}
                  disabled={!selectedMutable}
                />
              </label>
            </div>
            <label class="form-control">
              <span class="label-text mb-2">HTML</span>
              <textarea
                name="htmlContent"
                class="textarea textarea-bordered min-h-64 font-mono text-xs"
                bind:value={editForm.htmlContent}
                disabled={!selectedMutable}
              ></textarea>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                name="isRequired"
                type="checkbox"
                class="checkbox"
                bind:checked={editForm.isRequired}
                disabled={!selectedMutable}
              />
              <span class="label-text">Require user acceptance</span>
            </label>
            <div class="flex flex-wrap gap-3">
              <button class="btn btn-primary" type="submit" disabled={!selectedMutable}>
                Save Draft
              </button>
            </div>
          </form>

          <form method="post" action="?/deleteDocument" class="mt-2">
            <input type="hidden" name="documentId" value={selectedDocument.id} />
            <button class="btn btn-ghost text-error" type="submit" disabled={!selectedMutable}>
              Delete Draft
            </button>
          </form>
        {:else}
          <form method="post" action="?/createDocument" class="grid gap-4">
            <div class="grid gap-4 md:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">Document Key</span>
                <input
                  name="documentKey"
                  class="input input-bordered"
                  bind:value={createForm.documentKey}
                  placeholder="terms-of-service"
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">Locale</span>
                <input
                  name="locale"
                  class="input input-bordered"
                  bind:value={createForm.locale}
                  placeholder="zh-CN"
                />
              </label>
            </div>
            <label class="form-control">
              <span class="label-text mb-2">Title</span>
              <input
                name="title"
                class="input input-bordered"
                bind:value={createForm.title}
              />
            </label>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">Summary</span>
                <input
                  name="summary"
                  class="input input-bordered"
                  bind:value={createForm.summary}
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">Change Notes</span>
                <input
                  name="changeNotes"
                  class="input input-bordered"
                  bind:value={createForm.changeNotes}
                />
              </label>
            </div>
            <label class="form-control">
              <span class="label-text mb-2">HTML</span>
              <textarea
                name="htmlContent"
                class="textarea textarea-bordered min-h-64 font-mono text-xs"
                bind:value={createForm.htmlContent}
              ></textarea>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                name="isRequired"
                type="checkbox"
                class="checkbox"
                bind:checked={createForm.isRequired}
              />
              <span class="label-text">Require user acceptance</span>
            </label>
            <button class="btn btn-primary" type="submit">Create Version</button>
          </form>
        {/if}
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div>
          <h2 class="card-title">Release Draft</h2>
          <p class="text-sm text-slate-500">
            灰度发布填写 1-99，全量发布填写 100。选择旧版本并全量发布时会被记录为 rollback。
          </p>
        </div>
        <form method="post" action="?/createPublishDraft" class="grid gap-4">
          <input type="hidden" name="documentId" value={selectedDocument?.id ?? ""} />
          <div class="grid gap-4 md:grid-cols-2">
            <label class="form-control">
              <span class="label-text mb-2">Rollout Percent</span>
              <input
                name="rolloutPercent"
                type="number"
                min="1"
                max="100"
                class="input input-bordered"
                bind:value={publishRolloutPercent}
                disabled={!selectedDocument}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">Reason</span>
              <input
                name="reason"
                class="input input-bordered"
                bind:value={publishReason}
                disabled={!selectedDocument}
              />
            </label>
          </div>
          <button class="btn btn-secondary" type="submit" disabled={!selectedDocument}>
            Queue Publish Request
          </button>
        </form>
      </div>
    </div>
  </div>

  <div class="space-y-6">
    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div>
          <h2 class="card-title">HTML Preview</h2>
          <p class="text-sm text-slate-500">
            预览渲染使用 iframe sandbox，避免直接执行编辑内容里的脚本。
          </p>
        </div>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <iframe
          class="h-[30rem] w-full rounded-2xl border border-slate-200 bg-white"
          sandbox=""
          srcdoc={previewSrcDoc}
          title="Legal preview"
        ></iframe>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="card-title">HTML Diff</h2>
            <p class="text-sm text-slate-500">
              {selectedDocument
                ? previousVersion
                  ? `Comparing v${selectedDocument.version} against v${previousVersion.version}.`
                  : "This is the first version for this document key."
                : createBaseDocument
                  ? `Comparing draft against latest ${createBaseDocument.documentKey} v${createBaseDocument.version}.`
                  : "No earlier version to diff against."}
            </p>
          </div>
        </div>
        <div class="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {#each diffRows as row}
            <div
              class={`grid gap-2 rounded-xl p-2 text-xs md:grid-cols-2 ${
                row.status === "same"
                  ? "bg-white"
                  : row.status === "added"
                    ? "bg-emerald-50"
                    : row.status === "removed"
                      ? "bg-rose-50"
                      : "bg-amber-50"
              }`}
            >
              <pre class="overflow-x-auto whitespace-pre-wrap font-mono">{row.previousLine}</pre>
              <pre class="overflow-x-auto whitespace-pre-wrap font-mono">{row.currentLine}</pre>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <section class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="card-title">Publish Step-Up</h2>
            <p class="text-sm text-slate-500">
              发布审批通过后的 change request 时，使用这里输入的 MFA 验证码。
            </p>
          </div>
          <span class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}>
            {mfaEnabled ? "MFA Enabled" : "MFA Required"}
          </span>
        </div>
        <label class="form-control max-w-sm">
          <span class="label-text mb-2">MFA 验证码</span>
          <input
            name="totpCode"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            class="input input-bordered"
            bind:value={stepUpCode}
            placeholder="发布前输入管理员 MFA 验证码"
            disabled={!mfaEnabled}
          />
        </label>
        <label class="form-control max-w-sm">
          <span class="label-text mb-2">二次确认口令</span>
          <input
            class="input input-bordered font-mono"
            bind:value={confirmationText}
            placeholder="例如 SUBMIT 18 / PUBLISH 18"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">驳回原因</span>
          <input
            class="input input-bordered"
            bind:value={rejectReason}
            placeholder="写明驳回原因或回滚说明。"
          />
        </label>
      </div>
    </section>

    <AdminChangeRequestsSection
      {changeRequests}
      {mfaEnabled}
      {stepUpCode}
      {confirmationText}
      {rejectReason}
      showControlInputs={false}
    />
  </div>
</section>
