<script lang="ts">
  import TenantUsagePage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<TenantUsagePage {data} />
