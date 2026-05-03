<script lang="ts">
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AdminConfigModuleTabs from "../../(shared)/control-center/admin-config-module-tabs.svelte"
  import AdminConfigBonusReleaseSection from "../../(shared)/control-center/admin-config-bonus-release-section.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<AdminPageHeader
  context="Config · Legacy Bonus Release"
  eyebrow="Engine"
  title="Legacy Bonus Release"
  description="把退役奖励释放流程单独放进历史面板，只保留说明和审计上下文，不再跟实时控制项堆在一起。"
/>

<AdminConfigModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-8">
  <AdminConfigBonusReleaseSection config={data.config} />
</section>
