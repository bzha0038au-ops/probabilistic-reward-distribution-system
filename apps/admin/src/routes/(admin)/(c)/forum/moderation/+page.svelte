<script lang="ts">
  import type {
    ForumModerationOverview,
    ForumModerationQueueItem,
  } from "@reward/shared-types/forum"
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  interface PageData {
    overview: ForumModerationOverview
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let releaseReason = $state("")

  const queue = $derived(data.overview.queue ?? [])
  const activeMutes = $derived(data.overview.activeMutes ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  const mutedUserIds = $derived(new Set(activeMutes.map((record) => record.userId)))
  const summaryCards = $derived([
    {
      label: t("forum.moderation.queue.title"),
      value: queue.length,
    },
    {
      label: t("forum.moderation.activeMutes.title"),
      value: activeMutes.length,
    },
  ])

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatValue = (value: string) => value.replaceAll("_", " ")

  const authorLabel = (item: ForumModerationQueueItem) =>
    item.authorEmail
      ? `${item.authorEmail} (#${item.authorUserId})`
      : `User #${item.authorUserId}`
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {t("forum.moderation.eyebrow")}
    </p>
    <h1 class="text-3xl font-semibold">{t("forum.moderation.title")}</h1>
    <p class="text-sm text-slate-600">{t("forum.moderation.description")}</p>
  </header>

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

  <section class="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      {#each summaryCards as card}
        <article class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-1">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
              {card.label}
            </p>
            <p class="text-3xl font-semibold text-slate-900">{card.value}</p>
          </div>
        </article>
      {/each}
    </div>

    <section class="card bg-base-100 shadow">
      <div class="card-body gap-3">
        <div>
          <h2 class="card-title">{t("forum.moderation.stepUp.title")}</h2>
          <p class="text-sm text-slate-500">
            {t("forum.moderation.stepUp.description")}
          </p>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
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
              placeholder={t("forum.moderation.stepUp.releaseReasonPlaceholder")}
            />
          </label>
        </div>
      </div>
    </section>
  </section>

  <div class="alert border border-warning/30 bg-warning/10 text-sm text-slate-700">
    <span>{t("forum.moderation.notice")}</span>
  </div>

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">{t("forum.moderation.queue.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("forum.moderation.queue.description")}
        </p>
      </div>

      <form
        id="forum-bulk-delete-form"
        method="post"
        action="?/bulkDeletePosts"
        class="grid gap-4 lg:grid-cols-[1fr_auto]"
      >
        <label class="form-control">
          <span class="label-text mb-2">
            {t("forum.moderation.queue.bulkReason")}
          </span>
          <input
            name="reason"
            type="text"
            class="input input-bordered"
            placeholder={t("forum.moderation.queue.bulkReasonPlaceholder")}
          />
        </label>
        <div class="lg:pt-8">
          <button class="btn btn-error w-full lg:w-auto" type="submit">
            {t("forum.moderation.queue.bulkDelete")}
          </button>
        </div>
      </form>

      {#if queue.length === 0}
        <p class="text-sm text-slate-500">{t("forum.moderation.queue.empty")}</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>{t("forum.moderation.queue.headers.select")}</th>
                <th>{t("forum.moderation.queue.headers.post")}</th>
                <th>{t("forum.moderation.queue.headers.author")}</th>
                <th>{t("forum.moderation.queue.headers.thread")}</th>
                <th>{t("forum.moderation.queue.headers.reports")}</th>
                <th>{t("forum.moderation.queue.headers.latestReason")}</th>
                <th>{t("forum.moderation.queue.headers.status")}</th>
                <th>{t("forum.moderation.queue.headers.reportedAt")}</th>
                <th>{t("forum.moderation.queue.headers.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {#each queue as item}
                <tr>
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
                    <div class="max-w-sm space-y-1">
                      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        #{item.postId}
                      </p>
                      <p class="text-sm text-slate-900">{item.bodyPreview}</p>
                    </div>
                  </td>
                  <td class="align-top text-sm text-slate-700">
                    {authorLabel(item)}
                  </td>
                  <td class="align-top">
                    <div class="max-w-xs space-y-1">
                      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        #{item.threadId}
                      </p>
                      <p class="text-sm text-slate-900">{item.threadTitle}</p>
                    </div>
                  </td>
                  <td class="align-top">
                    <span class="badge badge-outline">{item.reportCount}</span>
                  </td>
                  <td class="align-top">
                    <div class="max-w-xs space-y-1 text-sm">
                      <p class="font-medium text-slate-900">
                        {formatValue(item.latestReportReason)}
                      </p>
                      {#if item.latestReportDetail}
                        <p class="text-slate-500">{item.latestReportDetail}</p>
                      {/if}
                    </div>
                  </td>
                  <td class="align-top">
                    <span class="badge badge-ghost">{formatValue(item.postStatus)}</span>
                  </td>
                  <td class="align-top text-sm text-slate-700">
                    {formatDate(item.latestReportedAt)}
                  </td>
                  <td class="align-top">
                    {#if mutedUserIds.has(item.authorUserId)}
                      <button class="btn btn-sm btn-disabled" type="button">
                        {t("forum.moderation.queue.muted")}
                      </button>
                    {:else}
                      <form method="post" action="?/muteUser">
                        <input type="hidden" name="userId" value={item.authorUserId} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <button class="btn btn-sm btn-warning" type="submit">
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
      {/if}
    </div>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">{t("forum.moderation.activeMutes.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("forum.moderation.activeMutes.description")}
        </p>
      </div>

      {#if activeMutes.length === 0}
        <p class="text-sm text-slate-500">
          {t("forum.moderation.activeMutes.empty")}
        </p>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>{t("forum.moderation.activeMutes.headers.user")}</th>
                <th>{t("forum.moderation.activeMutes.headers.reason")}</th>
                <th>{t("forum.moderation.activeMutes.headers.createdAt")}</th>
                <th>{t("forum.moderation.activeMutes.headers.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {#each activeMutes as record}
                <tr>
                  <td class="text-sm text-slate-700">
                    {record.email ? `${record.email} (#${record.userId})` : `User #${record.userId}`}
                  </td>
                  <td class="text-sm text-slate-700">{formatValue(record.reason)}</td>
                  <td class="text-sm text-slate-700">{formatDate(record.createdAt)}</td>
                  <td>
                    <form method="post" action="?/releaseMute">
                      <input
                        type="hidden"
                        name="freezeRecordId"
                        value={record.freezeRecordId}
                      />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <input type="hidden" name="reason" value={releaseReason} />
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
