<script lang="ts">
  import { page } from "$app/stores"
  import type { SaasOverview } from "@reward/shared-types/saas"

  interface PageData {
    overview: SaasOverview | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")
  let breakGlassCode = $state("")

  const overview = $derived(data.overview)
  const actionError = $derived(($page.form?.error as string | undefined) ?? null)
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
  const billingRunById = $derived(
    new Map(billingRuns.map((run) => [run.id, run] as const)),
  )
  const tenantById = $derived(
    new Map(tenants.map((entry) => [entry.tenant.id, entry.tenant] as const)),
  )

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString()
  }

  const humanize = (value: string | null | undefined) =>
    value ? value.replaceAll("_", " ") : "—"
</script>

<div class="space-y-8">
  <section class="space-y-3">
    <a href="/saas" class="text-sm font-medium text-slate-500 hover:text-slate-900">
      ← Back to SaaS overview
    </a>
    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-500">
          Billing disputes
        </p>
        <h1 class="text-3xl font-semibold text-slate-900">
          SaaS dispute queue
        </h1>
        <p class="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Tenants submit invoice disputes from the portal. Operators adjudicate
          them here, with step-up plus break-glass confirmation on every
          resolution because refunds write a reversing SaaS billing ledger entry
          and can issue a Stripe credit note.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge badge-outline">
          open {openDisputes.length}
        </span>
        <span class="badge badge-outline">
          closed {closedDisputes.length}
        </span>
      </div>
    </div>

    {#if data.error}
      <div class="alert alert-error text-sm">{data.error}</div>
    {/if}

    {#if actionError}
      <div class="alert alert-error text-sm">{actionError}</div>
    {/if}

    {#if disputeReviewed}
      <div class="alert alert-success text-sm">
        Billing dispute updated.
      </div>
    {/if}
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <h2 class="text-lg font-semibold text-slate-900">
        Step-up credentials
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        These values are attached to each dispute review request on this page.
      </p>
    </div>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
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
    </div>
  </section>

  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">Open queue</h2>
        <p class="text-sm text-slate-500">
          Submitted disputes waiting for a final decision.
        </p>
      </div>
    </div>

    {#if openDisputes.length > 0}
      <div class="grid gap-4">
        {#each openDisputes as dispute}
          {@const tenant = tenantById.get(dispute.tenantId)}
          {@const billingRun = billingRunById.get(dispute.billingRunId)}
          <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-outline">{dispute.status}</span>
                  <span class="badge badge-outline">{humanize(dispute.reason)}</span>
                  <span class="badge badge-outline">run #{dispute.billingRunId}</span>
                </div>
                <h3 class="text-xl font-semibold text-slate-900">
                  {dispute.summary}
                </h3>
                <p class="text-sm leading-6 text-slate-600">
                  {dispute.description}
                </p>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p class="font-medium text-slate-900">
                  {tenant?.name ?? `Tenant #${dispute.tenantId}`}
                </p>
                <p class="mt-1">
                  Requested {dispute.requestedRefundAmount} {dispute.currency}
                </p>
                <p class="mt-1">
                  Submitted {formatDate(dispute.createdAt)}
                </p>
                <p class="mt-1">
                  Run total {billingRun?.totalAmount ?? "—"} {billingRun?.currency ?? dispute.currency}
                </p>
                <p class="mt-1">
                  Run status {billingRun?.status ?? "—"}
                </p>
                {#if billingRun?.stripeHostedInvoiceUrl}
                  <a
                    class="mt-2 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900"
                    href={billingRun.stripeHostedInvoiceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open hosted invoice
                  </a>
                {/if}
              </div>
            </div>

            <form method="post" action="?/reviewDispute" class="mt-6 grid gap-4">
              <input type="hidden" name="billingDisputeId" value={dispute.id} />
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <input type="hidden" name="breakGlassCode" value={breakGlassCode} />

              <div class="grid gap-4 lg:grid-cols-[220px_180px_1fr]">
                <label class="form-control">
                  <span class="label-text mb-2">Resolution</span>
                  <select
                    class="select select-bordered"
                    name="resolutionType"
                  >
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
                    placeholder={dispute.requestedRefundAmount}
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
              </div>

              <div class="flex justify-end">
                <button class="btn btn-primary">Apply decision</button>
              </div>
            </form>
          </article>
        {/each}
      </div>
    {:else}
      <div class="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No open billing disputes are waiting in the queue.
      </div>
    {/if}
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-900">Recent decisions</h2>
      <p class="text-sm text-slate-500">
        Recently resolved or rejected disputes.
      </p>
    </div>

    {#if closedDisputes.length > 0}
      <div class="grid gap-4">
        {#each closedDisputes as dispute}
          {@const tenant = tenantById.get(dispute.tenantId)}
          <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-outline">{dispute.status}</span>
                  <span class="badge badge-outline">{humanize(dispute.reason)}</span>
                  <span class="badge badge-outline">
                    {dispute.resolutionType ? humanize(dispute.resolutionType) : "no payout"}
                  </span>
                </div>
                <p class="mt-3 text-lg font-semibold text-slate-900">
                  {dispute.summary}
                </p>
                <p class="mt-2 text-sm text-slate-600">
                  {tenant?.name ?? `Tenant #${dispute.tenantId}`} · run #{dispute.billingRunId}
                </p>
              </div>
              <div class="text-sm text-slate-600">
                <p>
                  Approved {dispute.approvedRefundAmount ?? "0.00"} {dispute.currency}
                </p>
                <p class="mt-1">
                  Closed {formatDate(dispute.resolvedAt)}
                </p>
                {#if dispute.stripeCreditNoteId}
                  <p class="mt-1">Credit note {dispute.stripeCreditNoteId}</p>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No completed dispute decisions are visible yet.
      </div>
    {/if}
  </section>
</div>
