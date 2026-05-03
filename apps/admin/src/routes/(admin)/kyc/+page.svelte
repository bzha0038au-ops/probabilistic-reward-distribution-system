<script lang="ts">
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import type { Locale } from "$lib/i18n"
  import type {
    KycAdminQueueItem,
    KycAdminQueuePage,
  } from "@reward/shared-types/kyc"

  import { getKycCopy } from "./copy"

  type PageData = {
    queue: KycAdminQueuePage
    filters: {
      tier: string
      from: string
      to: string
      riskFlag: string
      limit: number
      page: number
    }
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { locale } = getContext("i18n") as { locale: () => Locale }
  const copy = $derived(getKycCopy(locale()))
  const items = $derived(data.queue.items ?? [])
  const flaggedCount = $derived(
    items.filter((item) => item.riskFlags.length > 0).length,
  )
  const frozenCount = $derived(
    items.filter((item) => item.hasActiveFreeze).length,
  )
  const selectedCase = $derived<KycAdminQueueItem | null>(items[0] ?? null)

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatTier = (value: keyof typeof copy.tierLabels | null) =>
    value ? (copy.tierLabels[value] ?? value) : "-"

  const formatFlag = (value: string) => value.replaceAll("_", " ")

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    if (data.filters.tier) params.set("tier", data.filters.tier)
    if (data.filters.from) params.set("from", data.filters.from)
    if (data.filters.to) params.set("to", data.filters.to)
    if (data.filters.riskFlag) params.set("riskFlag", data.filters.riskFlag)
    params.set("limit", String(data.queue.limit))
    params.set("page", String(page))
    return `/kyc?${params.toString()}`
  }
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · identityReview"
    eyebrow="KYC"
    title={copy.title}
    description={copy.description}
  />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Review Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {items.length}
          </p>
          <span class="badge badge-outline">pending only</span>
        </div>
        <p class="text-sm text-slate-500">
          Cases currently loaded into this KYC review slice.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Risk Markers
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {flaggedCount}
          </p>
          <span class="badge badge-outline">flagged</span>
        </div>
        <p class="text-sm text-slate-500">
          Profiles with enhanced review heuristics or operator flags.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Freeze Gate
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {frozenCount}
          </p>
          <span class="badge badge-outline">active</span>
        </div>
        <p class="text-sm text-slate-500">
          Cases linked to an active withdrawal freeze during review.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Page Slice
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {data.queue.page}
          </p>
          <span class="badge badge-outline">
            limit {data.queue.limit}
          </span>
        </div>
        <p class="text-sm text-slate-500">
          Current operator page and queue size for this review pass.
        </p>
      </div>
    </article>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]"
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
              <h2 class="card-title mt-2">{copy.queue.filtersTitle}</h2>
              <p class="text-sm text-slate-500">{copy.description}</p>
            </div>
            <span class="badge badge-outline">
              {items.length}/{data.queue.limit}
            </span>
          </div>

          {#if items.length === 0}
            <div
              class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
            >
              {copy.queue.empty}
            </div>
          {:else}
            <div
              class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
            >
              <table class="table">
                <thead>
                  <tr>
                    <th>{copy.queue.columns.profile}</th>
                    <th>{copy.queue.columns.tier}</th>
                    <th>{copy.queue.columns.flags}</th>
                    <th>{copy.queue.columns.submittedAt}</th>
                    <th>{copy.queue.columns.documents}</th>
                    <th>{copy.queue.columns.freeze}</th>
                    <th>{copy.queue.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as item, index}
                    <tr
                      style={index === 0
                        ? "background: var(--admin-primary-soft);"
                        : item.hasActiveFreeze
                          ? "background: var(--admin-danger-soft);"
                          : undefined}
                    >
                      <td>
                        <div class="space-y-1">
                          <p class="font-medium text-slate-900">#{item.id}</p>
                          <p class="text-sm text-slate-700">{item.userEmail}</p>
                          <p class="text-xs text-slate-500">
                            {item.legalName ?? `User #${item.userId}`}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div class="space-y-1">
                          <span class="badge badge-outline">
                            {formatTier(item.tier)}
                          </span>
                          <p class="text-xs text-slate-500">
                            {formatTier(item.currentTier)} -> {formatTier(
                              item.requestedTier,
                            )}
                          </p>
                        </div>
                      </td>
                      <td>
                        {#if item.riskFlags.length === 0}
                          <span class="text-sm text-slate-500">-</span>
                        {:else}
                          <div class="flex flex-wrap gap-2">
                            {#each item.riskFlags as riskFlag}
                              <span class="badge badge-warning badge-outline">
                                {formatFlag(riskFlag)}
                              </span>
                            {/each}
                          </div>
                        {/if}
                      </td>
                      <td class="font-mono text-xs text-slate-600">
                        {formatDate(item.submittedAt)}
                      </td>
                      <td class="font-mono text-xs text-slate-600">
                        {item.documentCount}
                      </td>
                      <td>
                        {#if item.hasActiveFreeze}
                          <span class="badge badge-error badge-outline">
                            {copy.queue.activeFreeze}
                          </span>
                        {:else}
                          <span class="badge badge-success badge-outline">
                            {copy.queue.noFreeze}
                          </span>
                        {/if}
                      </td>
                      <td>
                        <a
                          class="btn btn-sm btn-primary"
                          href={`/kyc/${item.id}`}
                        >
                          {copy.queue.view}
                        </a>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="admin-pagination">
              {#if data.queue.page > 1}
                <a
                  class="btn btn-sm btn-ghost"
                  href={buildPageHref(data.queue.page - 1)}
                >
                  {copy.common.prev}
                </a>
              {/if}
              <span class="text-sm text-slate-500">Page {data.queue.page}</span>
              {#if data.queue.hasNext}
                <a
                  class="btn btn-sm btn-ghost"
                  href={buildPageHref(data.queue.page + 1)}
                >
                  {copy.common.next}
                </a>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <aside class="space-y-6 xl:sticky xl:top-24 xl:self-start">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Queue Filters
            </p>
            <h2 class="card-title mt-2">{copy.queue.filtersTitle}</h2>
            <p class="text-sm text-slate-500">
              {copy.queue.filtersDescription}
            </p>
          </div>

          <form method="get" class="space-y-4">
            <label class="form-control">
              <span class="label-text mb-2">{copy.queue.tier}</span>
              <select
                class="select select-bordered"
                name="tier"
                value={data.filters.tier}
              >
                <option value="">All</option>
                <option value="tier_0">{copy.tierLabels.tier_0}</option>
                <option value="tier_1">{copy.tierLabels.tier_1}</option>
                <option value="tier_2">{copy.tierLabels.tier_2}</option>
              </select>
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-2">{copy.queue.from}</span>
                <input
                  class="input input-bordered"
                  type="date"
                  name="from"
                  value={data.filters.from}
                />
              </label>

              <label class="form-control">
                <span class="label-text mb-2">{copy.queue.to}</span>
                <input
                  class="input input-bordered"
                  type="date"
                  name="to"
                  value={data.filters.to}
                />
              </label>
            </div>

            <label class="form-control">
              <span class="label-text mb-2">{copy.queue.riskFlag}</span>
              <input
                class="input input-bordered"
                name="riskFlag"
                value={data.filters.riskFlag}
                placeholder="enhanced_tier_review"
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">{copy.queue.limit}</span>
              <input
                class="input input-bordered"
                type="number"
                min="1"
                max="100"
                name="limit"
                value={String(data.filters.limit)}
              />
            </label>

            <div class="flex gap-2">
              <button class="btn btn-primary flex-1" type="submit">
                {copy.queue.apply}
              </button>
              <a class="btn btn-ghost" href="/kyc">{copy.queue.reset}</a>
            </div>
          </form>
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Selected Case
            </p>
            <h2 class="card-title mt-2">Case Routing</h2>
            <p class="text-sm text-slate-500">
              Promote the first pending record into a document-level review.
            </p>
          </div>

          {#if selectedCase}
            <div class="admin-selected-dossier p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-[var(--admin-ink)]">
                    {selectedCase.userEmail}
                  </p>
                  <p class="text-xs text-slate-500">
                    #{selectedCase.id} · User #{selectedCase.userId}
                  </p>
                </div>
                <span class="badge badge-outline">selected</span>
              </div>

              <dl class="mt-4 space-y-3 text-sm text-slate-600">
                <div class="flex items-center justify-between gap-4">
                  <dt>Tier path</dt>
                  <dd class="text-right">
                    {formatTier(selectedCase.currentTier)} -> {formatTier(
                      selectedCase.requestedTier,
                    )}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Submitted</dt>
                  <dd class="font-mono text-xs">
                    {formatDate(selectedCase.submittedAt)}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Documents</dt>
                  <dd class="font-mono text-xs">
                    {selectedCase.documentCount}
                  </dd>
                </div>
              </dl>

              {#if selectedCase.riskFlags.length > 0}
                <div class="mt-4 flex flex-wrap gap-2">
                  {#each selectedCase.riskFlags as riskFlag}
                    <span class="badge badge-warning badge-outline">
                      {formatFlag(riskFlag)}
                    </span>
                  {/each}
                </div>
              {/if}

              <a
                class="btn btn-primary mt-4 w-full"
                href={`/kyc/${selectedCase.id}`}
              >
                {copy.queue.view}
              </a>
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
            >
              {copy.queue.empty}
            </div>
          {/if}
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-3">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Review Protocol
          </p>
          <ul class="space-y-2 text-sm text-slate-600">
            <li>
              1. Triage flagged profiles first, then clear the quieter queue.
            </li>
            <li>
              2. Validate the document set before approving the requested tier.
            </li>
            <li>
              3. Preserve freeze context and rejection reasons for downstream
              audit.
            </li>
          </ul>
        </div>
      </section>
    </aside>
  </section>
</div>
