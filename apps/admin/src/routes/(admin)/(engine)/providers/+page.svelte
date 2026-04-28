<script lang="ts">
  import { page } from "$app/stores"

  import AdminProviderGovernanceSection from "../(shared)/control-center/admin-provider-governance-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")

  const providers = $derived(data.providers ?? [])
  const mfaEnabled = $derived(
    Boolean(data.admin?.mfaEnabled ?? data.mfaStatus?.mfaEnabled),
  )
  const actionError = $derived($page.form?.error as string | undefined)
</script>

<header class="space-y-3">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Engine
  </p>
  <h1 class="text-3xl font-semibold">Providers</h1>
  <p class="max-w-3xl text-sm text-slate-600">
    支付 provider 属于引擎共享基础设施，通道草稿、启停和熔断都与具体产品面分离。
  </p>
</header>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if actionError}
  <div class="alert alert-error mt-6 text-sm">
    <span>{actionError}</span>
  </div>
{/if}

<section class="mt-6 card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="card-title">Provider Step-Up</h2>
        <p class="text-sm text-slate-500">
          熔断与自动化相关高风险操作使用当前页面的 MFA step-up 码。
        </p>
      </div>
      <span class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}>
        {mfaEnabled ? "MFA Enabled" : "MFA Required"}
      </span>
    </div>
    <label class="form-control max-w-sm">
      <span class="label-text mb-2">MFA 验证码</span>
      <input
        name="totpCode"
        type="text"
        inputmode="text"
        autocomplete="one-time-code"
        class="input input-bordered"
        bind:value={stepUpCode}
        placeholder="执行熔断或恢复前先输入验证码"
        disabled={!mfaEnabled}
      />
    </label>
    {#if !mfaEnabled}
      <p class="text-sm text-warning">
        请先到 Config 页面完成管理员 MFA 绑定后再执行敏感 provider 操作。
      </p>
    {/if}
  </div>
</section>

<section class="mt-6">
  <AdminProviderGovernanceSection {providers} {stepUpCode} />
</section>
