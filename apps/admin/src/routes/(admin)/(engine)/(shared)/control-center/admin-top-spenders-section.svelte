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
  <section class="card bg-base-100 shadow">
    <div class="card-body">
      <div class="space-y-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Spend Watch
        </p>
        <h2 class="card-title">{t("admin.topSpenders.title")}</h2>
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="table">
          <thead
            class="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"
          >
            <tr>
              <th>{t("admin.topSpenders.userId")}</th>
              <th>{t("admin.topSpenders.spend")}</th>
            </tr>
          </thead>
          <tbody>
            {#each spenders as spender}
              <tr>
                <td class="font-mono text-[var(--admin-ink)]">
                  #{spender.userId}
                </td>
                <td class="font-mono text-[var(--admin-ink)]">
                  {spender.spent}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
{/if}
