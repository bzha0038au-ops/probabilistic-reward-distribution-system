<script lang="ts">
  import AuditPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<AuditPage {data} />
