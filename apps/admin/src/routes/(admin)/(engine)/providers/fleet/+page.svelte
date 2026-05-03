<script lang="ts">
  import ProvidersPage from "../+page.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<ProvidersPage {data} />
