<script lang="ts">
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  type SearchItem = {
    id: number
    email: string
    phone: string | null
    createdAt: string
    emailVerifiedAt?: string | null
    phoneVerifiedAt?: string | null
    kycTier: string
    activeScopes: string[]
  }

  type PageData = {
    query: string
    results: {
      query: string
      limit: number
      items: SearchItem[]
    }
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const results = $derived(data.results.items ?? [])
  const selectedResult = $derived(results[0] ?? null)
  const verifiedCount = $derived(
    results.filter((item) => item.phoneVerifiedAt || item.emailVerifiedAt)
      .length,
  )
  const frozenCount = $derived(
    results.filter((item) => item.activeScopes.length > 0).length,
  )
  const elevatedKycCount = $derived(
    results.filter((item) => item.kycTier !== "tier_0").length,
  )

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatScope = (scope: string) =>
    ({
      account_lock: t("users.scope.account"),
      gameplay_lock: t("users.scope.gameplay"),
      topup_lock: t("users.scope.topup"),
      withdrawal_lock: t("users.scope.withdrawal"),
    })[scope] ?? scope

  const formatKycTier = (tier: string) =>
    ({
      tier_0: t("users.kyc.tier0"),
      tier_1: t("users.kyc.tier1"),
      tier_2: t("users.kyc.tier2"),
    })[tier] ?? tier

  const verificationLabel = (item: SearchItem) =>
    item.phoneVerifiedAt
      ? t("users.status.phoneVerified")
      : item.emailVerifiedAt
        ? t("users.status.emailVerified")
        : t("users.status.unverified")
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · users"
    eyebrow="Users"
    title={t("users.title")}
    description={t("users.description")}
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
          Search Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {results.length}
          </p>
          <span class="badge badge-outline">loaded</span>
        </div>
        <p class="text-sm text-slate-500">
          Results currently visible for the active user lookup.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Verified Contact
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {verifiedCount}
          </p>
          <span class="badge badge-outline">contact</span>
        </div>
        <p class="text-sm text-slate-500">
          Matched accounts with at least one verified email or phone channel.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Active Freezes
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {frozenCount}
          </p>
          <span class="badge badge-outline">scope</span>
        </div>
        <p class="text-sm text-slate-500">
          Results carrying at least one active account, gameplay, top-up, or
          withdrawal lock.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          KYC Ready
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {elevatedKycCount}
          </p>
          <span class="badge badge-outline">tier 1+</span>
        </div>
        <p class="text-sm text-slate-500">
          Accounts currently at Tier 1 or Tier 2 in the visible result set.
        </p>
      </div>
    </article>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(320px,0.78fr)]"
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
                User Queue
              </p>
              <h2 class="card-title mt-2">{t("users.search.resultsTitle")}</h2>
              <p class="text-sm text-slate-500">
                {data.query
                  ? t("users.search.resultsDescription")
                  : t("users.search.resultsEmptyHint")}
              </p>
            </div>
            <span class="badge badge-outline">
              {results.length}/{data.results.limit}
            </span>
          </div>

          {#if results.length === 0}
            <div class="admin-empty-state p-6 text-sm">
              {data.query
                ? t("users.search.noResults")
                : t("users.search.idle")}
            </div>
          {:else}
            <div
              class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
            >
              <table class="table">
                <thead>
                  <tr>
                    <th>{t("users.table.user")}</th>
                    <th>{t("users.table.kyc")}</th>
                    <th>{t("users.table.freeze")}</th>
                    <th>{t("users.table.createdAt")}</th>
                    <th class="text-right">{t("users.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each results as item, index}
                    <tr
                      style={index === 0
                        ? "background: var(--admin-primary-soft);"
                        : item.activeScopes.length > 0
                          ? "background: var(--admin-warning-soft);"
                          : undefined}
                    >
                      <td>
                        <div class="space-y-1">
                          <p class="font-medium text-slate-900">#{item.id}</p>
                          <p class="text-sm text-slate-700">{item.email}</p>
                          <p class="font-mono text-xs text-slate-500">
                            {item.phone ?? "-"}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div class="space-y-1">
                          <span class="badge badge-outline">
                            {formatKycTier(item.kycTier)}
                          </span>
                          <p class="text-xs text-slate-500">
                            {verificationLabel(item)}
                          </p>
                        </div>
                      </td>
                      <td>
                        {#if item.activeScopes.length === 0}
                          <span class="text-sm text-slate-500">
                            {t("users.status.noFreeze")}
                          </span>
                        {:else}
                          <div class="flex flex-wrap gap-2">
                            {#each item.activeScopes as scope}
                              <span class="badge badge-warning badge-outline">
                                {formatScope(scope)}
                              </span>
                            {/each}
                          </div>
                        {/if}
                      </td>
                      <td class="font-mono text-xs text-slate-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td class="text-right">
                        <a
                          class="btn btn-sm btn-primary"
                          href={`/users/${item.id}`}
                        >
                          {t("users.table.view")}
                        </a>
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

    <aside class="space-y-6 xl:sticky xl:top-24 xl:self-start">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Lookup Console
            </p>
            <h2 class="card-title mt-2">{t("users.search.title")}</h2>
            <p class="text-sm text-slate-500">
              {t("users.search.description")}
            </p>
          </div>

          <form method="get" class="space-y-4">
            <label class="form-control">
              <span class="label-text mb-2">{t("users.search.label")}</span>
              <input
                name="query"
                class="input input-bordered"
                value={data.query}
                placeholder={t("users.search.placeholder")}
              />
            </label>
            <button class="btn btn-primary w-full" type="submit">
              {t("users.search.submit")}
            </button>
          </form>
        </div>
      </section>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Selected Result
            </p>
            <h2 class="card-title mt-2">User Dossier</h2>
            <p class="text-sm text-slate-500">
              Promote the first matching result into the full user investigation
              workspace.
            </p>
          </div>

          {#if selectedResult}
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-[var(--admin-ink)]">
                    {selectedResult.email}
                  </p>
                  <p class="font-mono text-xs text-slate-500">
                    #{selectedResult.id}
                  </p>
                </div>
                <span class="badge badge-outline">selected</span>
              </div>

              <dl class="mt-4 space-y-3 text-sm text-slate-600">
                <div class="flex items-center justify-between gap-4">
                  <dt>KYC</dt>
                  <dd>{formatKycTier(selectedResult.kycTier)}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Contact</dt>
                  <dd>{verificationLabel(selectedResult)}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Created</dt>
                  <dd class="font-mono text-xs">
                    {formatDate(selectedResult.createdAt)}
                  </dd>
                </div>
              </dl>

              {#if selectedResult.activeScopes.length > 0}
                <div class="mt-4 flex flex-wrap gap-2">
                  {#each selectedResult.activeScopes as scope}
                    <span class="badge badge-warning badge-outline">
                      {formatScope(scope)}
                    </span>
                  {/each}
                </div>
              {/if}

              <a
                class="btn btn-primary mt-4 w-full"
                href={`/users/${selectedResult.id}`}
              >
                {t("users.table.view")}
              </a>
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
            >
              {data.query
                ? t("users.search.noResults")
                : t("users.search.idle")}
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
              1. Search by email, phone, or user ID before opening write
              actions.
            </li>
            <li>
              2. Confirm KYC tier, freeze scope, and verification state
              together.
            </li>
            <li>
              3. Escalate to the association graph when multiple risk surfaces
              overlap.
            </li>
          </ul>
        </div>
      </section>
    </aside>
  </section>
</div>
