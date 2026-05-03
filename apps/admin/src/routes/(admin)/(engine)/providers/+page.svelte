<script lang="ts">
  import { page } from "$app/stores"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  import AdminProviderGovernanceSection from "../(shared)/control-center/admin-provider-governance-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"
  import ProviderModuleTabs from "./provider-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")

  const providers = $derived(data.providers ?? [])
  const mfaEnabled = $derived(
    Boolean(data.admin?.mfaEnabled ?? data.mfaStatus?.mfaEnabled),
  )
  const actionError = $derived($page.form?.error as string | undefined)
  const activeProviders = $derived(
    providers.filter(
      (provider) => provider.isActive && !provider.isCircuitBroken,
    ).length,
  )
  const circuitBrokenProviders = $derived(
    providers.filter((provider) => provider.isCircuitBroken).length,
  )
  const automatedProviders = $derived(
    providers.filter((provider) => provider.executionMode === "automated")
      .length,
  )
  const violationCount = $derived(
    providers.reduce(
      (count, provider) => count + provider.configViolations.length,
      0,
    ),
  )
  const depositCapableProviders = $derived(
    providers.filter((provider) => provider.supportedFlows.includes("deposit"))
      .length,
  )
  const withdrawalCapableProviders = $derived(
    providers.filter((provider) =>
      provider.supportedFlows.includes("withdrawal"),
    ).length,
  )
  const pageDescription = $derived.by(() => {
    if ($page.url.pathname === "/providers/drafts") {
      return "Provider draft authoring 独立成页，只处理新增、启停、优先级和自动出款草稿。"
    }
    if ($page.url.pathname === "/providers/fleet") {
      return "Provider fleet 和 circuit break 运行态拆成独立工作台，避免和草稿作者面混排。"
    }
    if ($page.url.pathname === "/providers/controls") {
      return "MFA、traffic composition 和 review protocol 收敛到控制面，只做高风险判断与执行前检查。"
    }
    return "支付 provider 属于共享引擎基础设施，通道草稿、熔断、启停和自动出款模式都在这里统一治理。"
  })
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/providers/drafts") return "drafts"
    if ($page.url.pathname === "/providers/fleet") return "fleet"
    if ($page.url.pathname === "/providers/controls") return "controls"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isDraftsModule = $derived(activeModule === "drafts")
  const isFleetModule = $derived(activeModule === "fleet")
  const isControlsModule = $derived(activeModule === "controls")
  const providerModules = $derived([
    {
      href: "/providers/drafts",
      eyebrow: "Draft Desk",
      title: "Drafts",
      description:
        "新增 provider、执行模式变更和 activation state 都先进入 draft authoring，不直接碰运行态。",
      badge: `${providers.length}`,
    },
    {
      href: "/providers/fleet",
      eyebrow: "Runtime Ledger",
      title: "Fleet",
      description:
        "当前 provider fleet、adapter、supported flows 和 circuit break 状态集中到单独 ledger。",
      badge: `${activeProviders}`,
    },
    {
      href: "/providers/controls",
      eyebrow: "Control Desk",
      title: "Controls",
      description:
        "MFA、traffic composition 和处理协议独立成 operator 控制面，先判断再执行熔断或恢复。",
      badge: `${circuitBrokenProviders}`,
    },
  ])
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · providerControl"
    eyebrow="Engine"
    title="Providers"
    description={pageDescription}
  />

  <ProviderModuleTabs />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Runtime Active
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {activeProviders}
          </p>
          <span class="badge badge-outline">live</span>
        </div>
        <p class="text-sm text-slate-500">
          Providers currently active and not under circuit break.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Circuit Breakers
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {circuitBrokenProviders}
          </p>
          <span class="badge badge-outline">gated</span>
        </div>
        <p class="text-sm text-slate-500">
          Emergency stops currently holding payment traffic out of runtime.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Automated Modes
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {automatedProviders}
          </p>
          <span class="badge badge-outline">auto</span>
        </div>
        <p class="text-sm text-slate-500">
          Providers configured for automated execution instead of manual review.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Config Violations
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {violationCount}
          </p>
          <span class="badge badge-outline">checks</span>
        </div>
        <p class="text-sm text-slate-500">
          Validation issues currently raised against provider configuration.
        </p>
      </div>
    </article>
  </section>

  {#if isHubModule}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]"
    >
      <div class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Provider Drawer
              </p>
              <h2
                class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
              >
                分域治理入口
              </h2>
            </div>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            将草稿 authoring、runtime fleet 和 operator control
            拆开。先进入对应模块，再执行 provider 变更、熔断或恢复。
          </p>

          <div class="grid gap-4 lg:grid-cols-3">
            {#each providerModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]"
                    >arrow_forward</span
                  >
                </div>
              </a>
            {/each}
          </div>
        </div>
      </div>

      <aside class="space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Runtime Lens
              </p>
              <h2 class="card-title mt-2">Traffic Composition</h2>
              <p class="text-sm text-slate-500">
                快速对照流向覆盖、熔断数量和自动模式占比，再决定是否发起草稿或人工熔断。
              </p>
            </div>

            <div class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Visible providers</dt>
                <dd class="font-mono text-xs">{providers.length}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Deposit capable</dt>
                <dd class="font-mono text-xs">{depositCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Withdrawal capable</dt>
                <dd class="font-mono text-xs">{withdrawalCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Manual review</dt>
                <dd class="font-mono text-xs">
                  {providers.length - automatedProviders}
                </dd>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isDraftsModule}
    <section class="min-w-0">
      <AdminProviderGovernanceSection {providers} {stepUpCode} mode="drafts" />
    </section>
  {/if}

  {#if isFleetModule}
    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"
    >
      <div class="min-w-0">
        <AdminProviderGovernanceSection {providers} {stepUpCode} mode="fleet" />
      </div>

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Provider Step-Up
              </p>
              <h2 class="card-title mt-2">Operator Verification</h2>
              <p class="text-sm text-slate-500">
                熔断、恢复和自动化相关高风险操作都复用当前页面的 MFA step-up。
              </p>
            </div>

            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm font-medium text-slate-900">
                  Verification State
                </p>
                <span
                  class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}
                >
                  {mfaEnabled ? "MFA Enabled" : "MFA Required"}
                </span>
              </div>

              <label class="form-control mt-4">
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
                <p class="mt-4 text-sm text-warning">
                  请先到 Config 页面完成管理员 MFA 绑定后再执行敏感 provider
                  操作。
                </p>
              {/if}
            </div>
          </div>
        </section>

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Runtime Lens
              </p>
              <h2 class="card-title mt-2">Traffic Composition</h2>
              <p class="text-sm text-slate-500">
                快速对照流向覆盖、熔断数量和自动模式占比，再决定是否发起草稿或人工熔断。
              </p>
            </div>

            <div class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Visible providers</dt>
                <dd class="font-mono text-xs">{providers.length}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Deposit capable</dt>
                <dd class="font-mono text-xs">{depositCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Withdrawal capable</dt>
                <dd class="font-mono text-xs">{withdrawalCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Manual review</dt>
                <dd class="font-mono text-xs">
                  {providers.length - automatedProviders}
                </dd>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isControlsModule}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]"
    >
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Provider Step-Up
            </p>
            <h2 class="card-title mt-2">Operator Verification</h2>
            <p class="text-sm text-slate-500">
              熔断、恢复和自动化相关高风险操作都复用当前页面的 MFA step-up。
            </p>
          </div>

          <div
            class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
          >
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm font-medium text-slate-900">
                Verification State
              </p>
              <span
                class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}
              >
                {mfaEnabled ? "MFA Enabled" : "MFA Required"}
              </span>
            </div>

            <label class="form-control mt-4">
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
              <p class="mt-4 text-sm text-warning">
                请先到 Config 页面完成管理员 MFA 绑定后再执行敏感 provider
                操作。
              </p>
            {/if}
          </div>
        </div>
      </section>

      <aside class="space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Runtime Lens
              </p>
              <h2 class="card-title mt-2">Traffic Composition</h2>
              <p class="text-sm text-slate-500">
                快速对照流向覆盖、熔断数量和自动模式占比，再决定是否发起草稿或人工熔断。
              </p>
            </div>

            <div class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Visible providers</dt>
                <dd class="font-mono text-xs">{providers.length}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Deposit capable</dt>
                <dd class="font-mono text-xs">{depositCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Withdrawal capable</dt>
                <dd class="font-mono text-xs">{withdrawalCapableProviders}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Manual review</dt>
                <dd class="font-mono text-xs">
                  {providers.length - automatedProviders}
                </dd>
              </div>
            </div>
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
              <h2 class="card-title mt-2">Provider Handling</h2>
              <p class="text-sm text-slate-500">
                草稿变更和熔断都要先完成原因记录，避免把运行态操作变成黑盒。
              </p>
            </div>

            <ul class="space-y-2 text-sm text-slate-600">
              <li>
                1. 先确认当前 provider 是否承担充值、提现，避免误切断关键流向。
              </li>
              <li>
                2. 自动执行模式的调整优先走草稿审批，不直接在运行态改配置。
              </li>
              <li>3. 熔断和恢复都必须写明原因，便于后续审计和回滚复盘。</li>
            </ul>
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
