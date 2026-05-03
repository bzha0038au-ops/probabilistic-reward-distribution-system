<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import type { Locale } from "$lib/i18n"

  import { getKycCopy } from "../copy"
  import KycDetailModuleTabs from "./kyc-detail-module-tabs.svelte"
  import type { PageData } from "./page-support"

  type ComparisonRow = {
    label: string
    extracted: string
    submitted: string
    mismatch: boolean
  }

  let { data }: { data: PageData } = $props()

  const { locale } = getContext("i18n") as { locale: () => Locale }

  const copy = $derived(getKycCopy(locale()))
  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  let stepUpCode = $state("")
  let selectedDocumentIndex = $state(0)
  const documents = $derived(data.detail?.documents ?? [])
  const selectedDocument = $derived(documents[selectedDocumentIndex] ?? null)
  const riskFlagCount = $derived(data.detail?.riskFlags.length ?? 0)
  const reviewEventCount = $derived(data.detail?.reviewEvents.length ?? 0)
  const activeModule = $derived.by(() => {
    if ($page.url.pathname.endsWith("/overview")) return "overview"
    if ($page.url.pathname.endsWith("/documents")) return "documents"
    if ($page.url.pathname.endsWith("/decision")) return "decision"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isOverviewModule = $derived(activeModule === "overview")
  const isDocumentsModule = $derived(activeModule === "documents")
  const isDecisionModule = $derived(activeModule === "decision")

  $effect(() => {
    if (selectedDocumentIndex >= documents.length) {
      selectedDocumentIndex = 0
    }
  })

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatTier = (
    value: keyof typeof copy.tierLabels | null | undefined,
  ) => (value ? (copy.tierLabels[value] ?? value) : "-")

  const formatStatus = (
    value: keyof typeof copy.statusLabels | null | undefined,
  ) => (value ? (copy.statusLabels[value] ?? value) : "-")

  const formatDocumentType = (
    value: keyof typeof copy.documentTypeLabels | null | undefined,
  ) => (value ? (copy.documentTypeLabels[value] ?? value) : "-")

  const formatDocumentKind = (
    value: keyof typeof copy.documentKindLabels | null | undefined,
  ) => (value ? (copy.documentKindLabels[value] ?? value) : "-")

  const formatReviewAction = (
    value: keyof typeof copy.reviewActionLabels | null | undefined,
  ) => (value ? (copy.reviewActionLabels[value] ?? value) : "-")

  const formatFlag = (value: string) => value.replaceAll("_", " ")

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "-"
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value)
    }
    return JSON.stringify(value)
  }

  const getSubmittedEntries = (
    value: Record<string, unknown> | null | undefined,
  ) => Object.entries(value ?? {})

  const statusBadgeClass = (status: string) =>
    ({
      pending: "badge-warning",
      approved: "badge-success",
      rejected: "badge-error",
      more_info_required: "badge-info",
      not_started: "badge-ghost",
    })[status] ?? "badge-outline"

  const readSubmittedField = (
    detail: NonNullable<PageData["detail"]>,
    candidates: string[],
  ) => {
    const source = detail.submittedData ?? {}
    for (const candidate of candidates) {
      if (candidate in source) {
        return source[candidate]
      }
    }
    return null
  }

  const normalizeComparisonValue = (value: string) => value.trim().toLowerCase()
  const comparisonRows = $derived.by<ComparisonRow[]>(() => {
    if (!data.detail) {
      return []
    }

    const detail = data.detail
    const rows = [
      {
        label: copy.detail.legalName,
        extracted: formatValue(detail.legalName),
        submitted: formatValue(
          readSubmittedField(detail, ["legalName", "name", "fullName"]),
        ),
      },
      {
        label: copy.detail.documentType,
        extracted: formatDocumentType(detail.documentType),
        submitted: formatValue(
          readSubmittedField(detail, ["documentType", "idType"]),
        ),
      },
      {
        label: copy.detail.documentNumberLast4,
        extracted: formatValue(detail.documentNumberLast4),
        submitted: formatValue(
          readSubmittedField(detail, [
            "documentNumberLast4",
            "documentLast4",
            "documentNumber",
          ]),
        ),
      },
      {
        label: copy.detail.countryCode,
        extracted: formatValue(detail.countryCode),
        submitted: formatValue(
          readSubmittedField(detail, ["countryCode", "country"]),
        ),
      },
      {
        label: copy.detail.notes,
        extracted: formatValue(detail.notes),
        submitted: formatValue(readSubmittedField(detail, ["notes"])),
      },
    ]

    return rows.map((row) => ({
      ...row,
      mismatch:
        row.extracted !== "-" &&
        row.submitted !== "-" &&
        normalizeComparisonValue(row.extracted) !==
          normalizeComparisonValue(row.submitted),
    }))
  })

  const kycModules = $derived.by(() => {
    if (!data.detail) return []

    return [
      {
        href: `/kyc/${data.detail.id}/overview`,
        eyebrow: "Case Summary",
        title: "Overview",
        description:
          "Tier state, field comparison and profile summary stay in one quiet review desk.",
        badge: formatStatus(data.detail.status),
      },
      {
        href: `/kyc/${data.detail.id}/documents`,
        eyebrow: "Document Desk",
        title: "Documents",
        description:
          "Document viewer, submission package and raw payload move into a dedicated evidence view.",
        badge: `${documents.length}`,
      },
      {
        href: `/kyc/${data.detail.id}/decision`,
        eyebrow: "Determination Rail",
        title: "Decision",
        description:
          "Review history and approve / reject / more-info actions live in a separate operator command surface.",
        badge: `${reviewEventCount}`,
      },
    ]
  })
