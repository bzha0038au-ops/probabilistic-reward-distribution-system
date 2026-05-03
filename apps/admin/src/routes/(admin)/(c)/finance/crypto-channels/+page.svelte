<script lang="ts">
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import FinanceCryptoChannelsSection from "../finance-crypto-channels-section.svelte"
  import FinanceModuleTabs from "../finance-module-tabs.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
</script>

<AdminPageHeader
  context="Finance · Crypto Channels"
  eyebrow="FinanceOps"
  title={t("finance.cryptoChannels.title")}
  description="把链路注册、地址和确认数配置拆成独立页面，不再和审核队列表混在一起。"
/>

<FinanceModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

<section class="mt-8">
  <FinanceCryptoChannelsSection
    cryptoDepositChannels={data.cryptoDepositChannels ?? []}
    {t}
  />
</section>
