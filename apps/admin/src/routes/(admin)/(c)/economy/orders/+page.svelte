<script lang="ts">
  import EconomyPage from "../+page.svelte"
  import type { ActionData } from "../$types"
  import type { PageData } from "../page-support"

  let { data, form }: { data: PageData; form: ActionData } = $props()
</script>

<EconomyPage {data} {form} />
