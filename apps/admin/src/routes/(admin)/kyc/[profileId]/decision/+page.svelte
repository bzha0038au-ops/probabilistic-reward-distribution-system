<script lang="ts">
  import KycDetailPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<KycDetailPage {data} />
