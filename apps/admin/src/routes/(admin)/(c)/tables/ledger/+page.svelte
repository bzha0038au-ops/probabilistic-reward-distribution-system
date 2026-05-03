<script lang="ts">
  import TablesPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<TablesPage {data} />
