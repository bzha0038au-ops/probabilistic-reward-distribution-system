<script lang="ts">
  import ChangeRequestsPage from "../+page.svelte"
  import type { PageData } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()
</script>

<ChangeRequestsPage {data} />
