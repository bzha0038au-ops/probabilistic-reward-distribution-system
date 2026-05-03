<script lang="ts">
  import UserDetailPage from "../+page.svelte"
  import type { PageData } from "../page-support"

  let { data }: { data: PageData } = $props()
</script>

<UserDetailPage {data} />
