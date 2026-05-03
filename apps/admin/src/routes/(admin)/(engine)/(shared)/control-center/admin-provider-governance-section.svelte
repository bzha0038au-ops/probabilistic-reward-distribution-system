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
    mode = "full",
  }: {
    providers: PaymentProviderRecord[]
    stepUpCode: string
    mode?: "full" | "drafts" | "fleet"
  } = $props()

  let selectedProviderId = $state("new")
  let providerForm = $state(createProviderForm())

  const selectedProvider = $derived(
    providers.find((item) => String(item.id) === selectedProviderId) ?? null,
  )
  const showDraftDesk = $derived(mode === "full" || mode === "drafts")
  const showRuntimeLedger = $derived(mode === "full" || mode === "fleet")

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

<div class="space-y-6">
  {#if showDraftDesk}
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Draft Desk
            </p>
            <h2 class="card-title mt-2">Provider Governance</h2>
            <p class="text-sm text-slate-500">
              通道新增、启停、优先级和自动出款模式统一走草稿审批；紧急情况下才直接熔断。
            </p>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="badge badge-outline">审计必留痕</span>
            <span class="badge badge-outline">自动提现发布需 MFA</span>
            <span class="badge badge-outline">熔断可直接执行</span>
          </div>
        </div>

        <form method="post" action="?/providerDraft" class="space-y-5">
          <div class="grid gap-4 md:grid-cols-3">
            <label class="form-control">
              <span class="label-text mb-2">编辑目标</span>
              <select
                class="select select-bordered"
                bind:value={selectedProviderId}
              >
                <option value="new">新增通道</option>
                {#each providers as provider}
                  <option value={String(provider.id)}>
                    #{provider.id}
                    {provider.name}
                  </option>
                {/each}
              </select>
            </label>

            <label class="form-control">
              <span class="label-text mb-2">通道名称</span>
              <input
                name="providerName"
                class="input input-bordered"
                bind:value={providerForm.name}
                required
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">通道类型</span>
              <input
                name="providerType"
                class="input input-bordered"
                bind:value={providerForm.providerType}
                required
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">优先级（越小越优先）</span>
              <input
                name="priority"
                type="number"
                class="input input-bordered"
                bind:value={providerForm.priority}
              />
            </label>

            <label class="form-control">
              <span class="label-text mb-2">执行模式</span>
              <select
                name="executionMode"
                class="select select-bordered"
                bind:value={providerForm.executionMode}
              >
                <option value="manual">manual</option>
                <option value="automated">automated</option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text mb-2">Adapter</span>
              <input
                name="adapter"
                class="input input-bordered"
                bind:value={providerForm.adapter}
                placeholder="stripe / bank_proxy / ..."
              />
            </label>
          </div>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Activation State
              </p>

              <label class="label mt-4 cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  name="providerIsActive"
                  class="checkbox checkbox-primary"
                  bind:checked={providerForm.isActive}
                />
                <span class="label-text">发布后启用通道</span>
              </label>

              <div class="mt-4 flex flex-wrap gap-4">
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
            </div>

            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Runtime Snapshot
              </p>

              {#if selectedProvider}
                <dl class="mt-4 space-y-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-4">
                    <dt>Runtime</dt>
                    <dd>
                      <span
                        class={`badge ${providerRuntimeClass(selectedProvider)}`}
                      >
                        {providerRuntimeLabel(selectedProvider)}
                      </span>
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Flows</dt>
                    <dd>
                      {selectedProvider.supportedFlows.join(" / ") || "—"}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Execution</dt>
                    <dd class="font-mono text-xs">
                      {selectedProvider.executionMode}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Circuit Break</dt>
                    <dd class="font-mono text-xs">
                      {selectedProvider.isCircuitBroken
                        ? formatDateTime(selectedProvider.circuitBrokenAt)
                        : "clear"}
                    </dd>
                  </div>
                </dl>

                {#if selectedProvider.isCircuitBroken}
                  <p class="mt-4 text-sm text-error">
                    {selectedProvider.circuitBreakReason ?? "未记录原因"}
                  </p>
                {/if}
              {:else}
                <p class="mt-4 text-sm text-slate-500">
                  新增通道草稿时，这里会显示当前选择通道的运行态快照。
                </p>
              {/if}
            </div>
          </div>

          <label class="form-control">
            <span class="label-text mb-2">变更原因</span>
            <textarea
              class="textarea textarea-bordered min-h-28"
              name="providerReason"
              bind:value={providerForm.reason}
              placeholder="说明本次通道调整的业务背景、回滚策略和观察指标。"
            ></textarea>
          </label>

          <input
            type="hidden"
            name="providerId"
            value={providerForm.providerId}
          />

          <button class="btn btn-primary max-w-sm" type="submit">
            保存通道变更草稿
          </button>
        </form>
      </div>
    </section>
  {/if}

  {#if showRuntimeLedger}
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Runtime Ledger
            </p>
            <h2 class="card-title mt-2">Provider Fleet</h2>
            <p class="text-sm text-slate-500">
              当前 provider
              的运行态、适配器、流向覆盖和熔断状态都从这里统一观察。
            </p>
          </div>
          <span class="badge badge-outline">{providers.length} providers</span>
        </div>

        <div
          class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
        >
          <table class="table">
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
                  <td
                    colspan="8"
                    class="py-8 text-center text-sm text-slate-500"
                  >
                    暂无通道配置。
                  </td>
                </tr>
              {:else}
                {#each providers as provider}
                  <tr
                    style={provider.isCircuitBroken
                      ? "background: var(--admin-warning-soft);"
                      : provider.configViolations.length > 0
                        ? "background: var(--admin-primary-soft);"
                        : undefined}
                  >
                    <td class="font-mono text-xs">#{provider.id}</td>
                    <td>
                      <div class="font-medium">{provider.name}</div>
                      <div class="text-xs text-slate-500">
                        {provider.providerType}
                      </div>
                    </td>
                    <td>
                      <span class={`badge ${providerRuntimeClass(provider)}`}>
                        {providerRuntimeLabel(provider)}
                      </span>
                    </td>
                    <td class="font-mono text-xs">{provider.priority}</td>
                    <td>{provider.supportedFlows.join(" / ") || "—"}</td>
                    <td class="font-mono text-xs">{provider.executionMode}</td>
                    <td class="font-mono text-xs">{provider.adapter ?? "—"}</td>
                    <td class="space-y-2">
                      {#if provider.isCircuitBroken}
                        <div class="font-mono text-xs text-slate-500">
                          {formatDateTime(provider.circuitBrokenAt)}
                        </div>
                        <div class="text-xs text-error">
                          {provider.circuitBreakReason ?? "未记录原因"}
                        </div>
                        <form method="post" action="?/resetProviderCircuit">
                          <input
                            type="hidden"
                            name="providerId"
                            value={provider.id}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <input
                            name="resetReason"
                            class="input input-bordered input-xs w-full"
                            placeholder="解除原因"
                          />
                          <button
                            class="btn btn-xs btn-outline mt-2"
                            type="submit"
                          >
                            解除熔断
                          </button>
                        </form>
                      {:else}
                        <form
                          method="post"
                          action="?/tripProviderCircuit"
                          class="space-y-2"
                        >
                          <input
                            type="hidden"
                            name="providerId"
                            value={provider.id}
                          />
                          <input
                            type="hidden"
                            name="totpCode"
                            value={stepUpCode}
                          />
                          <input
                            name="circuitReason"
                            class="input input-bordered input-xs w-full"
                            placeholder="熔断原因"
                          />
                          <button
                            class="btn btn-xs btn-error mt-2"
                            type="submit"
                          >
                            一键熔断
                          </button>
                        </form>
                      {/if}
                    </td>
                  </tr>

                  {#if provider.configViolations.length > 0}
                    <tr>
                      <td
                        colspan="8"
                        class="bg-[var(--admin-primary-soft)] text-xs text-slate-700"
                      >
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
    </section>
  {/if}
</div>
