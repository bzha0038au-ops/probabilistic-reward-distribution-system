<script lang="ts">
  import type {
    ForumModerationOverview,
    ForumModerationQueueItem,
  } from "@reward/shared-types/forum"
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  interface PageData {
    overview: ForumModerationOverview
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let releaseReason = $state("")
  let selectedPostId = $state<number | null>(null)

  const queue = $derived(data.overview.queue ?? [])
  const activeMutes = $derived(data.overview.activeMutes ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  const mutedUserIds = $derived(
    new Set(activeMutes.map((record) => record.userId)),
  )
  const selectedItem = $derived(
    queue.find((item) => item.postId === selectedPostId) ?? queue[0] ?? null,
  )
  const autoHiddenCount = $derived(
    queue.filter((item) => item.autoHidden).length,
  )
  const providerBackedCount = $derived(
    queue.filter((item) => item.signalProviders.length > 0).length,
  )
  const strongestReportCount = $derived(
    queue.reduce((highest, item) => Math.max(highest, item.reportCount), 0),
  )

  $effect(() => {
    if (queue.length === 0) {
      selectedPostId = null
      return
    }
    if (
      selectedPostId === null ||
      !queue.some((item) => item.postId === selectedPostId)
    ) {
      selectedPostId = queue[0]?.postId ?? null
    }
  })

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatValue = (value: string) => value.replaceAll("_", " ")
  const formatProviders = (providers: string[]) =>
    providers.map((provider) => formatValue(provider)).join(", ")
  const formatScore = (value: number | null) =>
    value === null ? "manual" : value.toFixed(2)

  const authorLabel = (item: ForumModerationQueueItem) =>
    item.authorEmail
      ? `${item.authorEmail} (#${item.authorUserId})`
      : `User #${item.authorUserId}`
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · forumModeration"
    eyebrow={t("forum.moderation.eyebrow")}
    title={t("forum.moderation.title")}
    description={t("forum.moderation.description")}
  />

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

  <div class="alert alert-warning text-sm">
    <span>{t("forum.moderation.notice")}</span>
  </div>

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {queue.length}
          </p>
          <span class="badge badge-outline">posts</span>
        </div>
        <p class="text-sm text-slate-500">
          {t("forum.moderation.queue.description")}
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Active Mutes
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {activeMutes.length}
          </p>
          <span class="badge badge-outline">locks</span>
        </div>
        <p class="text-sm text-slate-500">
          Authors currently held behind moderation freezes pending release
          review.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Auto Hidden
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {autoHiddenCount}
          </p>
          <span class="badge badge-outline">signals</span>
        </div>
        <p class="text-sm text-slate-500">
          Reported posts already suppressed by automated moderation heuristics.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Provider Backed
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {providerBackedCount}
          </p>
          <span class="badge badge-outline">intel</span>
        </div>
        <p class="text-sm text-slate-500">
          Highest queue cluster currently carries {strongestReportCount} reports.
        </p>
      </div>
    </article>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.82fr)]"
  >
    <div class="min-w-0 space-y-6">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Ledger
              </p>
              <h2 class="card-title mt-2">
                {t("forum.moderation.queue.title")}
              </h2>
              <p class="text-sm text-slate-500">
                Report clusters, post status, and mute actions all stay on one
                moderation desk so operators can clear a case without leaving
                the queue.
              </p>
            </div>
            <span class="badge badge-outline">{queue.length} open</span>
          </div>

          {#if queue.length === 0}
            <div
              class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
            >
              {t("forum.moderation.queue.empty")}
            </div>
          {:else}
            <div class="space-y-4">
              <form
                id="forum-bulk-delete-form"
                method="post"
                action="?/bulkDeletePosts"
                class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("forum.moderation.queue.bulkReason")}
                  </span>
                  <input
                    name="reason"
                    type="text"
                    class="input input-bordered"
                    placeholder={t(
                      "forum.moderation.queue.bulkReasonPlaceholder",
                    )}
                  />
                </label>
                <div class="lg:pt-8">
                  <button class="btn btn-error w-full lg:w-auto" type="submit">
                    {t("forum.moderation.queue.bulkDelete")}
                  </button>
                </div>
              </form>

              <div class="overflow-x-auto">
                <table class="table">
                  <thead>
                    <tr>
                      <th>{t("forum.moderation.queue.headers.select")}</th>
                      <th>{t("forum.moderation.queue.headers.post")}</th>
                      <th>{t("forum.moderation.queue.headers.author")}</th>
                      <th>{t("forum.moderation.queue.headers.thread")}</th>
                      <th>{t("forum.moderation.queue.headers.reports")}</th>
                      <th>{t("forum.moderation.queue.headers.source")}</th>
                      <th>{t("forum.moderation.queue.headers.latestReason")}</th
                      >
                      <th>{t("forum.moderation.queue.headers.status")}</th>
                      <th>{t("forum.moderation.queue.headers.reportedAt")}</th>
                      <th>{t("forum.moderation.queue.headers.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each queue as item}
                      <tr
                        class:bg-[var(--admin-paper-strong)]={selectedItem?.postId ===
                          item.postId}
                      >
                        <td class="align-top">
                          <input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            name="postIds"
                            value={item.postId}
                            form="forum-bulk-delete-form"
                          />
                        </td>
                        <td class="align-top">
                          <button
                            class="max-w-sm space-y-1 text-left"
                            type="button"
                            onclick={() => {
                              selectedPostId = item.postId
                            }}
                          >
                            <p
                              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-slate-500"
                            >
                              post #{item.postId}
                            </p>
                            <p class="text-sm text-[var(--admin-ink)]">
                              {item.bodyPreview}
                            </p>
                          </button>
                        </td>
                        <td class="align-top text-sm text-slate-700">
                          {authorLabel(item)}
                        </td>
                        <td class="align-top">
                          <div class="max-w-xs space-y-1">
                            <p
                              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-slate-500"
                            >
                              thread #{item.threadId}
                            </p>
                            <p class="text-sm text-[var(--admin-ink)]">
                              {item.threadTitle}
                            </p>
                          </div>
                        </td>
                        <td class="align-top">
                          <div class="space-y-2">
                            <span class="badge badge-outline"
                              >{item.reportCount}</span
                            >
                            <p class="font-mono text-xs text-slate-500">
                              {formatScore(item.moderationScore)}
                            </p>
                          </div>
                        </td>
                        <td class="align-top">
                          <div class="flex flex-col items-start gap-2">
                            <span class="badge badge-ghost">
                              {formatValue(item.source)}
                            </span>
                            {#if item.signalProviders.length > 0}
                              <p class="text-xs text-slate-500">
                                {formatProviders(item.signalProviders)}
                              </p>
                            {/if}
                          </div>
                        </td>
                        <td class="align-top">
                          <div class="max-w-xs space-y-1 text-sm">
                            <p class="font-medium text-[var(--admin-ink)]">
                              {formatValue(item.latestReportReason)}
                            </p>
                            {#if item.latestReportDetail}
                              <p class="text-slate-500">
                                {item.latestReportDetail}
                              </p>
                            {/if}
                            {#if item.autoHidden}
                              <span class="badge badge-warning badge-outline">
                                {t("forum.moderation.queue.autoHidden")}
                              </span>
                            {/if}
                          </div>
                        </td>
                        <td class="align-top">
                          <span
                            class={`badge ${item.postStatus === "hidden" ? "badge-warning" : "badge-ghost"}`}
                          >
                            {formatValue(item.postStatus)}
                          </span>
                        </td>
                        <td class="align-top text-sm text-slate-700">
                          {formatDate(item.latestReportedAt)}
                        </td>
                        <td class="align-top">
                          {#if mutedUserIds.has(item.authorUserId)}
                            <button
                              class="btn btn-sm btn-disabled"
                              type="button"
                            >
                              {t("forum.moderation.queue.muted")}
                            </button>
                          {:else}
                            <form method="post" action="?/muteUser">
                              <input
                                type="hidden"
                                name="userId"
                                value={item.authorUserId}
                              />
                              <input
                                type="hidden"
                                name="totpCode"
                                value={stepUpCode}
                              />
                              <button
                                class="btn btn-sm btn-warning"
                                type="submit"
                              >
                                {t("forum.moderation.queue.muteAuthor")}
                              </button>
                            </form>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Active Mute Ledger
              </p>
              <h2 class="card-title mt-2">
                {t("forum.moderation.activeMutes.title")}
              </h2>
              <p class="text-sm text-slate-500">
                Release actions stay behind the same step-up inputs so the
                moderation desk has one verification path for both freeze and
                release.
              </p>
            </div>
            <span class="badge badge-outline">{activeMutes.length} records</span
            >
          </div>

          {#if activeMutes.length === 0}
            <div
              class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
            >
              {t("forum.moderation.activeMutes.empty")}
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>{t("forum.moderation.activeMutes.headers.user")}</th>
                    <th>{t("forum.moderation.activeMutes.headers.reason")}</th>
                    <th
                      >{t("forum.moderation.activeMutes.headers.createdAt")}</th
                    >
                    <th>{t("forum.moderation.activeMutes.headers.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each activeMutes as record}
                    <tr>
                      <td class="text-sm text-slate-700">
                        {record.email
                          ? `${record.email} (#${record.userId})`
                          : `User #${record.userId}`}
                      </td>
                      <td class="text-sm text-slate-700">
                        {formatValue(record.reason)}
                      </td>
                      <td class="text-sm text-slate-700">
                        {formatDate(record.createdAt)}
                      </td>
                      <td>
                        <form method="post" action="?/releaseMute">
                          <input
                            type="hidden"
                            name="freezeRecordId"
                            value={record.freezeRecordId}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <input
                            type="hidden"
                            name="reason"
                            value={releaseReason}
                          />
                          <button class="btn btn-sm btn-outline" type="submit">
                            {t("forum.moderation.activeMutes.release")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    </div>

    <aside class="space-y-6 xl:sticky xl:top-24 self-start">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Step-Up Console
            </p>
            <h2 class="card-title mt-2">
              {t("forum.moderation.stepUp.title")}
            </h2>
            <p class="text-sm text-slate-500">
              {t("forum.moderation.stepUp.description")}
            </p>
          </div>

          <label class="form-control">
            <span class="label-text mb-2">{t("common.totpCode")}</span>
            <input
              type="text"
              inputmode="text"
              autocomplete="one-time-code"
              class="input input-bordered"
              bind:value={stepUpCode}
              placeholder={t("forum.moderation.stepUp.placeholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">
              {t("forum.moderation.stepUp.releaseReason")}
            </span>
            <input
              type="text"
              class="input input-bordered"
              bind:value={releaseReason}
              placeholder={t(
                "forum.moderation.stepUp.releaseReasonPlaceholder",
              )}
            />
          </label>

          <div
            class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
          >
            Bulk deletion does not consume step-up. Author mute and release both
            inherit the values entered here.
          </div>
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Selected Dossier
            </p>
            <h2 class="card-title mt-2">Current Post Signal</h2>
            <p class="text-sm text-slate-500">
              Live context for the currently selected queue item.
            </p>
          </div>

          {#if selectedItem}
            <div class="space-y-4">
              <div class="admin-selected-dossier p-4">
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-slate-500"
                >
                  Post #{selectedItem.postId}
                </p>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-ink)]">
                  {selectedItem.bodyPreview}
                </p>
              </div>

              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Author
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    {authorLabel(selectedItem)}
                  </p>
                </div>

                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Thread
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    #{selectedItem.threadId} · {selectedItem.threadTitle}
                  </p>
                </div>

                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Report Load
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    {selectedItem.reportCount} reports
                  </p>
                </div>

                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Status
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    {formatValue(selectedItem.postStatus)}
                  </p>
                </div>
              </div>

              <dl class="space-y-3 text-sm">
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Source</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {formatValue(selectedItem.source)}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Score</dt>
                  <dd class="font-mono text-right text-[var(--admin-ink)]">
                    {formatScore(selectedItem.moderationScore)}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Latest reason</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {formatValue(selectedItem.latestReportReason)}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Reported at</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {formatDate(selectedItem.latestReportedAt)}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Providers</dt>
                  <dd class="max-w-[14rem] text-right text-[var(--admin-ink)]">
                    {selectedItem.signalProviders.length > 0
                      ? formatProviders(selectedItem.signalProviders)
                      : "None"}
                  </dd>
                </div>
              </dl>

              {#if selectedItem.latestReportDetail}
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-600"
                >
                  {selectedItem.latestReportDetail}
                </div>
              {/if}
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
            >
              No queue item is currently selected.
            </div>
          {/if}
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Governance Notes
            </p>
            <h2 class="card-title mt-2">Forum Protocol</h2>
            <p class="text-sm text-slate-500">
              Keep queue triage procedural: confirm the report cluster, apply
              mute only when author behavior justifies it, and use release notes
              for any override.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                Queue share
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                {providerBackedCount}/{queue.length || 1} items include provider telemetry.
              </p>
            </div>

            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                Release notes
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                {releaseReason.trim() === ""
                  ? "Awaiting operator note"
                  : releaseReason}
              </p>
            </div>
          </div>
        </div>
      </section>
    </aside>
  </section>
</div>
