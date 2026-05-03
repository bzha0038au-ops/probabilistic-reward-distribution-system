<script lang="ts">
  import {
    formatDateTime,
    getSaasTenantRiskEnvelopeDiffRows,
    getSaasTenantRiskEnvelopeDisplayContext,
    getSaasTenantRiskEnvelopeHeadline,
    requestMarketingCopy,
    requestStatusClass,
    requestStatusLabel,
    requestTypeClass,
    requestTypeLabel,
    type ChangeRequestRecord,
  } from "./page-support"

  let {
    changeRequests,
    mfaEnabled,
    stepUpCode,
    confirmationText = undefined,
    rejectReason = undefined,
    showControlInputs = true,
  }: {
    changeRequests: ChangeRequestRecord[]
    mfaEnabled: boolean
    stepUpCode: string
    confirmationText?: string
    rejectReason?: string
    showControlInputs?: boolean
  } = $props()

  let localConfirmationText = $state("")
  let localRejectReason = $state("")

  const resolvedConfirmationText = $derived(
    confirmationText ?? localConfirmationText,
  )
  const resolvedRejectReason = $derived(rejectReason ?? localRejectReason)
  const draftCount = $derived(
    changeRequests.filter((request) => request.status === "draft").length,
  )
  const approvalCount = $derived(
    changeRequests.filter((request) => request.status === "pending_approval")
      .length,
  )
  const approvedCount = $derived(
    changeRequests.filter((request) => request.status === "approved").length,
  )
  const publishedCount = $derived(
    changeRequests.filter((request) => request.status === "published").length,
  )
</script>

<section
  class="overflow-hidden rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] shadow-[var(--admin-shadow)]"
