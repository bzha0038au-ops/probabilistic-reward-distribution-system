<script lang="ts">
  import SecurityPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<SecurityPage {data} />
