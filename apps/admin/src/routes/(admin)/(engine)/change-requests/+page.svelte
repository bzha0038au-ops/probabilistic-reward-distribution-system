<script lang="ts">
  import { page } from "$app/stores"

  import AdminChangeRequestsSection from "../(shared)/control-center/admin-change-requests-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")

  const changeRequests = $derived(data.changeRequests ?? [])
  const mfaEnabled = $derived(
    Boolean(data.admin?.mfaEnabled ?? data.mfaStatus?.mfaEnabled),
  )
  const actionError = $derived($page.form?.error as string | undefined)
</script>

<header class="space-y-3">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Engine
  </p>
  <h1 class="text-3xl font-semibold">Change Requests</h1>
  <p class="max-w-3xl text-sm text-slate-600">
    共享引擎变更和 SaaS
    运营兜底都在这条队列内流转，确保草稿、审批、发布与产品面板解耦。
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
        <h2 class="card-title">Publish Step-Up</h2>
        <p class="text-sm text-slate-500">
          发布配置或通道变更时，使用这里输入的 MFA step-up 码。
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
        placeholder="发布前输入管理员 MFA 验证码"
        disabled={!mfaEnabled}
      />
    </label>
    {#if !mfaEnabled}
      <p class="text-sm text-warning">
        请先到 Config 页面启用管理员 MFA，再执行生产发布。
      </p>
    {/if}
  </div>
</section>

<section class="mt-6">
  <AdminChangeRequestsSection {changeRequests} {mfaEnabled} {stepUpCode} />
</section>
