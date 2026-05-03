<script lang="ts">
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import UserDetailModuleTabs from "../user-detail-module-tabs.svelte"

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

  type QueuedSignal = Signal & {
    kindLabel: string
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
        nodes: Array<{
          id: string
          type: string
          label: string
          subtitle: string | null
        }>
        edges: Array<{
          source: string
          target: string
          type: string
          label: string
        }>
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

  const allSignals = $derived.by<QueuedSignal[]>(() => {
    if (!graph) {
      return []
    }

    return [
      ...graph.deviceSignals.map((signal) => ({
        ...signal,
        kindLabel: copy.deviceTitle,
      })),
      ...graph.ipSignals.map((signal) => ({
        ...signal,
        kindLabel: copy.ipTitle,
      })),
      ...graph.payoutSignals.map((signal) => ({
        ...signal,
        kindLabel: copy.payoutTitle,
      })),
    ]
  })

  const selectedSignal = $derived(allSignals[0] ?? null)
  const priorityRelatedUser = $derived.by<RelatedUser | null>(() => {
    if (!graph || graph.relatedUsers.length === 0) {
      return null
    }

    return (
      [...graph.relatedUsers].sort((left, right) => {
        const leftScore = left.riskScore + (left.hasOpenRiskFlag ? 100 : 0)
        const rightScore = right.riskScore + (right.hasOpenRiskFlag ? 100 : 0)
        return rightScore - leftScore
      })[0] ?? null
    )
  })
</script>

<div class="space-y-6">
  <a
    href={data.userId ? `/users/${data.userId}` : "/users"}
    class="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] transition hover:text-[var(--admin-ink)]"
  >
    <span class="material-symbols-outlined text-sm">arrow_back</span>
    <span>{copy.back}</span>
  </a>

  {#if graph}
    {#snippet associationActions()}
      <div class="admin-header-action-cluster">
        <span class="badge badge-outline">{graph.windowDays}d window</span>
        <span class="badge badge-outline">{allSignals.length} signals</span>
        {#if data.userId}
          <a class="btn btn-outline btn-sm" href={`/users/${data.userId}`}>
            Open User Record
          </a>
        {/if}
      </div>
    {/snippet}

    <AdminPageHeader
      context="Workspace · associations"
      eyebrow="Users"
      title={copy.title}
      description={copy.description}
      actions={associationActions}
    />
  {:else}
    <AdminPageHeader
      context="Workspace · associations"
      eyebrow="Users"
      title={copy.title}
      description={copy.description}
    />
  {/if}

  {#if data.userId}
    <UserDetailModuleTabs userId={data.userId} />
  {/if}

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if graph}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-5"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {copy.summaryRelated}
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {graph.summary.relatedUserCount}
            </p>
            <span class="badge badge-outline">accounts</span>
          </div>
          <p class="text-sm text-slate-500">
            Accounts sharing at least one device, IP, or payout identifier.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {copy.summaryDevices}
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {graph.summary.deviceCount}
            </p>
            <span class="badge badge-outline">device</span>
          </div>
          <p class="text-sm text-slate-500">
            Unique device fingerprints contributing to the overlap graph.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {copy.summaryIps}
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {graph.summary.ipCount}
            </p>
            <span class="badge badge-outline">ip</span>
          </div>
          <p class="text-sm text-slate-500">
            Shared network entry points seen inside the selected review window.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {copy.summaryPayouts}
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {graph.summary.payoutCount}
            </p>
            <span class="badge badge-outline">payout</span>
          </div>
          <p class="text-sm text-slate-500">
            Overlapping payout instruments and wallet destinations in scope.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {copy.summaryFlagged}
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {graph.summary.flaggedRelatedUserCount}
            </p>
            <span class="badge badge-outline">risk</span>
          </div>
          <p class="text-sm text-slate-500">
            Related accounts already carrying an open risk flag or active
            freeze.
          </p>
        </div>
      </article>
    </section>

    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]"
    >
      <div class="min-w-0 space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-5">
            <div
              class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
            >
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Signal Queue
                </p>
                <h2 class="card-title mt-2">{copy.columnsSignal}</h2>
                <p class="text-sm text-slate-500">
                  Ranked overlap signals across device, network, and payout
                  surfaces.
                </p>
              </div>
              <span class="badge badge-outline"
                >generated {formatDate(graph.generatedAt)}</span
              >
            </div>

            {#if allSignals.length === 0}
              <div
                class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-5 text-sm text-slate-500"
              >
                {copy.signalEmpty}
              </div>
            {:else}
              <div
                class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table">
                  <thead>
                    <tr>
                      <th>{copy.columnsSignal}</th>
                      <th>Type</th>
                      <th>{copy.columnsUsers}</th>
                      <th>{copy.columnsActivity}</th>
                      <th>{copy.columnsLastSeen}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each allSignals as signal, index}
                      <tr
                        style={index === 0
                          ? "background: var(--admin-primary-soft);"
                          : signal.relatedUsers.some(
                                (user) => user.hasOpenRiskFlag || user.isFrozen,
                              )
                            ? "background: var(--admin-warning-soft);"
                            : undefined}
                      >
                        <td>
                          <div class="space-y-1">
                            <p class="font-medium text-slate-900">
                              {signal.label}
                            </p>
                            <p class="font-mono text-xs text-slate-500">
                              {signal.fingerprint ?? signal.value}
                            </p>
                          </div>
                        </td>
                        <td>
                          <span class="badge badge-outline"
                            >{signal.kindLabel}</span
                          >
                        </td>
                        <td class="font-mono text-xs text-slate-600">
                          {signal.userCount} users / {signal.eventCount} events
                        </td>
                        <td class="text-sm text-slate-600">
                          {signal.activityTypes.join(", ")}
                        </td>
                        <td class="font-mono text-xs text-slate-600">
                          {formatDate(signal.lastSeenAt)}
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
          <div class="card-body gap-5">
            <div
              class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
            >
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  {copy.relatedUsersTitle}
                </p>
                <h2 class="card-title mt-2">{copy.columnsUsers}</h2>
                <p class="text-sm text-slate-500">
                  {copy.relatedUsersDescription}
                </p>
              </div>
              <span class="badge badge-outline"
                >{graph.relatedUsers.length} related</span
              >
            </div>

            {#if graph.relatedUsers.length === 0}
              <div
                class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-5 text-sm text-slate-500"
              >
                {copy.relatedEmpty}
              </div>
            {:else}
              <div
                class="admin-table-scroll admin-table-scroll--wide overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
              >
                <table class="table">
                  <thead>
                    <tr>
                      <th>{copy.columnsUsers}</th>
                      <th>{copy.columnsRelations}</th>
                      <th>Risk</th>
                      <th>{copy.columnsNotes}</th>
                      <th class="text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each graph.relatedUsers as related, index}
                      <tr
                        style={index === 0
                          ? "background: var(--admin-primary-soft);"
                          : related.hasOpenRiskFlag || related.isFrozen
                            ? "background: var(--admin-warning-soft);"
                            : undefined}
                      >
                        <td>
                          <div class="space-y-1">
                            <p class="font-medium text-slate-900">
                              {userLabel(related)}
                            </p>
                            <p class="font-mono text-xs text-slate-500">
                              #{related.userId}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-wrap gap-2">
                            {#each related.relationTypes as relation}
                              <span class="badge badge-outline">
                                {relationLabel(relation)}
                              </span>
                            {/each}
                          </div>
                        </td>
                        <td>
                          <div class="space-y-1">
                            <p class="font-mono text-xs text-slate-700">
                              score {related.riskScore}
                            </p>
                            {#if related.hasOpenRiskFlag}
                              <span class="badge badge-warning"
                                >{copy.riskOpen}</span
                              >
                            {:else}
                              <span class="badge badge-outline"
                                >{copy.riskNone}</span
                              >
                            {/if}
                          </div>
                        </td>
                        <td class="text-sm text-slate-600">
                          {#if related.sharedDevices.length > 0}
                            {related.sharedDevices.join(", ")}
                          {/if}
                          {#if related.sharedDevices.length > 0 && related.sharedIps.length > 0}
                            <span> · </span>
                          {/if}
                          {#if related.sharedIps.length > 0}
                            {related.sharedIps.join(", ")}
                          {/if}
                          {#if related.sharedPayouts.length > 0}
                            <div class="mt-1 font-mono text-xs text-slate-500">
                              {related.sharedPayouts.join(", ")}
                            </div>
                          {/if}
                        </td>
                        <td class="text-right">
                          <a
                            class="btn btn-outline btn-sm"
                            href={`/users/${related.userId}`}
                          >
                            User
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

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                {copy.filtersTitle}
              </p>
              <h2 class="card-title mt-2">Window Controls</h2>
              <p class="text-sm text-slate-500">
                Tighten the investigation window to isolate more recent
                overlaps.
              </p>
            </div>

            <form method="get" class="space-y-4">
              <label class="form-control">
                <span class="label-text mb-2">{copy.filtersDays}</span>
                <select name="days" class="select select-bordered">
                  {#each [30, 90, 180, 365] as option}
                    <option value={option} selected={data.days === option}>
                      {option}
                    </option>
                  {/each}
                </select>
              </label>
              <button class="btn btn-primary w-full" type="submit">
                {copy.filtersApply}
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
                {copy.focusTitle}
              </p>
              <h2 class="card-title mt-2">Focus Account</h2>
              <p class="text-sm text-slate-500">{copy.focusDescription}</p>
            </div>

            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-[var(--admin-ink)]">
                    {userLabel(graph.user)}
                  </p>
                  <p class="mt-1 font-mono text-xs text-slate-500">
                    Generated {formatDate(graph.generatedAt)}
                  </p>
                </div>
                <span class="badge badge-outline"
                  >risk {graph.user.riskScore}</span
                >
              </div>

              <dl class="mt-4 space-y-3 text-sm text-slate-700">
                <div class="flex items-center justify-between gap-4">
                  <dt>Freeze</dt>
                  <dd>
                    {graph.user.isFrozen
                      ? `${copy.freezeActive} (${graph.user.freezeReason ?? "-"})`
                      : copy.freezeNone}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Risk Flag</dt>
                  <dd>
                    {graph.user.hasOpenRiskFlag
                      ? `${copy.riskOpen} (${graph.user.riskReason ?? "-"})`
                      : copy.riskNone}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt>Signal Limit</dt>
                  <dd class="font-mono text-xs">{graph.signalLimit}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Selected Signal
              </p>
              <h2 class="card-title mt-2">Primary Overlap</h2>
              <p class="text-sm text-slate-500">
                Promote the most immediate overlap into review context.
              </p>
            </div>

            {#if selectedSignal}
              <div class="admin-selected-dossier p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold text-[var(--admin-ink)]">
                      {selectedSignal.label}
                    </p>
                    <p class="mt-1 font-mono text-xs text-slate-500">
                      {selectedSignal.fingerprint ?? selectedSignal.value}
                    </p>
                  </div>
                  <span class="badge badge-outline">
                    {selectedSignal.kindLabel}
                  </span>
                </div>

                <dl class="mt-4 space-y-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-4">
                    <dt>Linked Users</dt>
                    <dd class="font-mono text-xs">
                      {selectedSignal.userCount}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Event Count</dt>
                    <dd class="font-mono text-xs">
                      {selectedSignal.eventCount}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Last Seen</dt>
                    <dd class="font-mono text-xs">
                      {formatDate(selectedSignal.lastSeenAt)}
                    </dd>
                  </div>
                </dl>

                <div class="mt-4 flex flex-wrap gap-2">
                  {#each selectedSignal.relatedUsers as related}
                    <a
                      class="badge badge-outline"
                      href={`/users/${related.userId}`}
                    >
                      #{related.userId}
                    </a>
                  {/each}
                </div>
              </div>
            {:else}
              <div
                class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
              >
                {copy.signalEmpty}
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
                Review Protocol
              </p>
              <h2 class="card-title mt-2">Operator Notes</h2>
              <p class="text-sm text-slate-500">
                Keep the overlap queue, focus account, and related-account risk
                state aligned before escalating.
              </p>
            </div>

            <ul class="space-y-2 text-sm text-slate-600">
              <li>
                1. Confirm the overlap type before treating shared signals as
                collusion evidence.
              </li>
              <li>
                2. Compare freeze status and open risk flags across every linked
                account.
              </li>
              <li>
                3. Escalate to user detail when payout overlap and login overlap
                stack together.
              </li>
            </ul>

            {#if priorityRelatedUser}
              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Priority Related Account
                </p>
                <p class="mt-3 font-semibold text-slate-900">
                  {userLabel(priorityRelatedUser)}
                </p>
                <p class="mt-1 text-sm text-slate-600">
                  score {priorityRelatedUser.riskScore} · {priorityRelatedUser.hasOpenRiskFlag
                    ? copy.riskOpen
                    : copy.riskNone}
                </p>
                <a
                  class="btn btn-outline btn-sm mt-4 w-full"
                  href={`/users/${priorityRelatedUser.userId}`}
                >
                  Open Related User
                </a>
              </div>
            {/if}
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
