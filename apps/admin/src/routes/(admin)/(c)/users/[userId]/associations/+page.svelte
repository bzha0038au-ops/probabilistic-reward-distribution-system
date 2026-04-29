<script lang="ts">
  type RiskUserStatus = {
    userId: number
    email: string | null
    isFrozen: boolean
    freezeReason: string | null
    hasOpenRiskFlag: boolean
    manualFlagged: boolean
    riskReason: string | null
    riskScore: number
  }

  type Signal = {
    id: string
    kind: "device" | "ip" | "payout"
    label: string
    fingerprint?: string | null
    value: string
    eventCount: number
    userCount: number
    lastSeenAt?: string | null
    activityTypes: string[]
    relatedUsers: RiskUserStatus[]
  }

  type RelatedUser = RiskUserStatus & {
    relationTypes: Array<"device" | "ip" | "payout">
    sharedDevices: string[]
    sharedIps: string[]
    sharedPayouts: string[]
  }

  type PageData = {
    graph: {
      user: RiskUserStatus
      windowDays: number
      signalLimit: number
      generatedAt: string
      summary: {
        deviceCount: number
        ipCount: number
        payoutCount: number
        relatedUserCount: number
        flaggedRelatedUserCount: number
      }
      deviceSignals: Signal[]
      ipSignals: Signal[]
      payoutSignals: Signal[]
      relatedUsers: RelatedUser[]
      graph: {
        nodes: Array<{ id: string; type: string; label: string; subtitle: string | null }>
        edges: Array<{ source: string; target: string; type: string; label: string }>
      }
    } | null
    error: string | null
    copy: {
      back: string
      title: string
      description: string
      filtersTitle: string
      filtersDescription: string
      filtersDays: string
      filtersApply: string
      focusTitle: string
      focusDescription: string
      relatedUsersTitle: string
      relatedUsersDescription: string
      deviceTitle: string
      ipTitle: string
      payoutTitle: string
      signalEmpty: string
      relatedEmpty: string
      summaryRelated: string
      summaryDevices: string
      summaryIps: string
      summaryPayouts: string
      summaryFlagged: string
      freezeActive: string
      freezeNone: string
      riskOpen: string
      riskNone: string
      columnsSignal: string
      columnsUsers: string
      columnsActivity: string
      columnsLastSeen: string
      columnsRelations: string
      columnsNotes: string
    }
    userId: number | null
    days: number
  }

  let { data }: { data: PageData } = $props()

  const graph = $derived(data.graph)
  const copy = $derived(data.copy)

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const userLabel = (user: RiskUserStatus) =>
    user.email ? `${user.email} (#${user.userId})` : `User #${user.userId}`

  const relationLabel = (value: "device" | "ip" | "payout") =>
    value === "device"
      ? copy.deviceTitle
      : value === "ip"
        ? copy.ipTitle
        : copy.payoutTitle

  const signalSections = $derived(
    graph
      ? [
          { title: copy.deviceTitle, items: graph.deviceSignals },
          { title: copy.ipTitle, items: graph.ipSignals },
          { title: copy.payoutTitle, items: graph.payoutSignals },
        ]
      : [],
  )
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <a
      href={data.userId ? `/users/${data.userId}` : "/users"}
      class="text-sm text-primary hover:underline"
    >
      {copy.back}
    </a>
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      Users
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
    <div class="card-body">
      <div>
        <h2 class="card-title">{copy.filtersTitle}</h2>
        <p class="text-sm text-slate-500">{copy.filtersDescription}</p>
      </div>

      <form method="get" class="mt-4 flex flex-wrap items-end gap-4">
        <label class="form-control w-full max-w-xs">
          <span class="label-text mb-2">{copy.filtersDays}</span>
          <select name="days" class="select select-bordered">
            {#each [30, 90, 180, 365] as option}
              <option value={option} selected={data.days === option}>{option}</option>
            {/each}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">{copy.filtersApply}</button>
      </form>
    </div>
  </section>

  {#if graph}
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-1">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
            {copy.summaryRelated}
          </p>
          <p class="text-3xl font-semibold">{graph.summary.relatedUserCount}</p>
        </div>
      </article>
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-1">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
            {copy.summaryDevices}
          </p>
          <p class="text-3xl font-semibold">{graph.summary.deviceCount}</p>
        </div>
      </article>
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-1">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
            {copy.summaryIps}
          </p>
          <p class="text-3xl font-semibold">{graph.summary.ipCount}</p>
        </div>
      </article>
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-1">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
            {copy.summaryPayouts}
          </p>
          <p class="text-3xl font-semibold">{graph.summary.payoutCount}</p>
        </div>
      </article>
      <article class="card border border-amber-200 bg-amber-50 shadow-sm">
        <div class="card-body gap-1">
          <p class="text-xs uppercase tracking-[0.2em] text-amber-700">
            {copy.summaryFlagged}
          </p>
          <p class="text-3xl font-semibold text-amber-900">
            {graph.summary.flaggedRelatedUserCount}
          </p>
        </div>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{copy.focusTitle}</h2>
            <p class="text-sm text-slate-500">{copy.focusDescription}</p>
          </div>

          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-lg font-semibold text-slate-900">
                  {userLabel(graph.user)}
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  Generated {formatDate(graph.generatedAt)}
                </p>
              </div>
              <span class="badge badge-outline">Risk {graph.user.riskScore}</span>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-white p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Freeze
                </p>
                <p class="mt-2 text-sm text-slate-800">
                  {graph.user.isFrozen
                    ? `${copy.freezeActive} (${graph.user.freezeReason ?? "-"})`
                    : copy.freezeNone}
                </p>
              </div>
              <div class="rounded-2xl bg-white p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Risk
                </p>
                <p class="mt-2 text-sm text-slate-800">
                  {graph.user.hasOpenRiskFlag
                    ? `${copy.riskOpen} (${graph.user.riskReason ?? "-"})`
                    : copy.riskNone}
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{copy.relatedUsersTitle}</h2>
            <p class="text-sm text-slate-500">{copy.relatedUsersDescription}</p>
          </div>

          {#if graph.relatedUsers.length === 0}
            <div class="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              {copy.relatedEmpty}
            </div>
          {:else}
            <div class="grid gap-3">
              {#each graph.relatedUsers as related}
                <article class="rounded-3xl border border-slate-200 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold text-slate-900">{userLabel(related)}</p>
                      <p class="mt-1 text-sm text-slate-500">
                        {#if related.sharedDevices.length > 0}
                          {related.sharedDevices.join(", ")}
                        {/if}
                        {#if related.sharedDevices.length > 0 && related.sharedIps.length > 0}
                          ·
                        {/if}
                        {#if related.sharedIps.length > 0}
                          {related.sharedIps.join(", ")}
                        {/if}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <span class="badge badge-outline">Risk {related.riskScore}</span>
                      {#if related.hasOpenRiskFlag}
                        <span class="badge badge-warning">{copy.riskOpen}</span>
                      {/if}
                      {#if related.isFrozen}
                        <span class="badge badge-error">{copy.freezeActive}</span>
                      {/if}
                    </div>
                  </div>

                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each related.relationTypes as relation}
                      <span class="badge badge-ghost">{relationLabel(relation)}</span>
                    {/each}
                  </div>

                  <div class="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <div>
                      <p class="font-medium text-slate-800">{copy.deviceTitle}</p>
                      <p>{related.sharedDevices.join(", ") || "-"}</p>
                    </div>
                    <div>
                      <p class="font-medium text-slate-800">{copy.ipTitle}</p>
                      <p>{related.sharedIps.join(", ") || "-"}</p>
                    </div>
                    <div>
                      <p class="font-medium text-slate-800">{copy.payoutTitle}</p>
                      <p>{related.sharedPayouts.join(", ") || "-"}</p>
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </article>
    </section>

    <section class="grid gap-6">
      {#each signalSections as section}
        <article class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title">{section.title}</h2>

            {#if section.items.length === 0}
              <div class="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                {copy.signalEmpty}
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-zebra">
                  <thead>
                    <tr>
                      <th>{copy.columnsSignal}</th>
                      <th>{copy.columnsUsers}</th>
                      <th>{copy.columnsActivity}</th>
                      <th>{copy.columnsLastSeen}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each section.items as signal}
                      <tr>
                        <td>
                          <div class="space-y-1">
                            <p class="font-medium text-slate-900">{signal.label}</p>
                            <p class="text-xs text-slate-500">
                              {signal.userCount} users · {signal.eventCount} events
                            </p>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-wrap gap-2">
                            {#each signal.relatedUsers as related}
                              <a
                                class="badge badge-outline"
                                href={`/users/${related.userId}`}
                              >
                                #{related.userId}
                              </a>
                            {/each}
                          </div>
                        </td>
                        <td class="text-sm text-slate-600">
                          {signal.activityTypes.join(", ")}
                        </td>
                        <td class="text-sm text-slate-600">
                          {formatDate(signal.lastSeenAt)}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </section>
  {/if}
</div>
