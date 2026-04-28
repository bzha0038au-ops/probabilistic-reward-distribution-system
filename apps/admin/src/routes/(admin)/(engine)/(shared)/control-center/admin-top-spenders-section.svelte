<script lang="ts">
  type Translate = (key: string) => string

  let {
    spenders,
    t,
  }: {
    spenders: Array<{ userId: number; spent: number }>
    t: Translate
  } = $props()
</script>

{#if spenders.length > 0}
  <section class="mt-8 card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">{t("admin.topSpenders.title")}</h2>
      <div class="overflow-x-auto mt-4">
        <table class="table">
          <thead>
            <tr>
              <th>{t("admin.topSpenders.userId")}</th>
              <th>{t("admin.topSpenders.spend")}</th>
            </tr>
          </thead>
          <tbody>
            {#each spenders as spender}
              <tr>
                <td>{spender.userId}</td>
                <td>{spender.spent}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
{/if}
