<script lang="ts">
  import PrizesPage from "../+page.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<PrizesPage {data} />
