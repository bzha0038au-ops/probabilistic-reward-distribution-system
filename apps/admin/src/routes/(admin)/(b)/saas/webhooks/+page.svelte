<script lang="ts">
  import SaasPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<SaasPage {data} />
