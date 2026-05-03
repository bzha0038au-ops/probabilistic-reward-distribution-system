<script lang="ts">
  import { page } from "$app/stores"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import type { SaasOverview } from "@reward/shared-types/saas"

  interface PageData {
    overview: SaasOverview | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")
  let breakGlassCode = $state("")
  let selectedDisputeId = $state<number | null>(null)

  const overview = $derived(data.overview)
  const actionError = $derived(
    ($page.form?.error as string | undefined) ?? null,
  )
  const disputeReviewed = $derived(Boolean($page.form?.disputeReviewed))
  const disputes = $derived(overview?.disputes ?? [])
  const tenants = $derived(overview?.tenants ?? [])
  const billingRuns = $derived(overview?.billingRuns ?? [])
  const openDisputes = $derived(
    disputes.filter(
      (dispute) =>
        dispute.status === "submitted" || dispute.status === "under_review",
    ),
  )
  const closedDisputes = $derived(
    disputes.filter(
      (dispute) =>
        dispute.status !== "submitted" && dispute.status !== "under_review",
    ),
  )
  const underReviewCount = $derived(
    disputes.filter((dispute) => dispute.status === "under_review").length,
  )
  const creditedDisputes = $derived(
    closedDisputes.filter((dispute) => dispute.stripeCreditNoteId).length,
  )
  const affectedBillingRuns = $derived(
    new Set(disputes.map((dispute) => dispute.billingRunId)).size,
  )
  const billingRunById = $derived(
    new Map(billingRuns.map((run) => [run.id, run] as const)),
  )
  const tenantById = $derived(
    new Map(tenants.map((entry) => [entry.tenant.id, entry.tenant] as const)),
  )
  const selectedDispute = $derived(
    disputes.find((dispute) => dispute.id === selectedDisputeId) ??
      disputes[0] ??
      null,
  )
  const selectedTenant = $derived(
    selectedDispute ? (tenantById.get(selectedDispute.tenantId) ?? null) : null,
  )
  const selectedBillingRun = $derived(
    selectedDispute
      ? (billingRunById.get(selectedDispute.billingRunId) ?? null)
      : null,
  )

  $effect(() => {
    if (disputes.length === 0) {
      selectedDisputeId = null
      return
    }
    if (
      selectedDisputeId === null ||
      !disputes.some((dispute) => dispute.id === selectedDisputeId)
    ) {
      selectedDisputeId = openDisputes[0]?.id ?? disputes[0]?.id ?? null
    }
  })

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString()
  }

  const humanize = (value: string | null | undefined) =>
    value ? value.replaceAll("_", " ") : "—"

  const isOpenStatus = (status: string) =>
    status === "submitted" || status === "under_review"
</script>

