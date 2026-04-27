<script lang="ts">
  import {
    formatDateTime,
    requestStatusClass,
    requestStatusLabel,
    type ChangeRequestRecord,
  } from "./page-support"

  let {
    changeRequests,
    mfaEnabled,
    stepUpCode,
  }: {
    changeRequests: ChangeRequestRecord[]
    mfaEnabled: boolean
    stepUpCode: string
  } = $props()

  let confirmationText = $state("")
  let rejectReason = $state("")
</script>

<div class="card bg-base-100 shadow lg:col-span-2">
  <div class="card-body space-y-5">
    <div>
      <h2 class="card-title">变更队列</h2>
      <p class="text-sm text-slate-500">
        所有配置和通道修改都必须经过这里的状态流转。敏感请求在提交和发布时需要二次确认。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <label class="form-control">
        <span class="label-text mb-2">二次确认口令</span>
        <input
          class="input input-bordered font-mono"
          bind:value={confirmationText}
          placeholder="例如 SUBMIT 12 / PUBLISH 12"
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-2">驳回原因 / 熔断说明</span>
        <input
          class="input input-bordered"
          bind:value={rejectReason}
          placeholder="写清楚拒绝原因或临时处置说明。"
        />
      </label>
    </div>

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
              <tr>
                <td class="font-mono text-xs">#{request.id}</td>
                <td class="min-w-80">
                  <div class="font-medium">{request.summary}</div>
                  <div class="mt-1 text-xs text-slate-500">
                    原因：{request.reason ?? "未填写"}
                  </div>
                  {#if request.requiresSecondConfirmation}
                    <div class="mt-2 text-xs text-warning">
                      提交口令：{request.confirmationPhrases.submit ?? "—"}；
                      发布口令：{request.confirmationPhrases.publish ?? "—"}
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
                      <input type="hidden" name="requestId" value={request.id} />
                      <input
                        type="hidden"
                        name="confirmationText"
                        value={confirmationText}
                      />
                      <button class="btn btn-xs btn-outline" type="submit">
                        提交审批
                      </button>
                    </form>
                  {:else if request.status === "pending_approval"}
                    <form method="post" action="?/approveChangeRequest">
                      <input type="hidden" name="requestId" value={request.id} />
                      <button class="btn btn-xs btn-info" type="submit">
                        批准
                      </button>
                    </form>
                  {/if}

                  {#if request.status !== "published" && request.status !== "rejected"}
                    <form method="post" action="?/rejectChangeRequest">
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="rejectReason" value={rejectReason} />
                      <button class="btn btn-xs btn-ghost text-error" type="submit">
                        驳回
                      </button>
                    </form>
                  {/if}
                </td>
                <td class="space-y-2">
                  {#if request.status === "approved"}
                    <form method="post" action="?/publishChangeRequest">
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <input
                        type="hidden"
                        name="confirmationText"
                        value={confirmationText}
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