>
  <div
    class="flex flex-col gap-5 border-b border-[var(--admin-border)] px-6 py-5 lg:flex-row lg:items-start lg:justify-between"
  >
    <div class="space-y-2">
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
      >
        Governance Queue
      </p>
      <div>
        <h2
          class="font-['Newsreader'] text-[1.9rem] leading-tight text-[var(--admin-ink)]"
        >
          Change Requests
        </h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
          共享引擎配置、支付通道与 SaaS
          运营兜底都在这条队列中流转。敏感请求在提交和发布时仍需二次确认与管理员
          MFA。
        </p>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
      >
        <div
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
        >
          Draft
        </div>
        <div class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]">
          {draftCount}
        </div>
      </div>
      <div
        class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
      >
        <div
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
        >
          Approval
        </div>
        <div class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]">
          {approvalCount}
        </div>
      </div>
      <div
        class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
      >
        <div
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
        >
          Approved
        </div>
        <div class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]">
          {approvedCount}
        </div>
      </div>
      <div
        class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
      >
        <div
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
        >
          Published
        </div>
        <div class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]">
          {publishedCount}
        </div>
      </div>
    </div>
  </div>

  {#if showControlInputs}
    <div
      class="grid gap-4 border-b border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-6 py-5 md:grid-cols-2"
    >
      <label class="form-control">
        <span class="label-text mb-2">二次确认口令</span>
        <input
          class="input input-bordered font-mono"
          bind:value={localConfirmationText}
          placeholder="例如 SUBMIT 12 / PUBLISH 12"
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-2">驳回原因 / 熔断说明</span>
        <input
          class="input input-bordered"
          bind:value={localRejectReason}
          placeholder="写清楚拒绝原因或临时处置说明。"
        />
      </label>
    </div>
  {/if}

  {#if showControlInputs}
    <div class="overflow-x-auto">
      <table class="min-w-full border-separate border-spacing-0 text-sm">
        <thead class="bg-[var(--admin-paper-strong)]">
          <tr>
            <th
              class="border-b border-[var(--admin-border)] px-5 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
            >
              Request
            </th>
            <th
              class="border-b border-[var(--admin-border)] px-5 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
            >
              State
            </th>
            <th
              class="border-b border-[var(--admin-border)] px-5 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
            >
              Risk
            </th>
            <th
              class="border-b border-[var(--admin-border)] px-5 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
            >
              Timeline
            </th>
            <th
              class="border-b border-[var(--admin-border)] px-5 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {#if changeRequests.length === 0}
            <tr>
              <td
                colspan="5"
                class="px-5 py-10 text-center text-sm text-[var(--admin-muted)]"
              >
                暂无待处理的配置请求。
              </td>
            </tr>
          {:else}
            {#each changeRequests as request}
              {@const riskEnvelopeContext =
                getSaasTenantRiskEnvelopeDisplayContext(request)}
              {@const riskEnvelopeDiff =
                getSaasTenantRiskEnvelopeDiffRows(request)}
              <tr class="align-top">
                <td class="border-b border-[var(--admin-border)] px-5 py-5">
                  <div class="mb-3 flex flex-wrap gap-2">
                    <span
                      class={`badge badge-outline ${requestTypeClass(request)}`}
                    >
                      {requestTypeLabel(request)}
                    </span>
                    <span class="badge badge-ghost">#{request.id}</span>
                    {#if riskEnvelopeContext}
                      <span class="badge badge-ghost">
                        Tenant #{riskEnvelopeContext.tenant.id}
                      </span>
                    {/if}
                  </div>
                  <div class="font-medium text-[var(--admin-ink)]">
                    {#if riskEnvelopeContext}
                      {getSaasTenantRiskEnvelopeHeadline(request)}
                    {:else}
                      {request.summary}
                    {/if}
                  </div>
                  {#if requestMarketingCopy(request)}
                    <div class="mt-1 text-xs text-[var(--admin-muted)]">
                      {requestMarketingCopy(request)}
                    </div>
                  {/if}
                  <div class="mt-2 text-xs text-[var(--admin-muted)]">
                    原因：{request.reason ?? "未填写"}
                  </div>
                  {#if riskEnvelopeContext}
                    <div class="mt-1 text-xs text-[var(--admin-muted)]">
                      当前审批对象：
                      {#if riskEnvelopeContext.tenant.name}
                        {riskEnvelopeContext.tenant.name}
                      {:else}
                        Tenant #{riskEnvelopeContext.tenant.id}
                      {/if}
                      {#if riskEnvelopeContext.tenant.slug}
                        / {riskEnvelopeContext.tenant.slug}
                      {/if}
                    </div>
                  {/if}
                  {#if request.requiresSecondConfirmation}
                    <div class="mt-2 text-xs text-warning">
                      提交口令：{request.confirmationPhrases.submit ?? "—"}；
                      发布口令：{request.confirmationPhrases.publish ?? "—"}
                    </div>
                  {/if}
                  {#if riskEnvelopeDiff.length > 0}
                    <div
                      class="mt-4 rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-3"
                    >
                      <div
                        class="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                      >
                        Diff Preview
                      </div>
                      <div class="space-y-2">
                        {#each riskEnvelopeDiff as row}
                          <div class="grid gap-2 xl:grid-cols-[10rem_1fr]">
                            <div
                              class="text-xs font-medium text-[var(--admin-muted)]"
                            >
                              {row.label}
                            </div>
                            <div
                              class="flex flex-wrap items-center gap-2 text-xs"
                            >
                              <span
                                class="rounded-md border border-[var(--admin-border)] bg-[var(--admin-paper)] px-2 py-1 font-mono text-[var(--admin-muted)]"
                              >
                                {row.from}
                              </span>
                              <span class="text-[var(--admin-muted-soft)]"
                                >→</span
                              >
                              <span
                                class="rounded-md border border-[var(--admin-border)] bg-[color:color-mix(in_srgb,var(--admin-primary)_12%,white)] px-2 py-1 font-mono text-[var(--admin-ink)]"
                              >
                                {row.to}
                              </span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </td>
                <td class="border-b border-[var(--admin-border)] px-5 py-5">
                  <div class="space-y-3">
                    <span class={`badge ${requestStatusClass(request.status)}`}>
                      {requestStatusLabel(request.status)}
                    </span>
                    <div class="text-xs text-[var(--admin-muted)]">
                      Admin #{request.createdByAdminId}
                    </div>
                  </div>
                </td>
                <td class="border-b border-[var(--admin-border)] px-5 py-5">
                  <div class="space-y-2 text-xs">
                    <span
                      class={`badge ${
                        request.requiresSecondConfirmation
                          ? "badge-warning"
                          : "badge-ghost"
                      }`}
                    >
                      {request.requiresSecondConfirmation ? "二次确认" : "普通"}
                    </span>
                    <span
                      class={`badge ${
                        request.requiresMfa ? "badge-error" : "badge-ghost"
                      }`}
                    >
                      {request.requiresMfa ? "发布需 MFA" : "标准发布"}
                    </span>
                  </div>
                </td>
                <td class="border-b border-[var(--admin-border)] px-5 py-5">
                  <div class="space-y-2 text-xs text-[var(--admin-muted)]">
                    <div>
                      <div class="font-mono uppercase tracking-[0.14em]">
                        Created
                      </div>
                      <div>{formatDateTime(request.createdAt)}</div>
                    </div>
                    <div>
                      <div class="font-mono uppercase tracking-[0.14em]">
                        Approved
                      </div>
                      <div>{formatDateTime(request.approvedAt)}</div>
                    </div>
                    <div>
                      <div class="font-mono uppercase tracking-[0.14em]">
                        Published
                      </div>
                      <div>{formatDateTime(request.publishedAt)}</div>
                    </div>
                  </div>
                </td>
                <td class="border-b border-[var(--admin-border)] px-5 py-5">
                  <div class="flex min-w-[10rem] flex-col gap-2">
                    {#if request.status === "draft"}
                      <form method="post" action="?/submitChangeRequest">
                        <input
                          type="hidden"
                          name="requestId"
                          value={request.id}
                        />
                        <input
                          type="hidden"
                          name="confirmationText"
                          value={resolvedConfirmationText}
                        />
                        <button
                          class="btn btn-outline btn-sm w-full"
                          type="submit"
                        >
                          提交审批
                        </button>
                      </form>
                    {:else if request.status === "pending_approval"}
                      <form method="post" action="?/approveChangeRequest">
                        <input
                          type="hidden"
                          name="requestId"
                          value={request.id}
                        />
                        <button class="btn btn-sm w-full" type="submit">
                          批准
                        </button>
                      </form>
                    {/if}

                    {#if request.status === "approved"}
                      <form method="post" action="?/publishChangeRequest">
                        <input
                          type="hidden"
                          name="requestId"
                          value={request.id}
                        />
                        <input
                          type="hidden"
                          name="totpCode"
                          value={stepUpCode}
                        />
                        <input
                          type="hidden"
                          name="confirmationText"
                          value={resolvedConfirmationText}
                        />
                        <button
                          class="btn btn-primary btn-sm w-full"
                          type="submit"
                          disabled={!mfaEnabled}
                        >
                          发布到生产
                        </button>
                      </form>
                    {/if}

                    {#if request.status !== "published" && request.status !== "rejected"}
                      <form method="post" action="?/rejectChangeRequest">
                        <input
                          type="hidden"
                          name="requestId"
                          value={request.id}
                        />
                        <input
                          type="hidden"
                          name="rejectReason"
                          value={resolvedRejectReason}
                        />
                        <button
                          class="btn btn-ghost btn-sm w-full text-error"
                          type="submit"
                        >
                          驳回
                        </button>
                      </form>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="space-y-4 p-5">
      {#if changeRequests.length === 0}
        <div
          class="rounded-[0.9rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-5 text-sm text-[var(--admin-muted)]"
        >
          暂无待发布的法律文档请求。
        </div>
      {:else}
        {#each changeRequests as request}
          {@const riskEnvelopeContext =
            getSaasTenantRiskEnvelopeDisplayContext(request)}
          {@const riskEnvelopeDiff = getSaasTenantRiskEnvelopeDiffRows(request)}
          <article
            class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-2">
                <div class="flex flex-wrap gap-2">
                  <span
                    class={`badge badge-outline ${requestTypeClass(request)}`}
                  >
                    {requestTypeLabel(request)}
                  </span>
                  <span class={`badge ${requestStatusClass(request.status)}`}>
                    {requestStatusLabel(request.status)}
                  </span>
                </div>
                <div class="font-medium text-[var(--admin-ink)]">
                  {#if riskEnvelopeContext}
                    {getSaasTenantRiskEnvelopeHeadline(request)}
                  {:else}
                    {request.summary}
                  {/if}
                </div>
              </div>
              <span class="font-mono text-xs text-[var(--admin-muted-soft)]">
                #{request.id}
              </span>
            </div>

            <div class="mt-3 space-y-1 text-xs text-[var(--admin-muted)]">
              <div>原因：{request.reason ?? "未填写"}</div>
              <div>创建：{formatDateTime(request.createdAt)}</div>
              <div>审批：{formatDateTime(request.approvedAt)}</div>
              <div>发布：{formatDateTime(request.publishedAt)}</div>
              {#if requestMarketingCopy(request)}
                <div>{requestMarketingCopy(request)}</div>
              {/if}
            </div>

            <div class="mt-3 flex flex-wrap gap-2 text-xs">
              <span
                class={`badge ${
                  request.requiresSecondConfirmation
                    ? "badge-warning"
                    : "badge-ghost"
                }`}
              >
                {request.requiresSecondConfirmation ? "二次确认" : "普通"}
              </span>
              <span
                class={`badge ${
                  request.requiresMfa ? "badge-error" : "badge-ghost"
                }`}
              >
                {request.requiresMfa ? "发布需 MFA" : "标准发布"}
              </span>
            </div>

            {#if riskEnvelopeDiff.length > 0}
              <div
                class="mt-4 rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-3"
              >
                <div
                  class="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
                >
                  Diff Preview
                </div>
                <div class="space-y-2">
                  {#each riskEnvelopeDiff.slice(0, 3) as row}
                    <div class="space-y-1 text-xs">
                      <div class="font-medium text-[var(--admin-muted)]">
                        {row.label}
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="rounded-md border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-2 py-1 font-mono text-[var(--admin-muted)]"
                        >
                          {row.from}
                        </span>
                        <span class="text-[var(--admin-muted-soft)]">→</span>
                        <span
                          class="rounded-md border border-[var(--admin-border)] bg-[color:color-mix(in_srgb,var(--admin-primary)_12%,white)] px-2 py-1 font-mono text-[var(--admin-ink)]"
                        >
                          {row.to}
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  {/if}
</section>
