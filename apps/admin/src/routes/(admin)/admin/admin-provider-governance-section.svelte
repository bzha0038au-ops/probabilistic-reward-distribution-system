<script lang="ts">
  import {
    createProviderForm,
    formatDateTime,
    providerRuntimeClass,
    providerRuntimeLabel,
    type PaymentProviderRecord,
  } from "./page-support"

  let {
    providers,
    stepUpCode,
  }: {
    providers: PaymentProviderRecord[]
    stepUpCode: string
  } = $props()

  let selectedProviderId = $state("new")
  let providerForm = $state(createProviderForm())

  const resetProviderForm = () => {
    Object.assign(providerForm, createProviderForm())
  }

  $effect(() => {
    const provider = providers.find(
      (item) => String(item.id) === selectedProviderId,
    )

    if (!provider) {
      resetProviderForm()
      return
    }

    providerForm.providerId = String(provider.id)
    providerForm.name = provider.name
    providerForm.providerType = provider.providerType
    providerForm.priority = String(provider.priority ?? 100)
    providerForm.isActive = provider.isActive
    providerForm.supportedFlows = [...(provider.supportedFlows ?? [])]
    providerForm.executionMode = provider.executionMode
    providerForm.adapter = provider.adapter ?? ""
    providerForm.reason = ""
  })
</script>

<div class="card bg-base-100 shadow lg:col-span-2">
  <div class="card-body space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="card-title">支付通道控制</h2>
        <p class="text-sm text-slate-500">
          通道新增、启停、优先级和自动出款模式统一走草稿审批；紧急情况下可直接熔断。
        </p>
      </div>
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="badge badge-outline">审计必留痕</span>
        <span class="badge badge-outline">自动提现发布需 MFA</span>
        <span class="badge badge-outline">熔断可直接执行</span>
      </div>
    </div>

    <form method="post" action="?/providerDraft" class="grid gap-4">
      <div class="grid gap-4 md:grid-cols-3">
        <div class="form-control">
          <label class="label" for="provider-select">
            <span class="label-text">编辑目标</span>
          </label>
          <select
            id="provider-select"
            class="select select-bordered"
            bind:value={selectedProviderId}
          >
            <option value="new">新增通道</option>
            {#each providers as provider}
              <option value={String(provider.id)}>
                #{provider.id} {provider.name}
              </option>
            {/each}
          </select>
        </div>

        <div class="form-control">
          <label class="label" for="provider-name">
            <span class="label-text">通道名称</span>
          </label>
          <input
            id="provider-name"
            name="providerName"
            class="input input-bordered"
            bind:value={providerForm.name}
            required
          />
        </div>

        <div class="form-control">
          <label class="label" for="provider-type">
            <span class="label-text">通道类型</span>
          </label>
          <input
            id="provider-type"
            name="providerType"
            class="input input-bordered"
            bind:value={providerForm.providerType}
            required
          />
        </div>

        <div class="form-control">
          <label class="label" for="provider-priority">
            <span class="label-text">优先级（越小越优先）</span>
          </label>
          <input
            id="provider-priority"
            name="priority"
            type="number"
            class="input input-bordered"
            bind:value={providerForm.priority}
          />
        </div>

        <div class="form-control">
          <label class="label" for="provider-mode">
            <span class="label-text">执行模式</span>
          </label>
          <select
            id="provider-mode"
            name="executionMode"
            class="select select-bordered"
            bind:value={providerForm.executionMode}
          >
            <option value="manual">manual</option>
            <option value="automated">automated</option>
          </select>
        </div>

        <div class="form-control">
          <label class="label" for="provider-adapter">
            <span class="label-text">Adapter</span>
          </label>
          <input
            id="provider-adapter"
            name="adapter"
            class="input input-bordered"
            bind:value={providerForm.adapter}
            placeholder="stripe / bank_proxy / ..."
          />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-[1fr,1fr,2fr]">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="providerIsActive"
            class="checkbox checkbox-primary"
            bind:checked={providerForm.isActive}
          />
          <span class="label-text">发布后启用通道</span>
        </label>

        <div class="flex flex-wrap gap-4 rounded-box border border-base-300 p-4">
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="supportedFlows"
              value="deposit"
              class="checkbox checkbox-primary"
              bind:group={providerForm.supportedFlows}
            />
            <span class="label-text">充值</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="supportedFlows"
              value="withdrawal"
              class="checkbox checkbox-primary"
              bind:group={providerForm.supportedFlows}
            />
            <span class="label-text">提现</span>
          </label>
        </div>

        <label class="form-control">
          <span class="label-text mb-2">变更原因</span>
          <textarea
            class="textarea textarea-bordered min-h-24"
            name="providerReason"
            bind:value={providerForm.reason}
            placeholder="说明本次通道调整的业务背景、回滚策略和观察指标。"
          ></textarea>
        </label>
      </div>

      <input type="hidden" name="providerId" value={providerForm.providerId} />
      <button class="btn btn-primary max-w-sm" type="submit">
        保存通道变更草稿
      </button>
    </form>

    <div class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>ID</th>
            <th>通道</th>
            <th>状态</th>
            <th>优先级</th>
            <th>流向</th>
            <th>模式</th>
            <th>适配器</th>
            <th>熔断</th>
          </tr>
        </thead>
        <tbody>
          {#if providers.length === 0}
            <tr>
              <td colspan="8" class="text-center text-sm text-slate-500">
                暂无通道配置。
              </td>
            </tr>
          {:else}
            {#each providers as provider}
              <tr>
                <td class="font-mono text-xs">#{provider.id}</td>
                <td>
                  <div class="font-medium">{provider.name}</div>
                  <div class="text-xs text-slate-500">{provider.providerType}</div>
                </td>
                <td>
                  <span class={`badge ${providerRuntimeClass(provider)}`}>
                    {providerRuntimeLabel(provider)}
                  </span>
                </td>
                <td>{provider.priority}</td>
                <td>{provider.supportedFlows.join(" / ") || "—"}</td>
                <td>{provider.executionMode}</td>
                <td>{provider.adapter ?? "—"}</td>
                <td class="space-y-2">
                  {#if provider.isCircuitBroken}
                    <div class="text-xs text-slate-500">
                      {formatDateTime(provider.circuitBrokenAt)}
                    </div>
                    <div class="text-xs text-error">
                      {provider.circuitBreakReason ?? "未记录原因"}
                    </div>
                    <form method="post" action="?/resetProviderCircuit">
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <button class="btn btn-xs btn-outline" type="submit">
                        解除熔断
                      </button>
                    </form>
                  {:else}
                    <form method="post" action="?/tripProviderCircuit" class="space-y-2">
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="totpCode" value={stepUpCode} />
                      <input
                        name="circuitReason"
                        class="input input-bordered input-xs w-full"
                        placeholder="熔断原因"
                      />
                      <button class="btn btn-xs btn-error" type="submit">
                        一键熔断
                      </button>
                    </form>
                  {/if}
                </td>
              </tr>
              {#if provider.configViolations.length > 0}
                <tr>
                  <td colspan="8" class="bg-warning/10 text-xs text-warning">
                    {#each provider.configViolations as issue}
                      <div>{issue.path}: {issue.message}</div>
                    {/each}
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
