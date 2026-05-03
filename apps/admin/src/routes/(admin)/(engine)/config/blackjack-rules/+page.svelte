<script lang="ts">
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AdminConfigModuleTabs from "../../(shared)/control-center/admin-config-module-tabs.svelte"
  import AdminConfigBlackjackSection from "../../(shared)/control-center/admin-config-blackjack-section.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<AdminPageHeader
  context="Config · Blackjack Rules"
  eyebrow="Engine"
  title="Blackjack 规则"
  description="把下注上下限、赔付和分牌规则收进独立工作台，避免跟全局高风险配置一起堆在总览页。"
/>

<AdminConfigModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-8">
  <AdminConfigBlackjackSection config={data.config} />
</section>
