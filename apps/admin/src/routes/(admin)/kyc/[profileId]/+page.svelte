<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import type { Locale } from "$lib/i18n"
  import type { KycAdminDetail } from "@reward/shared-types/kyc"

  import { getKycCopy } from "../copy"

  type PageData = {
    detail: KycAdminDetail | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { locale } = getContext("i18n") as { locale: () => Locale }

  const copy = $derived(getKycCopy(locale()))
  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  let stepUpCode = $state("")

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatTier = (
    value: keyof typeof copy.tierLabels | null | undefined,
  ) => (value ? copy.tierLabels[value] ?? value : "-")

  const formatStatus = (
    value: keyof typeof copy.statusLabels | null | undefined,
  ) => (value ? copy.statusLabels[value] ?? value : "-")

  const formatDocumentType = (
    value: keyof typeof copy.documentTypeLabels | null | undefined,
  ) => (value ? copy.documentTypeLabels[value] ?? value : "-")

  const formatDocumentKind = (
    value: keyof typeof copy.documentKindLabels | null | undefined,
  ) => (value ? copy.documentKindLabels[value] ?? value : "-")

  const formatReviewAction = (
    value: keyof typeof copy.reviewActionLabels | null | undefined,
  ) => (value ? copy.reviewActionLabels[value] ?? value : "-")

  const formatFlag = (value: string) => value.replaceAll("_", " ")

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "-"
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value)
    }
    return JSON.stringify(value)
  }

  const getSubmittedEntries = (value: Record<string, unknown> | null | undefined) =>
    Object.entries(value ?? {})

  const statusBadgeClass = (status: string) =>
    ({
      pending: "badge-warning",
      approved: "badge-success",
      rejected: "badge-error",
      more_info_required: "badge-info",
      not_started: "badge-ghost",
    })[status] ?? "badge-outline"
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <a href="/kyc" class="text-sm text-primary hover:underline">
      {copy.detail.back}
    </a>
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {copy.title}
    </p>
    <h1 class="text-3xl font-semibold">{copy.detail.title}</h1>
    <p class="text-sm text-slate-600">{copy.detail.description}</p>
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

  {#if data.detail}
    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="card-title">{copy.detail.summaryTitle}</h2>
              <p class="text-sm text-slate-500">{data.detail.userEmail}</p>
              <p class="text-xs text-slate-500">
                #{data.detail.id} · User #{data.detail.userId}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class={`badge ${statusBadgeClass(data.detail.status)}`}>
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

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.currentTier}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatTier(data.detail.currentTier)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.requestedTier}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatTier(data.detail.requestedTier)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.submittedAt}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatDate(data.detail.submittedAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.reviewedAt}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatDate(data.detail.reviewedAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.submissionVersion}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.submissionVersion}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.freezeStatus}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.hasActiveFreeze
                  ? copy.queue.activeFreeze
                  : copy.queue.noFreeze}
              </p>
            </div>
          </div>

          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
              {copy.detail.riskFlags}
            </p>
            {#if data.detail.riskFlags.length === 0}
              <p class="mt-2 text-sm text-slate-500">-</p>
            {:else}
              <div class="mt-2 flex flex-wrap gap-2">
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

      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{copy.detail.submissionTitle}</h2>
            <p class="text-sm text-slate-500">
              {copy.detail.submissionDescription}
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.legalName}
              </p>
              <p class="mt-2 text-sm">{formatValue(data.detail.legalName)}</p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.documentType}
              </p>
              <p class="mt-2 text-sm">
                {formatDocumentType(data.detail.documentType)}
              </p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.documentNumberLast4}
              </p>
              <p class="mt-2 text-sm">
                {formatValue(data.detail.documentNumberLast4)}
              </p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.countryCode}
              </p>
              <p class="mt-2 text-sm">{formatValue(data.detail.countryCode)}</p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4 sm:col-span-2">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.notes}
              </p>
              <p class="mt-2 text-sm">{formatValue(data.detail.notes)}</p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4 sm:col-span-2">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {copy.detail.rejectionReason}
              </p>
              <p class="mt-2 text-sm">
                {formatValue(data.detail.rejectionReason)}
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-base-300 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
              {copy.detail.submittedData}
            </p>
            {#if getSubmittedEntries(data.detail.submittedData).length === 0}
              <p class="mt-2 text-sm text-slate-500">-</p>
            {:else}
              <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                {#each getSubmittedEntries(data.detail.submittedData) as [key, value]}
                  <div class="rounded-xl bg-base-200 p-3">
                    <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
                      {key}
                    </dt>
                    <dd class="mt-2 text-sm text-slate-800">
                      {formatValue(value)}
                    </dd>
                  </div>
                {/each}
              </dl>
            {/if}
          </div>
        </div>
      </article>
    </section>

    <section class="card bg-base-100 shadow">
      <div class="card-body gap-4">
        <div>
          <h2 class="card-title">{copy.detail.documentsTitle}</h2>
          <p class="text-sm text-slate-500">{copy.detail.documentsDescription}</p>
        </div>

        {#if data.detail.documents.length === 0}
          <div class="rounded-2xl border border-dashed border-base-300 p-6 text-sm text-slate-500">
            {copy.detail.noDocuments}
          </div>
        {:else}
          <div class="grid gap-4 xl:grid-cols-2">
            {#each data.detail.documents as document}
              <article class="rounded-2xl border border-base-300 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 class="font-semibold">
                      {formatDocumentKind(document.kind)}
                    </h3>
                    <p class="text-sm text-slate-600">
                      {document.label ?? document.fileName}
                    </p>
                    <p class="text-xs text-slate-500">
                      {document.mimeType}
                      {#if document.sizeBytes}
                        · {document.sizeBytes} bytes
                      {/if}
                    </p>
                  </div>
                  <a
                    class="btn btn-sm btn-outline"
                    href={document.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.detail.openPreview}
                  </a>
                </div>

                <div class="mt-4 overflow-hidden rounded-2xl border border-base-300 bg-base-200">
                  {#if document.mimeType.startsWith("image/")}
                    <img
                      class="h-80 w-full object-contain bg-white"
                      src={document.previewUrl}
                      alt={document.fileName}
                    />
                  {:else if document.mimeType === "application/pdf"}
                    <iframe
                      class="h-80 w-full bg-white"
                      src={document.previewUrl}
                      title={document.fileName}
                    ></iframe>
                  {:else}
                    <div class="p-6 text-sm text-slate-500">
                      {copy.detail.previewUnavailable}
                    </div>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <h2 class="card-title">{copy.detail.reviewHistoryTitle}</h2>
            <p class="text-sm text-slate-500">
              {copy.detail.reviewHistoryDescription}
            </p>
          </div>

          {#if data.detail.reviewEvents.length === 0}
            <div class="rounded-2xl border border-dashed border-base-300 p-6 text-sm text-slate-500">
              {copy.detail.noReviewEvents}
            </div>
          {:else}
            <div class="space-y-3">
              {#each data.detail.reviewEvents as reviewEvent}
                <div class="rounded-2xl border border-base-300 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap gap-2">
                      <span class="badge badge-outline">
                        {formatReviewAction(reviewEvent.action)}
                      </span>
                      <span class="badge badge-ghost">
                        {formatStatus(reviewEvent.fromStatus)} -> {formatStatus(reviewEvent.toStatus)}
                      </span>
                    </div>
                    <span class="text-xs text-slate-500">
                      {formatDate(reviewEvent.createdAt)}
                    </span>
                  </div>
                  <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {copy.detail.actor}
                      </dt>
                      <dd class="mt-1 text-sm text-slate-800">
                        {reviewEvent.actorAdminEmail ?? `Admin #${reviewEvent.actorAdminId ?? "-"}`}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">
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

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <h2 class="card-title">{copy.detail.reviewActionsTitle}</h2>
            <p class="text-sm text-slate-500">
              {copy.detail.reviewActionsDescription}
            </p>
          </div>

          <label class="form-control max-w-sm">
            <span class="label-text mb-2">MFA code</span>
            <input
              class="input input-bordered"
              name="totpCode"
              type="text"
              bind:value={stepUpCode}
              autocomplete="one-time-code"
            />
          </label>

          {#if data.detail.status !== "pending"}
            <div class="rounded-2xl border border-dashed border-base-300 p-6 text-sm text-slate-500">
              {copy.detail.noLongerPending}
            </div>
          {:else}
            <div class="grid gap-4">
              <form method="post" action="?/approve" class="rounded-2xl border border-base-300 p-4">
                <div class="space-y-3">
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <div>
                    <h3 class="font-semibold">{copy.detail.approve}</h3>
                    <p class="text-sm text-slate-500">
                      {copy.detail.approveDescription}
                    </p>
                  </div>
                  <label class="form-control">
                    <span class="label-text mb-2">{copy.detail.optionalReason}</span>
                    <textarea
                      class="textarea textarea-bordered min-h-24"
                      name="reason"
                    ></textarea>
                  </label>
                  <div class="flex justify-end">
                    <button class="btn btn-success" type="submit">
                      {copy.detail.approve}
                    </button>
                  </div>
                </div>
              </form>

              <form method="post" action="?/reject" class="rounded-2xl border border-error/30 p-4">
                <div class="space-y-3">
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <div>
                    <h3 class="font-semibold">{copy.detail.reject}</h3>
                    <p class="text-sm text-slate-500">
                      {copy.detail.rejectDescription}
                    </p>
                  </div>
                  <label class="form-control">
                    <span class="label-text mb-2">{copy.detail.requiredReason}</span>
                    <textarea
                      class="textarea textarea-bordered min-h-24"
                      name="reason"
                      required
                    ></textarea>
                  </label>
                  <div class="flex justify-end">
                    <button class="btn btn-error" type="submit">
                      {copy.detail.reject}
                    </button>
                  </div>
                </div>
              </form>

              <form
                method="post"
                action="?/requestMoreInfo"
                class="rounded-2xl border border-info/30 p-4"
              >
                <div class="space-y-3">
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <div>
                    <h3 class="font-semibold">{copy.detail.requestMoreInfo}</h3>
                    <p class="text-sm text-slate-500">
                      {copy.detail.requestMoreInfoDescription}
                    </p>
                  </div>
                  <label class="form-control">
                    <span class="label-text mb-2">{copy.detail.optionalReason}</span>
                    <textarea
                      class="textarea textarea-bordered min-h-24"
                      name="reason"
                    ></textarea>
                  </label>
                  <div class="flex justify-end">
                    <button class="btn btn-info" type="submit">
                      {copy.detail.requestMoreInfo}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          {/if}
        </div>
      </article>
    </section>
  {/if}
</div>
