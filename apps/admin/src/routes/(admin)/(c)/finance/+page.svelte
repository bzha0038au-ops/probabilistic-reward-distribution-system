<script lang="ts">
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import FinanceCapabilitiesSection from "./finance-capabilities-section.svelte"
  import FinanceModuleTabs from "./finance-module-tabs.svelte"
  import type { PageData } from "./page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const deposits = $derived(data.deposits ?? [])
  const withdrawals = $derived(data.withdrawals ?? [])
  const cryptoDepositChannels = $derived(data.cryptoDepositChannels ?? [])
  const paymentCapabilities = $derived(data.paymentCapabilities)

  const financeModules = $derived([
    {
      href: "/finance/deposits",
      eyebrow: "Deposit Queue",
      title: t("finance.deposits.title"),
      description:
        "入账确认、provider state 和 reversal 从总览页拆出去，保持单页只看一类队列。",
      badge: `${deposits.length}`,
      accent: "badge-outline",
    },
    {
      href: "/finance/withdrawals",
      eyebrow: "Withdrawal Queue",
      title: t("finance.withdrawals.title"),
      description:
        "审批、provider submit、paid 和 fail 流程单独处理，不再和 deposits 混排。",
      badge: `${withdrawals.length}`,
      accent: "badge-outline",
    },
    {
      href: "/finance/crypto-channels",
      eyebrow: "Crypto Channels",
      title: t("finance.cryptoChannels.title"),
      description:
        "链路注册和地址配置单独进一个页面，避免和人工审核队列挤在一起。",
      badge: `${cryptoDepositChannels.length}`,
      accent: "badge-outline",
    },
  ])
</script>

<AdminPageHeader
  context="Workspace · financeOps"
  eyebrow="FinanceOps"
  title={t("finance.title")}
  description="Finance Hub 现在只保留路由状态和模块入口，把 deposits、withdrawals、crypto channels 都拆到独立工作台。"
/>

<FinanceModuleTabs />

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
            Finance Drawer
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
          >
            分域操作入口
          </h2>
        </div>
      </div>

      <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
        资金操作不再塞在同一页。选择一个工作台进入，分别处理充值、提现和链路配置。
      </p>

      <div class="grid gap-4 lg:grid-cols-3">
        {#each financeModules as module}
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

  <FinanceCapabilitiesSection {paymentCapabilities} {t} />
</section>
