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
</script>

<div class="card bg-base-100 shadow lg:col-span-2">
  <div class="card-body space-y-5">
    <div>
      <h2 class="card-title">变更队列</h2>
      <p class="text-sm text-slate-500">
        共享引擎配置、支付通道以及 SaaS
        运营兜底都在这里流转。敏感请求在提交和发布时需要二次确认。
      </p>
    </div>

    {#if showControlInputs}
      <div class="grid gap-4 md:grid-cols-2">
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

    <div class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>ID</th>
            <th>摘要</th>
            <th>状态</th>
            <th>风险</th>
            <th>创建</th>
            <th>审批</th>
            <th>发布</th>
          </tr>
        </thead>
        <tbody>
          {#if changeRequests.length === 0}
            <tr>
              <td colspan="7" class="text-center text-sm text-slate-500">
                暂无待处理的配置请求。
              </td>
            </tr>
          {:else}
            {#each changeRequests as request}
              {@const riskEnvelopeContext =
                getSaasTenantRiskEnvelopeDisplayContext(request)}
              {@const riskEnvelopeDiff =
                getSaasTenantRiskEnvelopeDiffRows(request)}
              <tr>
                <td class="font-mono text-xs">#{request.id}</td>
                <td class="min-w-80">
                  <div class="mb-2 flex flex-wrap gap-2">
                    <span
                      class={`badge badge-outline ${requestTypeClass(request)}`}
                    >
                      {requestTypeLabel(request)}
                    </span>
                    {#if riskEnvelopeContext}
                      <span class="badge badge-ghost">
                        Tenant #{riskEnvelopeContext.tenant.id}
                      </span>
                    {/if}
                  </div>
                  <div class="font-medium">
                    {#if riskEnvelopeContext}
                      {getSaasTenantRiskEnvelopeHeadline(request)}
                    {:else}
                      {request.summary}
                    {/if}
                  </div>
                  {#if requestMarketingCopy(request)}
                    <div class="mt-1 text-xs text-slate-500">
                      {requestMarketingCopy(request)}
                    </div>
                  {/if}
                  <div class="mt-1 text-xs text-slate-500">
                    原因：{request.reason ?? "未填写"}
                  </div>
                  {#if riskEnvelopeContext}
                    <div class="mt-1 text-xs text-slate-500">
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
                      class="mt-3 rounded-xl border border-base-300 bg-base-200/40 p-3"
                    >
                      <div
                        class="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                      >
                        Diff Preview
                      </div>
                      <div class="space-y-2">
                        {#each riskEnvelopeDiff as row}
                          <div
                            class="grid gap-2 md:grid-cols-[10rem_1fr] md:items-center"
                          >
                            <div class="text-xs font-medium text-slate-600">
                              {row.label}
                            </div>
                            <div
                              class="flex flex-wrap items-center gap-2 text-xs"
                            >
                              <span
                                class="rounded-md bg-base-100 px-2 py-1 font-mono text-slate-500"
                              >
                                {row.from}
                              </span>
                              <span class="text-slate-400">→</span>
                              <span
                                class="rounded-md bg-secondary/15 px-2 py-1 font-mono text-slate-700"
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
                <td>
                  <span class={`badge ${requestStatusClass(request.status)}`}>
                    {requestStatusLabel(request.status)}
                  </span>
                </td>
                <td class="space-y-2 text-xs">
                  <div>
                    <span
                      class={`badge ${
                        request.requiresSecondConfirmation
                          ? "badge-warning"
                          : "badge-ghost"
                      }`}
                    >
                      {request.requiresSecondConfirmation ? "二次确认" : "普通"}
                    </span>
                  </div>
                  <div>
                    <span
                      class={`badge ${
                        request.requiresMfa ? "badge-error" : "badge-ghost"
                      }`}
                    >
                      {request.requiresMfa ? "发布需 MFA" : "标准发布"}
                    </span>
                  </div>
                </td>
                <td class="text-xs text-slate-500">
                  <div>Admin #{request.createdByAdminId}</div>
                  <div>{formatDateTime(request.createdAt)}</div>
                </td>
                <td class="space-y-2">
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
                      <button class="btn btn-xs btn-outline" type="submit">
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
                      <button class="btn btn-xs btn-info" type="submit">
                        批准
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
                        class="btn btn-xs btn-ghost text-error"
                        type="submit"
                      >
                        驳回
                      </button>
                    </form>
                  {/if}
                </td>
                <td class="space-y-2">
                  {#if request.status === "approved"}
                    <form method="post" action="?/publishChangeRequest">
                      <input
                        type="hidden"
                        name="requestId"
                        value={request.id}
                      />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <input
                        type="hidden"
                        name="confirmationText"
                        value={resolvedConfirmationText}
                      />
                      <button
                        class="btn btn-xs btn-primary"
                        type="submit"
                        disabled={!mfaEnabled}
                      >
                        发布到生产
                      </button>
                    </form>
                  {/if}

                  <div class="text-xs text-slate-500">
                    {request.approvedAt
                      ? `审批：${formatDateTime(request.approvedAt)}`
                      : "审批：—"}
                  </div>
                  <div class="text-xs text-slate-500">
                    {request.publishedAt
                      ? `发布：${formatDateTime(request.publishedAt)}`
                      : "发布：—"}
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
