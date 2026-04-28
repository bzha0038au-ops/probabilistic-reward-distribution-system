<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPrizeManagementSection from "../(shared)/control-center/admin-prize-management-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const prizes = $derived(data.prizes ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
</script>

<header class="space-y-3">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Engine
  </p>
  <h1 class="text-3xl font-semibold">Prizes</h1>
  <p class="max-w-3xl text-sm text-slate-600">
    奖品池、库存和权重属于引擎层共享能力，在这里和 ToC / SaaS 产品操作面明确拆开。
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

<section class="mt-6">
  <AdminPrizeManagementSection {prizes} {t} />
</section>