</script>

<div class="space-y-6">
  <a
    href="/kyc"
    class="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] transition hover:text-[var(--admin-ink)]"
  >
    <span class="material-symbols-outlined text-sm">arrow_back</span>
    <span>{copy.detail.back}</span>
  </a>

  <AdminPageHeader
    context="Workspace · identityReview"
    eyebrow="KYC"
    title={copy.detail.title}
    description={copy.detail.description}
  />

  {#if data.detail}
    <KycDetailModuleTabs profileId={data.detail.id} />
  {/if}

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if actionMessage}
    <div class="alert alert-success text-sm">
      <span>{actionMessage}</span>
    </div>
  {/if}

  {#if data.detail}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Status
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {formatStatus(data.detail.status)}
            </p>
            <span class={`badge ${statusBadgeClass(data.detail.status)}`}>
              {formatTier(data.detail.requestedTier)}
            </span>
          </div>
          <p class="text-sm text-slate-500">
            Case status, requested tier, and current review position.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Document Package
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {documents.length}
            </p>
            <span class="badge badge-outline">files</span>
          </div>
          <p class="text-sm text-slate-500">
            Uploaded files in the current submission version.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Risk Flags
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {riskFlagCount}
            </p>
            <span class="badge badge-outline">
              {data.detail.hasActiveFreeze
                ? copy.queue.activeFreeze
                : copy.queue.noFreeze}
            </span>
          </div>
          <p class="text-sm text-slate-500">
            Risk markers and linked freeze state surfaced for this case.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Review Events
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {reviewEventCount}
            </p>
            <span class="badge badge-outline">
              v{data.detail.submissionVersion}
            </span>
          </div>
          <p class="text-sm text-slate-500">
            Historical review actions stored on this KYC profile.
          </p>
        </div>
      </article>
    </section>

    {#if isHubModule}
      <section class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              KYC Drawer
            </p>
            <h2
              class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
            >
              分域操作入口
            </h2>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            KYC 详情页现在只保留摘要和模块入口。进入具体模块，再分别处理
            overview、documents 和 final decision。
          </p>

          <div class="grid gap-4 lg:grid-cols-3">
            {#each kycModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]">
                    arrow_forward
                  </span>
                </div>
              </a>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    {#if isOverviewModule}
      <section
        class="grid gap-6 2xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]"
      >
        <div class="admin-main--after-rail-2xl min-w-0 space-y-6">
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4"
              >
                <div
                  class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Case Summary
                    </p>
                    <h2 class="card-title mt-2">{copy.detail.summaryTitle}</h2>
                    <p class="text-sm text-slate-500">
                      {data.detail.userEmail}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      class={`badge ${statusBadgeClass(data.detail.status)}`}
                    >
                      {formatStatus(data.detail.status)}
                    </span>
                    {#if data.detail.hasActiveFreeze}
                      <span class="badge badge-error badge-outline">
                        {copy.queue.activeFreeze}
                      </span>
                    {:else}
                      <span class="badge badge-success badge-outline">
                        {copy.queue.noFreeze}
                      </span>
                    {/if}
                  </div>
                </div>
                <p class="font-mono text-xs text-slate-500">
                  #{data.detail.id} · User #{data.detail.userId}
                </p>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.currentTier}
                  </p>
                  <p
                    class="mt-3 text-2xl font-semibold text-[var(--admin-ink)]"
                  >
                    {formatTier(data.detail.currentTier)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.requestedTier}
                  </p>
                  <p
                    class="mt-3 text-2xl font-semibold text-[var(--admin-ink)]"
                  >
                    {formatTier(data.detail.requestedTier)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.submissionVersion}
                  </p>
                  <p
                    class="mt-3 text-2xl font-semibold text-[var(--admin-ink)]"
                  >
                    {data.detail.submissionVersion}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.submittedAt}
                  </p>
                  <p class="mt-3 text-sm font-mono text-[var(--admin-ink)]">
                    {formatDate(data.detail.submittedAt)}
                  </p>
                </div>
              </div>

              <div
                class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table admin-table-compact">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Stored</th>
                      <th>Submitted</th>
                      <th class="text-right">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each comparisonRows as row}
                      <tr
                        style={row.mismatch
                          ? "background: var(--admin-danger-soft);"
                          : undefined}
                      >
                        <td class="font-medium text-[var(--admin-ink)]"
                          >{row.label}</td
                        >
                        <td class="font-mono text-xs text-slate-700"
                          >{row.extracted}</td
                        >
                        <td class="font-mono text-xs text-slate-700"
                          >{row.submitted}</td
                        >
                        <td class="text-right">
                          {#if row.mismatch}
                            <span class="badge badge-error badge-outline"
                              >mismatch</span
                            >
                          {:else}
                            <span class="badge badge-success badge-outline"
                              >aligned</span
                            >
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>

        <aside
          class="admin-rail admin-rail--early-2xl space-y-6 2xl:sticky 2xl:top-24 2xl:self-start"
        >
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Profile Snapshot
                </p>
                <h2 class="card-title mt-2">Verification State</h2>
                <p class="text-sm text-slate-500">
                  Tier state, freeze linkage and review timing in one operator
                  rail.
                </p>
              </div>

              <div class="admin-rail-panel">
                <dl class="admin-data-list text-sm text-slate-600">
                  <div class="admin-data-row">
                    <dt>{copy.detail.status}</dt>
                    <dd class={`badge ${statusBadgeClass(data.detail.status)}`}>
                      {formatStatus(data.detail.status)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.currentTier}</dt>
                    <dd class="admin-data-value">
                      {formatTier(data.detail.currentTier)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.requestedTier}</dt>
                    <dd class="admin-data-value">
                      {formatTier(data.detail.requestedTier)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.reviewedAt}</dt>
                    <dd class="admin-data-value font-mono text-xs">
                      {formatDate(data.detail.reviewedAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Risk Flags
                </p>
                {#if data.detail.riskFlags.length === 0}
                  <p class="mt-3 text-sm text-slate-500">-</p>
                {:else}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each data.detail.riskFlags as riskFlag}
                      <span class="badge badge-warning badge-outline">
                        {formatFlag(riskFlag)}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </article>
        </aside>
      </section>
    {/if}

    {#if isDocumentsModule}
      <section
        class="grid gap-6 2xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]"
      >
        <div class="admin-main--after-rail-2xl min-w-0 space-y-6">
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4"
              >
                <div
                  class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Document Viewer
                    </p>
                    <h2 class="card-title mt-2">
                      {copy.detail.documentsTitle}
                    </h2>
                  </div>
                  {#if selectedDocument}
                    <a
                      class="btn btn-outline btn-sm"
                      href={selectedDocument.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.detail.openPreview}
                    </a>
                  {/if}
                </div>
                <p class="text-sm text-slate-500">
                  {copy.detail.documentsDescription}
                </p>
              </div>

              {#if documents.length === 0}
                <div
                  class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
                >
                  {copy.detail.noDocuments}
                </div>
              {:else}
                <div class="flex flex-wrap gap-2">
                  {#each documents as document, index}
                    <button
                      type="button"
                      class={`btn btn-sm ${selectedDocumentIndex === index ? "btn-primary" : "btn-outline"}`}
                      onclick={() => {
                        selectedDocumentIndex = index
                      }}
                    >
                      {formatDocumentKind(document.kind)}
                    </button>
                  {/each}
                </div>

                {#if selectedDocument}
                  <div class="space-y-4">
                    <div
                      class="overflow-hidden rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)]"
                    >
                      {#if selectedDocument.mimeType.startsWith("image/")}
                        <img
                          class="h-[28rem] w-full object-contain bg-white"
                          src={selectedDocument.previewUrl}
                          alt={selectedDocument.fileName}
                        />
                      {:else if selectedDocument.mimeType === "application/pdf"}
                        <iframe
                          class="h-[28rem] w-full bg-white"
                          src={selectedDocument.previewUrl}
                          title={selectedDocument.fileName}
                        ></iframe>
                      {:else}
                        <div class="p-6 text-sm text-slate-500">
                          {copy.detail.previewUnavailable}
                        </div>
                      {/if}
                    </div>

                    <dl class="grid gap-3 sm:grid-cols-2">
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          File
                        </dt>
                        <dd class="mt-2 text-sm text-[var(--admin-ink)]">
                          {selectedDocument.label ?? selectedDocument.fileName}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          MIME
                        </dt>
                        <dd
                          class="mt-2 font-mono text-xs text-[var(--admin-ink)]"
                        >
                          {selectedDocument.mimeType}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Uploaded
                        </dt>
                        <dd
                          class="mt-2 font-mono text-xs text-[var(--admin-ink)]"
                        >
                          {formatDate(selectedDocument.createdAt)}
                        </dd>
                      </div>
                      <div
                        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          {copy.detail.documentExpiresAt}
                        </dt>
                        <dd
                          class="mt-2 font-mono text-xs text-[var(--admin-ink)]"
                        >
                          {formatDate(selectedDocument.expiresAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                {/if}
              {/if}
            </div>
          </article>

          <article class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Submission Package
                </p>
                <h2 class="card-title mt-2">{copy.detail.submissionTitle}</h2>
                <p class="text-sm text-slate-500">
                  {copy.detail.submissionDescription}
                </p>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.legalName}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatValue(data.detail.legalName)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.documentType}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatDocumentType(data.detail.documentType)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.documentNumberLast4}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatValue(data.detail.documentNumberLast4)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.countryCode}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatValue(data.detail.countryCode)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.submittedAt}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatDate(data.detail.submittedAt)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.reviewedAt}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatDate(data.detail.reviewedAt)}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 sm:col-span-2"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.notes}
                  </p>
                  <p class="mt-2 text-sm">{formatValue(data.detail.notes)}</p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 sm:col-span-2"
                >
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {copy.detail.rejectionReason}
                  </p>
                  <p class="mt-2 text-sm">
                    {formatValue(data.detail.rejectionReason)}
                  </p>
                </div>
              </div>

              <div
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  {copy.detail.submittedData}
                </p>
                {#if getSubmittedEntries(data.detail.submittedData).length === 0}
                  <p class="mt-3 text-sm text-slate-500">-</p>
                {:else}
                  <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                    {#each getSubmittedEntries(data.detail.submittedData) as [key, value]}
                      <div
                        class="rounded-[0.85rem] bg-[var(--admin-paper-strong)] p-3"
                      >
                        <dt
                          class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--admin-muted)]"
                        >
                          {key}
                        </dt>
                        <dd class="mt-2 text-sm text-[var(--admin-ink)]">
                          {formatValue(value)}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </div>
            </div>
          </article>
        </div>

        <aside
          class="admin-rail admin-rail--early-2xl space-y-6 2xl:sticky 2xl:top-24 2xl:self-start"
        >
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Package Snapshot
                </p>
                <h2 class="card-title mt-2">Document Context</h2>
                <p class="text-sm text-slate-500">
                  Selected file metadata and package state in one narrow
                  evidence rail.
                </p>
              </div>

              <div class="admin-rail-panel">
                <dl class="admin-data-list text-sm text-slate-600">
                  <div class="admin-data-row">
                    <dt>{copy.detail.documentType}</dt>
                    <dd class="admin-data-value">
                      {formatDocumentType(data.detail.documentType)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.documentNumberLast4}</dt>
                    <dd class="admin-data-value font-mono text-xs">
                      {formatValue(data.detail.documentNumberLast4)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.countryCode}</dt>
                    <dd class="admin-data-value">
                      {formatValue(data.detail.countryCode)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.submissionVersion}</dt>
                    <dd class="admin-data-value font-mono text-xs">
                      {data.detail.submissionVersion}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </article>
        </aside>
      </section>
    {/if}

    {#if isDecisionModule}
      <section
        class="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]"
      >
        <div class="admin-main--after-rail-2xl min-w-0 space-y-6">
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Review History
                </p>
                <h2 class="card-title mt-2">
                  {copy.detail.reviewHistoryTitle}
                </h2>
                <p class="text-sm text-slate-500">
                  {copy.detail.reviewHistoryDescription}
                </p>
              </div>

              {#if data.detail.reviewEvents.length === 0}
                <div
                  class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
                >
                  {copy.detail.noReviewEvents}
                </div>
              {:else}
                <div class="space-y-3">
                  {#each data.detail.reviewEvents as reviewEvent}
                    <div
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                    >
                      <div
                        class="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div class="flex flex-wrap gap-2">
                          <span class="badge badge-outline">
                            {formatReviewAction(reviewEvent.action)}
                          </span>
                          <span class="badge badge-ghost">
                            {formatStatus(reviewEvent.fromStatus)} -> {formatStatus(
                              reviewEvent.toStatus,
                            )}
                          </span>
                        </div>
                        <span class="font-mono text-xs text-slate-500">
                          {formatDate(reviewEvent.createdAt)}
                        </span>
                      </div>
                      <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt
                            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-muted)]"
                          >
                            {copy.detail.actor}
                          </dt>
                          <dd class="mt-1 text-sm text-slate-800">
                            {reviewEvent.actorAdminEmail ??
                              `Admin #${reviewEvent.actorAdminId ?? "-"}`}
                          </dd>
                        </div>
                        <div>
                          <dt
                            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-muted)]"
                          >
                            {copy.detail.reason}
                          </dt>
                          <dd class="mt-1 text-sm text-slate-800">
                            {formatValue(reviewEvent.reason)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </article>
        </div>

        <aside
          class="admin-rail admin-rail--early-2xl space-y-6 2xl:sticky 2xl:top-24 2xl:self-start"
        >
          <article class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Determination Rail
                </p>
                <h2 class="card-title mt-2">
                  {copy.detail.reviewActionsTitle}
                </h2>
                <p class="text-sm text-slate-500">
                  {copy.detail.reviewActionsDescription}
                </p>
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Step-Up
                </p>
                <label class="form-control mt-3">
                  <span class="label-text mb-2">MFA code</span>
                  <input
                    class="input input-bordered"
                    name="totpCode"
                    type="text"
                    bind:value={stepUpCode}
                    autocomplete="one-time-code"
                  />
                </label>
              </div>

              <div class="admin-rail-panel">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Case State
                </p>
                <dl class="admin-data-list mt-3 text-sm text-slate-600">
                  <div class="admin-data-row">
                    <dt>{copy.detail.status}</dt>
                    <dd class={`badge ${statusBadgeClass(data.detail.status)}`}>
                      {formatStatus(data.detail.status)}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.freezeStatus}</dt>
                    <dd class="text-right">
                      {data.detail.hasActiveFreeze
                        ? copy.queue.activeFreeze
                        : copy.queue.noFreeze}
                    </dd>
                  </div>
                  <div class="admin-data-row">
                    <dt>{copy.detail.submittedAt}</dt>
                    <dd class="admin-data-value font-mono text-xs">
                      {formatDate(data.detail.submittedAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              {#if data.detail.status !== "pending"}
                <div class="admin-empty-state p-5 text-sm text-slate-500">
                  {copy.detail.noLongerPending}
                </div>
              {:else}
                <div class="space-y-4">
                  <form
                    method="post"
                    action="?/approve"
                    class="admin-guarded-action"
                  >
                    <div class="space-y-3">
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <div>
                        <h3 class="font-semibold text-[var(--admin-ink)]">
                          {copy.detail.approve}
                        </h3>
                        <p class="text-sm text-slate-500">
                          {copy.detail.approveDescription}
                        </p>
                      </div>
                      <label class="form-control">
                        <span class="label-text mb-2"
                          >{copy.detail.optionalReason}</span
                        >
                        <textarea
                          class="textarea textarea-bordered min-h-24"
                          name="reason"
                        ></textarea>
                      </label>
                      <button class="btn btn-primary w-full" type="submit">
                        {copy.detail.approve}
                      </button>
                    </div>
                  </form>

                  <form
                    method="post"
                    action="?/reject"
                    class="admin-guarded-action admin-guarded-action--danger"
                  >
                    <div class="space-y-3">
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <div>
                        <h3 class="font-semibold text-[var(--admin-ink)]">
                          {copy.detail.reject}
                        </h3>
                        <p class="text-sm text-slate-500">
                          {copy.detail.rejectDescription}
                        </p>
                      </div>
                      <label class="form-control">
                        <span class="label-text mb-2"
                          >{copy.detail.requiredReason}</span
                        >
                        <textarea
                          class="textarea textarea-bordered min-h-24"
                          name="reason"
                          required
                        ></textarea>
                      </label>
                      <div
                        class="admin-rail-note admin-rail-note--danger text-sm"
                      >
                        Rejection keeps the case in the audit trail and may
                        retain linked withdrawal-freeze context. Record the
                        rationale clearly before submitting.
                      </div>
                      <button class="btn btn-error w-full" type="submit">
                        {copy.detail.reject}
                      </button>
                    </div>
                  </form>

                  <form
                    method="post"
                    action="?/requestMoreInfo"
                    class="admin-guarded-action admin-guarded-action--warning"
                  >
                    <div class="space-y-3">
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <div>
                        <h3 class="font-semibold text-[var(--admin-ink)]">
                          {copy.detail.requestMoreInfo}
                        </h3>
                        <p class="text-sm text-slate-500">
                          {copy.detail.requestMoreInfoDescription}
                        </p>
                      </div>
                      <label class="form-control">
                        <span class="label-text mb-2"
                          >{copy.detail.optionalReason}</span
                        >
                        <textarea
                          class="textarea textarea-bordered min-h-24"
                          name="reason"
                        ></textarea>
                      </label>
                      <button class="btn btn-outline w-full" type="submit">
                        {copy.detail.requestMoreInfo}
                      </button>
                    </div>
                  </form>
                </div>
              {/if}
            </div>
          </article>

          {#if data.detail.currentTier !== "tier_0"}
            <article class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Reverification
                  </p>
                  <h2 class="card-title mt-2">
                    {copy.detail.requestReverification}
                  </h2>
                  <p class="text-sm text-slate-500">
                    {copy.detail.requestReverificationDescription}
                  </p>
                </div>

                <form
                  method="post"
                  action="?/requestReverification"
                  class="admin-guarded-action admin-guarded-action--warning space-y-3"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{copy.detail.optionalReason}</span
                    >
                    <textarea
                      class="textarea textarea-bordered min-h-24"
                      name="reason"
                    ></textarea>
                  </label>
                  <button class="btn btn-warning w-full" type="submit">
                    {copy.detail.requestReverification}
                  </button>
                </form>
              </div>
            </article>
          {/if}
        </aside>
      </section>
    {/if}
  {/if}
</div>