{#snippet headerActions()}
  <a href="/saas" class="btn btn-outline btn-sm">Back to SaaS overview</a>
{/snippet}

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · saasOps"
    eyebrow="Business"
    title="Billing Disputes"
    description="Portal-submitted invoice disputes, refund decisions, and reversing billing ledger commands all stay on one governed review desk."
    actions={headerActions}
  />

  {#if data.error}
    <div class="alert alert-error text-sm">{data.error}</div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">{actionError}</div>
  {/if}

  {#if disputeReviewed}
    <div class="alert alert-success text-sm">Billing dispute updated.</div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Open Queue
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {openDisputes.length}
          </p>
          <span class="badge badge-outline">cases</span>
        </div>
        <p class="text-sm text-slate-500">
          Submitted disputes currently waiting for operator resolution.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Under Review
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {underReviewCount}
          </p>
          <span class="badge badge-outline">active</span>
        </div>
        <p class="text-sm text-slate-500">
          Disputes already being examined but not yet committed.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Credit Notes
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {creditedDisputes}
          </p>
          <span class="badge badge-outline">issued</span>
        </div>
        <p class="text-sm text-slate-500">
          Resolved disputes already tied to a Stripe credit note.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Billing Runs
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {affectedBillingRuns}
          </p>
          <span class="badge badge-outline">linked</span>
        </div>
        <p class="text-sm text-slate-500">
          Unique invoice runs currently represented in the dispute ledger.
        </p>
      </div>
    </article>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.82fr)]"
  >
    <div class="admin-main--after-rail-xl min-w-0 space-y-6">
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
              <h2 class="card-title mt-2">Open Disputes</h2>
              <p class="text-sm text-slate-500">
                Each queue card links the tenant, billing run, requested refund,
                and current posture before any reversing ledger action is
                issued.
              </p>
            </div>
            <span class="badge badge-outline">{openDisputes.length} open</span>
          </div>

          {#if openDisputes.length === 0}
            <div class="admin-empty-state admin-empty-state--center p-10">
              No open billing disputes are waiting in the queue.
            </div>
          {:else}
            <div class="space-y-4">
              {#each openDisputes as dispute}
                {@const tenant = tenantById.get(dispute.tenantId)}
                {@const billingRun = billingRunById.get(dispute.billingRunId)}
                <button
                  type="button"
                  class={`admin-selectable-card w-full rounded-[1rem] p-5 text-left ${
                    selectedDispute?.id === dispute.id
                      ? "admin-selectable-card--active"
                      : ""
                  }`}
                  onclick={() => {
                    selectedDisputeId = dispute.id
                  }}
                >
                  <div
                    class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div class="space-y-2 min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class={`badge ${dispute.status === "under_review" ? "badge-warning" : "badge-outline"}`}
                        >
                          {humanize(dispute.status)}
                        </span>
                        <span class="badge badge-outline">
                          {humanize(dispute.reason)}
                        </span>
                        <span class="badge badge-outline">
                          run #{dispute.billingRunId}
                        </span>
                      </div>
                      <h3 class="text-lg font-semibold text-[var(--admin-ink)]">
                        {dispute.summary}
                      </h3>
                      <p class="text-sm leading-6 text-slate-600">
                        {dispute.description}
                      </p>
                    </div>

                    <div
                      class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3 text-sm text-slate-600"
                    >
                      <p class="font-medium text-[var(--admin-ink)]">
                        {tenant?.name ?? `Tenant #${dispute.tenantId}`}
                      </p>
                      <p class="mt-1">
                        Requested {dispute.requestedRefundAmount}
                        {dispute.currency}
                      </p>
                      <p class="mt-1">
                        Submitted {formatDate(dispute.createdAt)}
                      </p>
                      <p class="mt-1">
                        Run total {billingRun?.totalAmount ?? "—"}
                        {billingRun?.currency ?? dispute.currency}
                      </p>
                    </div>
                  </div>
                </button>
              {/each}
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
                Closed Ledger
              </p>
              <h2 class="card-title mt-2">Recent Decisions</h2>
              <p class="text-sm text-slate-500">
                Recently resolved or rejected disputes with their approved
                refund and credit-note outcome.
              </p>
            </div>
            <span class="badge badge-outline"
              >{closedDisputes.length} closed</span
            >
          </div>

          {#if closedDisputes.length === 0}
            <div
              class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
            >
              No completed dispute decisions are visible yet.
            </div>
          {:else}
            <div class="space-y-4">
              {#each closedDisputes as dispute}
                {@const tenant = tenantById.get(dispute.tenantId)}
                <article
                  class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-5"
                >
                  <div
                    class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="badge badge-outline"
                          >{humanize(dispute.status)}</span
                        >
                        <span class="badge badge-outline"
                          >{humanize(dispute.reason)}</span
                        >
                        <span class="badge badge-outline">
                          {dispute.resolutionType
                            ? humanize(dispute.resolutionType)
                            : "no payout"}
                        </span>
                      </div>
                      <p
                        class="mt-3 text-lg font-semibold text-[var(--admin-ink)]"
                      >
                        {dispute.summary}
                      </p>
                      <p class="mt-2 text-sm text-slate-600">
                        {tenant?.name ?? `Tenant #${dispute.tenantId}`} · run #{dispute.billingRunId}
                      </p>
                    </div>
                    <div class="text-sm text-slate-600">
                      <p>
                        Approved {dispute.approvedRefundAmount ?? "0.00"}
                        {dispute.currency}
                      </p>
                      <p class="mt-1">
                        Closed {formatDate(dispute.resolvedAt)}
                      </p>
                      {#if dispute.stripeCreditNoteId}
                        <p class="mt-1">
                          Credit note {dispute.stripeCreditNoteId}
                        </p>
                      {/if}
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <aside
      class="admin-rail admin-rail--early-xl space-y-6 self-start xl:sticky xl:top-24"
    >
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Step-Up Console
            </p>
            <h2 class="card-title mt-2">Resolution Credentials</h2>
            <p class="text-sm text-slate-500">
              These values are attached to each dispute review request on this
              page.
            </p>
          </div>

          <label class="form-control">
            <span class="label-text mb-2">TOTP code</span>
            <input
              bind:value={stepUpCode}
              class="input input-bordered"
              type="text"
              inputmode="text"
              autocomplete="one-time-code"
              placeholder="123456"
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">Break-glass code</span>
            <input
              bind:value={breakGlassCode}
              class="input input-bordered"
              type="password"
              autocomplete="off"
              placeholder="Required for dispute resolution"
            />
          </label>

          <div class="admin-rail-note admin-rail-note--danger text-sm">
            Refund decisions can create reversing billing ledger entries and
            credit notes. Keep the step-up code and break-glass code current
            before submitting any decision.
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
            <h2 class="card-title mt-2">Tenant Dispute Context</h2>
            <p class="text-sm text-slate-500">
              Review the tenant, billing run, and requested refund before
              issuing a reversing ledger command.
            </p>
          </div>

          {#if selectedDispute}
            <div class="space-y-4">
              <div class="admin-selected-dossier p-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class={`badge ${selectedDispute.status === "under_review" ? "badge-warning" : "badge-outline"}`}
                  >
                    {humanize(selectedDispute.status)}
                  </span>
                  <span class="badge badge-outline">
                    {humanize(selectedDispute.reason)}
                  </span>
                </div>
                <p class="mt-3 text-base font-semibold text-[var(--admin-ink)]">
                  {selectedDispute.summary}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-600">
                  {selectedDispute.description}
                </p>
              </div>

              <dl class="space-y-3 text-sm">
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Tenant</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {selectedTenant?.name ??
                      `Tenant #${selectedDispute.tenantId}`}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Billing run</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    #{selectedDispute.billingRunId}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Requested refund</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {selectedDispute.requestedRefundAmount}
                    {selectedDispute.currency}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Run total</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {selectedBillingRun?.totalAmount ?? "—"}
                    {selectedBillingRun?.currency ?? selectedDispute.currency}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Run status</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {selectedBillingRun?.status ?? "—"}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <dt class="text-slate-500">Submitted</dt>
                  <dd class="text-right text-[var(--admin-ink)]">
                    {formatDate(selectedDispute.createdAt)}
                  </dd>
                </div>
              </dl>

              {#if selectedBillingRun?.stripeHostedInvoiceUrl}
                <a
                  class="btn btn-outline btn-sm w-full"
                  href={selectedBillingRun.stripeHostedInvoiceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open hosted invoice
                </a>
              {/if}
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
            >
              No billing dispute is currently selected.
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
              Resolution Desk
            </p>
            <h2 class="card-title mt-2">Refund Decision</h2>
            <p class="text-sm text-slate-500">
              Every approval can create a reversing SaaS billing ledger entry
              and may issue a Stripe credit note.
            </p>
          </div>

          {#if selectedDispute && isOpenStatus(selectedDispute.status)}
            <form method="post" action="?/reviewDispute" class="space-y-4">
              <input
                type="hidden"
                name="billingDisputeId"
                value={selectedDispute.id}
              />
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <input
                type="hidden"
                name="breakGlassCode"
                value={breakGlassCode}
              />

              <label class="form-control">
                <span class="label-text mb-2">Resolution</span>
                <select class="select select-bordered" name="resolutionType">
                  <option value="partial_refund">Partial refund</option>
                  <option value="full_refund">Full refund</option>
                  <option value="reject">Reject</option>
                </select>
              </label>

              <label class="form-control">
                <span class="label-text mb-2">Approved refund</span>
                <input
                  class="input input-bordered"
                  name="approvedRefundAmount"
                  placeholder={selectedDispute.requestedRefundAmount}
                />
              </label>

              <label class="form-control">
                <span class="label-text mb-2">Resolution notes</span>
                <textarea
                  class="textarea textarea-bordered min-h-28"
                  name="resolutionNotes"
                  placeholder="Explain the decision, scope, and any line-item adjustment."
                ></textarea>
              </label>

              <div class="admin-rail-note text-sm">
                Record the invoice impact, refund scope, and any credit-note
                expectation before applying the decision.
              </div>

              <button class="btn btn-primary w-full">Apply decision</button>
            </form>
          {:else if selectedDispute}
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-slate-500"
            >
              This dispute is already closed. Review the final outcome in the
              closed ledger below.
            </div>
          {:else}
            <div
              class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-6 text-sm text-slate-500"
            >
              Select a dispute from the queue to prepare a refund decision.
            </div>
          {/if}
        </div>
      </section>
    </aside>
  </section>
</div>
