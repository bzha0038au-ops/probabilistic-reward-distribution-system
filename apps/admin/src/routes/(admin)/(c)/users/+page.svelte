<script lang="ts">
  import { getContext } from "svelte"

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
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {t("users.title")}
    </p>
    <h1 class="text-3xl font-semibold">{t("users.title")}</h1>
    <p class="text-sm text-slate-600">{t("users.description")}</p>
  </header>

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">{t("users.search.title")}</h2>
        <p class="text-sm text-slate-500">{t("users.search.description")}</p>
      </div>

      <form method="get" class="grid gap-4 md:grid-cols-[1fr_auto]">
        <label class="form-control">
          <span class="label-text mb-2">{t("users.search.label")}</span>
          <input
            name="query"
            class="input input-bordered"
            value={data.query}
            placeholder={t("users.search.placeholder")}
          />
        </label>
        <div class="flex items-end">
          <button class="btn btn-primary w-full md:w-auto" type="submit">
            {t("users.search.submit")}
          </button>
        </div>
      </form>
    </div>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="card-title">{t("users.search.resultsTitle")}</h2>
          <p class="text-sm text-slate-500">
            {data.query
              ? t("users.search.resultsDescription")
              : t("users.search.resultsEmptyHint")}
          </p>
        </div>
        <span class="badge badge-outline">
          {data.results.items.length}/{data.results.limit}
        </span>
      </div>

      {#if data.results.items.length === 0}
        <div class="rounded-2xl border border-dashed border-base-300 p-6 text-sm text-slate-500">
          {data.query ? t("users.search.noResults") : t("users.search.idle")}
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>{t("users.table.user")}</th>
                <th>{t("users.table.kyc")}</th>
                <th>{t("users.table.freeze")}</th>
                <th>{t("users.table.createdAt")}</th>
                <th>{t("users.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.results.items as item}
                <tr>
                  <td>
                    <div class="space-y-1">
                      <p class="font-medium text-slate-900">#{item.id}</p>
                      <p class="text-sm text-slate-700">{item.email}</p>
                      <p class="text-xs text-slate-500">{item.phone ?? "-"}</p>
                    </div>
                  </td>
                  <td>
                    <div class="space-y-1">
                      <span class="badge badge-outline">
                        {formatKycTier(item.kycTier)}
                      </span>
                      <p class="text-xs text-slate-500">
                        {item.phoneVerifiedAt
                          ? t("users.status.phoneVerified")
                          : item.emailVerifiedAt
                            ? t("users.status.emailVerified")
                            : t("users.status.unverified")}
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
                  <td class="text-sm text-slate-600">
                    {formatDate(item.createdAt)}
                  </td>
                  <td>
                    <a class="btn btn-sm btn-primary" href={`/users/${item.id}`}>
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
