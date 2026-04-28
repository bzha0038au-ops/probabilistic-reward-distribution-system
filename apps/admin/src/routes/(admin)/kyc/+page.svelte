<script lang="ts">
  import { getContext } from "svelte"
  import type { Locale } from "$lib/i18n"
  import type { KycAdminQueuePage } from "@reward/shared-types/kyc"

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

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatTier = (value: keyof typeof copy.tierLabels | null) =>
    value ? copy.tierLabels[value] ?? value : "-"

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
  <header class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {copy.title}
    </p>
    <h1 class="text-3xl font-semibold">{copy.title}</h1>
    <p class="text-sm text-slate-600">{copy.description}</p>
  </header>

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="card-title">{copy.queue.filtersTitle}</h2>
          <p class="text-sm text-slate-500">{copy.queue.filtersDescription}</p>
        </div>
        <span class="badge badge-outline">{copy.queue.pendingOnly}</span>
      </div>

      <form method="get" class="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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

        <div class="flex items-end gap-2">
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
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="card-title">{copy.queue.filtersTitle}</h2>
          <p class="text-sm text-slate-500">{copy.description}</p>
        </div>
        <span class="badge badge-outline">
          {data.queue.items.length}/{data.queue.limit}
        </span>
      </div>

      {#if data.queue.items.length === 0}
        <div class="rounded-2xl border border-dashed border-base-300 p-6 text-sm text-slate-500">
          {copy.queue.empty}
        </div>
      {:else}
        <div class="overflow-x-auto">
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
              {#each data.queue.items as item}
                <tr>
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
                        {formatTier(item.currentTier)} -> {formatTier(item.requestedTier)}
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
                  <td class="text-sm text-slate-600">
                    {formatDate(item.submittedAt)}
                  </td>
                  <td class="text-sm text-slate-600">{item.documentCount}</td>
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
                    <a class="btn btn-sm btn-primary" href={`/kyc/${item.id}`}>
                      {copy.queue.view}
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-end gap-2">
          {#if data.queue.page > 1}
            <a class="btn btn-sm btn-ghost" href={buildPageHref(data.queue.page - 1)}>
              {copy.common.prev}
            </a>
          {/if}
          <span class="text-sm text-slate-500">Page {data.queue.page}</span>
          {#if data.queue.hasNext}
            <a class="btn btn-sm btn-ghost" href={buildPageHref(data.queue.page + 1)}>
              {copy.common.next}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</div>
