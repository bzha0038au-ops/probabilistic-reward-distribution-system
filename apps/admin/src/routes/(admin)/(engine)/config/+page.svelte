<script lang="ts">
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AdminConfigModuleTabs from "../(shared)/control-center/admin-config-module-tabs.svelte"
  import AdminMetricsSection from "../(shared)/control-center/admin-metrics-section.svelte"
  import AdminTopSpendersSection from "../(shared)/control-center/admin-top-spenders-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const analytics = $derived(data.analytics)
  const winRateLabel = $derived(
    analytics ? `${(analytics.winRate * 100).toFixed(2)}%` : "0%",
  )

  const configModules = $derived([
    {
      href: "/config/high-risk-controls",
      eyebrow: "Configuration Governance",
      title: "高风险配置控制面",
      description:
        "维护入口开关、支付路径、风控冻结与核心参数，不再和桌规混写。",
      accent: "badge-error",
      badge: "High Impact",
    },
    {
      href: "/config/blackjack-rules",
      eyebrow: "Table Rules",
      title: "Blackjack 规则",
      description: "拆分桌规、赔付倍数和分牌策略，独立处理在局风险和结算纪律。",
      accent: "badge-outline",
      badge: "Table Ops",
    },
    {
      href: "/config/legacy-bonus-release",
      eyebrow: "Retired Path",
      title: "Legacy Bonus Release",
      description: "保留退役流程的说明和审计上下文，不再和实时配置放在一起。",
      accent: "badge-warning",
      badge: "Disabled",
    },
    {
      href: "/config/operator-security",
      eyebrow: "Operator Security",
      title: "Operator MFA",
      description:
        "把 step-up、恢复码和停用流程单独收纳，Config Hub 只保留控制中枢。",
      accent: "badge-outline",
      badge: "Security",
    },
  ])
</script>

<AdminPageHeader
  context="Workspace · controlCenter"
  eyebrow="Engine"
  title="System Control Node"
  description="Config Hub 现在只保留控制中枢和模块入口，把高风险配置、Blackjack 规则、Legacy Bonus Release 和 Operator MFA 全部拆成独立面板。"
/>

<AdminConfigModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-8 space-y-6">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Config Drawer
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
          >
            分域治理入口
          </h2>
        </div>
        <a class="btn btn-outline" href="/change-requests"
          >Open Change Requests</a
        >
      </div>

      <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
        不再把所有配置堆在同一页。选择一个治理模块进入，保存草稿后统一走审批和发布链。
      </p>

      <div class="grid gap-4 lg:grid-cols-4">
        {#each configModules as module}
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
              <span class={`badge ${module.accent}`}>{module.badge}</span>
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

  <AdminMetricsSection
    {analytics}
    reconciliationAlertsSummary={data.reconciliationAlertsSummary}
    {t}
    {winRateLabel}
  />

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
    <div class="card bg-base-100 shadow">
      <div
        class="card-body flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="space-y-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Legal Workspace
          </p>
          <h2 class="card-title">Release-Controlled Documents</h2>
          <p class="max-w-2xl text-sm text-slate-500">
            协议条款已经迁移到独立的 Legal 页面管理，在那里处理版本草稿、HTML
            预览、diff、灰度发布和回滚。
          </p>
        </div>
        <a class="btn btn-outline" href="/legal">Open Legal</a>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Operator Security
          </p>
          <h2 class="card-title mt-2">Authenticator Governance</h2>
          <p class="text-sm text-slate-500">
            MFA、recovery codes 和 step-up 已拆到独立面板，不再占用 Config Hub。
          </p>
        </div>
        <a
          class="btn btn-outline w-full sm:w-auto"
          href="/config/operator-security"
        >
          Open Operator MFA
        </a>
      </div>
    </div>
  </div>

  <AdminTopSpendersSection spenders={analytics?.topSpenders ?? []} {t} />
</section>
