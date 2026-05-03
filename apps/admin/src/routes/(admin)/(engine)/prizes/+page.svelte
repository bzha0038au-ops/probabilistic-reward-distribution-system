<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  import AdminPrizeManagementSection from "../(shared)/control-center/admin-prize-management-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"
  import PrizesModuleTabs from "./prizes-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const prizes = $derived(data.prizes ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const activePrizeCount = $derived(
    prizes.filter((prize) => prize.isActive).length,
  )
  const totalStock = $derived(
    prizes.reduce((total, prize) => total + (prize.stock ?? 0), 0),
  )
  const totalBudget = $derived(
    prizes.reduce((total, prize) => total + parseAmount(prize.payoutBudget), 0),
  )
  const totalRewardAmount = $derived(
    prizes.reduce((total, prize) => total + parseAmount(prize.rewardAmount), 0),
  )
  const formatAmount = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : "0"
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/prizes/registry") return "registry"
    if ($page.url.pathname === "/prizes/management") return "management"
    if ($page.url.pathname === "/prizes/controls") return "controls"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const pageDescription = $derived.by(() => {
    if (activeModule === "registry") {
      return "Prize registry 独立成页，只看库存、权重、阈值和当前 runtime catalogue。"
    }
    if (activeModule === "management") {
      return "奖品创建、编辑、停用和删除集中到单独管理台，不再和治理说明混排。"
    }
    if (activeModule === "controls") {
      return "预算、reward load 和引擎约束拆到单独控制面，只处理治理语境。"
    }
    return "Prizes Hub 现在只保留摘要和模块入口，把台账、管理和治理约束拆到独立工作台。"
  })
  const prizeModules = $derived([
    {
      href: "/prizes/registry",
      eyebrow: "Runtime Ledger",
      title: "Registry",
      description:
        "库存、权重、池阈值和 reward envelope 单独进入奖品台账，不再和编辑表单混排。",
      badge: `${prizes.length}`,
    },
    {
      href: "/prizes/management",
      eyebrow: "Management Desk",
      title: "Management",
      description:
        "创建、编辑、停用和删除动作集中在管理面板，方便逐条处理变更。",
      badge: `${activePrizeCount}`,
    },
    {
      href: "/prizes/controls",
      eyebrow: "Control Notes",
      title: "Controls",
      description:
        "预算暴露、库存负载和治理约束拆到单独控制面，减少主工作区堆叠。",
      badge: `${formatAmount(totalBudget)}`,
    },
  ])

  function parseAmount(value: string | number | null | undefined) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (value === null || value === undefined) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · prizeGovernance"
    eyebrow="Engine"
    title="Prizes"
    description={pageDescription}
  />

  <PrizesModuleTabs />

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

  {#if isHubModule}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Catalogue
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {prizes.length}
            </p>
            <span class="badge badge-outline">registry</span>
          </div>
          <p class="text-sm text-slate-500">
            Total prizes registered in the shared draw engine.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Active
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {activePrizeCount}
            </p>
            <span class="badge badge-outline">live</span>
          </div>
          <p class="text-sm text-slate-500">
            Prizes currently eligible to participate in runtime selection.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Inventory
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {totalStock.toLocaleString()}
            </p>
            <span class="badge badge-outline">stock</span>
          </div>
          <p class="text-sm text-slate-500">
            Aggregate stock units held across the visible catalogue.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Reward Budget
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {formatAmount(totalBudget)}
            </p>
            <span class="badge badge-outline">exposure</span>
          </div>
          <p class="text-sm text-slate-500">
            Budget exposure across payout caps. Reward face value total: {formatAmount(
              totalRewardAmount,
            )}.
          </p>
        </div>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      {#each prizeModules as module}
        <article class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  {module.eyebrow}
                </p>
                <h2
                  class="mt-2 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
                >
                  {module.title}
                </h2>
              </div>
              <span class="badge badge-outline">{module.badge}</span>
            </div>
            <p class="text-sm leading-6 text-[var(--admin-muted)]">
              {module.description}
            </p>
            <div class="pt-2">
              <a class="btn btn-outline" href={module.href}>Open Module</a>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {:else if activeModule === "registry"}
    <AdminPrizeManagementSection {prizes} {t} mode="registry" />
  {:else if activeModule === "management"}
    <AdminPrizeManagementSection {prizes} {t} mode="management" />
  {:else}
    <AdminPrizeManagementSection {prizes} {t} mode="controls" />
  {/if}
</div>
