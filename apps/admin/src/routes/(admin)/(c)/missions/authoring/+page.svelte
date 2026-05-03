<script lang="ts">
  import MissionsPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<MissionsPage {data} />
