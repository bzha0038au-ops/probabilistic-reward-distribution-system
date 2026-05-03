<script lang="ts">
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AdminConfigModuleTabs from "../../(shared)/control-center/admin-config-module-tabs.svelte"
  import AdminConfigHighRiskSection from "../../(shared)/control-center/admin-config-high-risk-section.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<AdminPageHeader
  context="Config · High-Risk Controls"
  eyebrow="Engine"
  title="高风险配置控制面"
  description="单独处理入口开关、支付和风控阈值，避免和 Blackjack 规则、Legacy Bonus Release 混在一页。"
/>

<AdminConfigModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-8">
  <AdminConfigHighRiskSection config={data.config} />
</section>
