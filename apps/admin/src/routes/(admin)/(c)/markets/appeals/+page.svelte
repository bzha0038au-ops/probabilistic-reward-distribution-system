<script lang="ts">
  import MarketsPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<MarketsPage {data} />
