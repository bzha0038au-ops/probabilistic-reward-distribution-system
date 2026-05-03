<script lang="ts">
  import {
    buildEditPrizeForm,
    createPrizeForm,
    type Prize,
    type PrizeEditForm,
  } from "./page-support"

  type Translate = (key: string) => string
  type PrizeModuleMode = "full" | "registry" | "management" | "controls"

  let {
    prizes,
    t,
    mode = "full",
  }: {
    prizes: Prize[]
    t: Translate
    mode?: PrizeModuleMode
  } = $props()

  let createForm = $state(createPrizeForm())
  let editForm = $state<PrizeEditForm | null>(null)
  let selectedPrizeId = $state<number | null>(null)
  let didInitializeSelection = $state(false)

  const selectedPrize = $derived(
    prizes.find((prize) => prize.id === selectedPrizeId) ?? null,
  )
  const activePrizeCount = $derived(
    prizes.filter((prize) => prize.isActive).length,
  )
  const totalStock = $derived(
    prizes.reduce((total, prize) => total + (prize.stock ?? 0), 0),
  )
  const totalRewardAmount = $derived(
    prizes.reduce(
      (total, prize) => total + parseDecimal(prize.rewardAmount),
      0,
    ),
  )
  const totalPayoutBudget = $derived(
    prizes.reduce(
      (total, prize) => total + parseDecimal(prize.payoutBudget),
      0,
    ),
  )
  const showSummaryStrip = $derived(mode === "full" || mode === "registry")
  const showSelectedPrizeCard = $derived(
    mode === "full" || mode === "registry" || mode === "controls",
  )
  const showManagementDesk = $derived(mode === "full" || mode === "management")
  const showControlNotes = $derived(mode === "full" || mode === "controls")
  const showMutationActions = $derived(mode === "full" || mode === "management")
  const sectionTitle = $derived.by(() => {
    if (mode === "management") return "Prize Management"
    if (mode === "controls") return "Prize Controls"
    return "Prize Registry"
  })
  const sectionDescription = $derived.by(() => {
    if (mode === "management") {
      return "左侧保持奖品目录与选择，右侧专注创建、编辑、停用和删除，不再和治理说明混排。"
    }
    if (mode === "controls") {
      return "控制面只保留选中奖品的 envelope 和治理约束，方便查看预算与库存负载。"
    }
    return "库存、权重、阈值与 reward envelope 单独进入奖品台账，避免与变更表单堆在同一页。"
  })

  const startEdit = (prize: Prize) => {
    selectedPrizeId = prize.id
    editForm = buildEditPrizeForm(prize)
  }

  const selectPrize = (prize: Prize) => {
    selectedPrizeId = prize.id
  }

  const startCreate = () => {
    selectedPrizeId = null
    editForm = null
    createForm = createPrizeForm()
  }

  const confirmDelete = (event: SubmitEvent) => {
    if (!confirm(t("admin.confirmDelete"))) {
      event.preventDefault()
    }
  }

  const formatCompactNumber = (value: number) =>
    Number.isFinite(value) ? value.toLocaleString() : "0"

  const formatCurrencyLike = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : "0"

  $effect(() => {
    if (didInitializeSelection) return
    if (prizes.length === 0) {
      didInitializeSelection = true
      return
    }

    startEdit(prizes[0])
    didInitializeSelection = true
  })

  $effect(() => {
    if (!selectedPrize) return
    editForm = buildEditPrizeForm(selectedPrize)
  })

  function parseDecimal(value: string | number | null | undefined) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (value === null || value === undefined) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
</script>

<section
  class="overflow-hidden rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] shadow-[var(--admin-shadow)]"
>
  <div
    class="flex flex-col gap-5 border-b border-[var(--admin-border)] px-6 py-5 lg:flex-row lg:items-start lg:justify-between"
  >
    <div class="space-y-2">
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
      >
        Reward Governance
      </p>
      <div>
        <h2
          class="font-['Newsreader'] text-[1.9rem] leading-tight text-[var(--admin-ink)]"
        >
          {sectionTitle}
        </h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
          {sectionDescription}
        </p>
      </div>
    </div>

    {#if showSummaryStrip}
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
        >
          <div
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
          >
            Catalogue
          </div>
          <div
            class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
          >
            {prizes.length}
          </div>
        </div>
        <div
          class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
        >
          <div
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
          >
            Live
          </div>
          <div
            class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
          >
            {activePrizeCount}
          </div>
        </div>
        <div
          class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
        >
          <div
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
          >
            Inventory
          </div>
          <div
            class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
          >
            {formatCompactNumber(totalStock)}
          </div>
        </div>
        <div
          class="rounded-[0.85rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] px-4 py-3"
        >
          <div
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
          >
            Reward Load
          </div>
          <div
            class="mt-3 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
          >
            {formatCurrencyLike(totalRewardAmount)}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div
    class="grid gap-6 border-t border-[var(--admin-border)] p-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]"
  >
    <div class="min-w-0 space-y-6">
      <section
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)]"
      >
        <div
          class="flex flex-col gap-3 border-b border-[var(--admin-border)] px-5 py-4 md:flex-row md:items-start md:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Runtime Ledger
            </p>
            <h3 class="mt-2 text-lg font-semibold text-[var(--admin-ink)]">
              {t("admin.table.title")}
            </h3>
            <p class="mt-1 text-sm text-[var(--admin-muted)]">
              {t("admin.table.description")}
            </p>
          </div>

          {#if showMutationActions}
            <button class="btn btn-outline" type="button" onclick={startCreate}>
              New Prize
            </button>
          {/if}
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full border-separate border-spacing-0 text-sm">
            <thead class="bg-[var(--admin-paper)]">
              <tr>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Prize
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Stock
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Weight
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Thresholds
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Reward Envelope
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-left font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Status
                </th>
                <th
                  class="border-b border-[var(--admin-border)] px-4 py-4 text-right font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {#if prizes.length === 0}
                <tr>
                  <td
                    colspan="7"
                    class="px-4 py-10 text-center text-sm text-[var(--admin-muted)]"
                  >
                    {t("admin.table.empty")}
                  </td>
                </tr>
              {:else}
                {#each prizes as prize}
                  <tr
                    class={`align-top ${selectedPrizeId === prize.id ? "bg-[color:color-mix(in_srgb,var(--admin-primary)_7%,white)]" : ""}`}
                  >
                    <td class="border-b border-[var(--admin-border)] px-4 py-4">
                      <div class="font-medium text-[var(--admin-ink)]">
                        {prize.name}
                      </div>
                      <div
                        class="mt-1 font-mono text-xs text-[var(--admin-muted)]"
                      >
                        #{prize.id}
                      </div>
                    </td>
                    <td
                      class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-[var(--admin-ink)]"
                    >
                      {formatCompactNumber(prize.stock)}
                    </td>
                    <td
                      class="border-b border-[var(--admin-border)] px-4 py-4 font-mono text-xs text-[var(--admin-ink)]"
                    >
                      {prize.weight}
                    </td>
                    <td class="border-b border-[var(--admin-border)] px-4 py-4">
                      <div
                        class="space-y-1 font-mono text-xs text-[var(--admin-muted)]"
                      >
                        <div>pool {prize.poolThreshold}</div>
                        <div>user {prize.userPoolThreshold}</div>
                      </div>
                    </td>
                    <td class="border-b border-[var(--admin-border)] px-4 py-4">
                      <div
                        class="space-y-1 font-mono text-xs text-[var(--admin-muted)]"
                      >
                        <div>reward {prize.rewardAmount}</div>
                        <div>budget {prize.payoutBudget}</div>
                        <div>period {prize.payoutPeriodDays}d</div>
                      </div>
                    </td>
                    <td class="border-b border-[var(--admin-border)] px-4 py-4">
                      <span
                        class={prize.isActive
                          ? "badge badge-success"
                          : "badge badge-ghost"}
                      >
                        {prize.isActive
                          ? t("admin.table.statusActive")
                          : t("admin.table.statusInactive")}
                      </span>
                    </td>
                    <td class="border-b border-[var(--admin-border)] px-4 py-4">
                      <div class="admin-inline-actions">
                        {#if showMutationActions}
                          <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            onclick={() => startEdit(prize)}
                          >
                            {t("admin.table.actionEdit")}
                          </button>
                          <form method="post" action="?/toggle">
                            <input type="hidden" name="id" value={prize.id} />
                            <button class="btn btn-sm" type="submit">
                              {t("admin.table.actionToggle")}
                            </button>
                          </form>
                          <form
                            method="post"
                            action="?/delete"
                            onsubmit={confirmDelete}
                          >
                            <input type="hidden" name="id" value={prize.id} />
                            <button class="btn btn-error btn-sm" type="submit">
                              {t("admin.table.actionDelete")}
                            </button>
                          </form>
                        {:else}
                          <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            onclick={() => selectPrize(prize)}
                          >
                            Inspect
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
      {#if showSelectedPrizeCard}
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Reward Envelope
              </p>
              <h3 class="card-title mt-2">Selected Prize</h3>
              <p class="text-sm text-slate-500">
                查看当前奖品的库存、阈值和预算约束，再决定是否进入治理动作。
              </p>
            </div>

            {#if selectedPrize}
              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-base font-semibold text-[var(--admin-ink)]">
                      {selectedPrize.name}
                    </p>
                    <p class="mt-1 font-mono text-xs text-[var(--admin-muted)]">
                      Prize #{selectedPrize.id}
                    </p>
                  </div>
                  <span
                    class={selectedPrize.isActive
                      ? "badge badge-success"
                      : "badge badge-ghost"}
                  >
                    {selectedPrize.isActive
                      ? t("admin.table.statusActive")
                      : t("admin.table.statusInactive")}
                  </span>
                </div>

                <dl class="mt-4 space-y-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-4">
                    <dt>Stock</dt>
                    <dd class="font-mono text-xs">{selectedPrize.stock}</dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Weight</dt>
                    <dd class="font-mono text-xs">{selectedPrize.weight}</dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Pool threshold</dt>
                    <dd class="font-mono text-xs">
                      {selectedPrize.poolThreshold}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>User threshold</dt>
                    <dd class="font-mono text-xs">
                      {selectedPrize.userPoolThreshold}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Reward amount</dt>
                    <dd class="font-mono text-xs">
                      {selectedPrize.rewardAmount}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Payout budget</dt>
                    <dd class="font-mono text-xs">
                      {selectedPrize.payoutBudget}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt>Payout period</dt>
                    <dd class="font-mono text-xs">
                      {selectedPrize.payoutPeriodDays}d
                    </dd>
                  </div>
                </dl>
              </div>
            {:else}
              <div
                class="rounded-[0.95rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 text-sm text-[var(--admin-muted)]"
              >
                选择左侧奖品后，这里会显示库存和预算约束。
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if showManagementDesk}
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Management Desk
                </p>
                <h3 class="card-title mt-2">
                  {editForm ? t("admin.edit.title") : t("admin.create.title")}
                </h3>
                <p class="text-sm text-slate-500">
                  {editForm
                    ? t("admin.edit.description")
                    : t("admin.create.description")}
                </p>
              </div>
              {#if editForm}
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  onclick={startCreate}
                >
                  New
                </button>
              {/if}
            </div>

            {#if editForm}
              <form method="post" action="?/update" class="grid gap-4">
                <input type="hidden" name="id" value={editForm.id} />

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="form-control md:col-span-2">
                    <label class="label" for="edit-name">
                      <span class="label-text">{t("admin.form.name")}</span>
                    </label>
                    <input
                      id="edit-name"
                      name="name"
                      class="input input-bordered"
                      bind:value={editForm.name}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-stock">
                      <span class="label-text">{t("admin.form.stock")}</span>
                    </label>
                    <input
                      id="edit-stock"
                      name="stock"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.stock}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-weight">
                      <span class="label-text">{t("admin.form.weight")}</span>
                    </label>
                    <input
                      id="edit-weight"
                      name="weight"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.weight}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-threshold">
                      <span class="label-text"
                        >{t("admin.form.poolThreshold")}</span
                      >
                    </label>
                    <input
                      id="edit-threshold"
                      name="poolThreshold"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.poolThreshold}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-user-threshold">
                      <span class="label-text"
                        >{t("admin.form.userPoolThreshold")}</span
                      >
                    </label>
                    <input
                      id="edit-user-threshold"
                      name="userPoolThreshold"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.userPoolThreshold}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-reward">
                      <span class="label-text"
                        >{t("admin.form.rewardAmount")}</span
                      >
                    </label>
                    <input
                      id="edit-reward"
                      name="rewardAmount"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.rewardAmount}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-budget">
                      <span class="label-text"
                        >{t("admin.form.payoutBudget")}</span
                      >
                    </label>
                    <input
                      id="edit-budget"
                      name="payoutBudget"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.payoutBudget}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="edit-period">
                      <span class="label-text"
                        >{t("admin.form.payoutPeriodDays")}</span
                      >
                    </label>
                    <input
                      id="edit-period"
                      name="payoutPeriodDays"
                      type="number"
                      class="input input-bordered"
                      bind:value={editForm.payoutPeriodDays}
                    />
                  </div>
                  <label
                    class="label cursor-pointer justify-start gap-3 md:col-span-2"
                  >
                    <input
                      type="checkbox"
                      name="isActive"
                      class="checkbox checkbox-primary"
                      bind:checked={editForm.isActive}
                    />
                    <span class="label-text">{t("admin.form.isActive")}</span>
                  </label>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button class="btn btn-primary" type="submit">
                    {t("admin.edit.save")}
                  </button>
                  <button
                    class="btn btn-outline"
                    type="button"
                    onclick={() =>
                      (editForm = selectedPrize
                        ? buildEditPrizeForm(selectedPrize)
                        : null)}
                  >
                    {t("admin.edit.cancel")}
                  </button>
                </div>
              </form>
            {:else}
              <form method="post" action="?/create" class="grid gap-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="form-control md:col-span-2">
                    <label class="label" for="create-name">
                      <span class="label-text">{t("admin.form.name")}</span>
                    </label>
                    <input
                      id="create-name"
                      name="name"
                      class="input input-bordered"
                      bind:value={createForm.name}
                      required
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-stock">
                      <span class="label-text">{t("admin.form.stock")}</span>
                    </label>
                    <input
                      id="create-stock"
                      name="stock"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.stock}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-weight">
                      <span class="label-text">{t("admin.form.weight")}</span>
                    </label>
                    <input
                      id="create-weight"
                      name="weight"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.weight}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-threshold">
                      <span class="label-text"
                        >{t("admin.form.poolThreshold")}</span
                      >
                    </label>
                    <input
                      id="create-threshold"
                      name="poolThreshold"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.poolThreshold}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-user-threshold">
                      <span class="label-text"
                        >{t("admin.form.userPoolThreshold")}</span
                      >
                    </label>
                    <input
                      id="create-user-threshold"
                      name="userPoolThreshold"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.userPoolThreshold}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-reward">
                      <span class="label-text"
                        >{t("admin.form.rewardAmount")}</span
                      >
                    </label>
                    <input
                      id="create-reward"
                      name="rewardAmount"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.rewardAmount}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-budget">
                      <span class="label-text"
                        >{t("admin.form.payoutBudget")}</span
                      >
                    </label>
                    <input
                      id="create-budget"
                      name="payoutBudget"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.payoutBudget}
                    />
                  </div>
                  <div class="form-control">
                    <label class="label" for="create-period">
                      <span class="label-text"
                        >{t("admin.form.payoutPeriodDays")}</span
                      >
                    </label>
                    <input
                      id="create-period"
                      name="payoutPeriodDays"
                      type="number"
                      class="input input-bordered"
                      bind:value={createForm.payoutPeriodDays}
                    />
                  </div>
                  <label
                    class="label cursor-pointer justify-start gap-3 md:col-span-2"
                  >
                    <input
                      type="checkbox"
                      name="isActive"
                      class="checkbox checkbox-primary"
                      bind:checked={createForm.isActive}
                    />
                    <span class="label-text">{t("admin.form.isActive")}</span>
                  </label>
                </div>

                <button class="btn btn-primary" type="submit">
                  {t("admin.create.submit")}
                </button>
              </form>
            {/if}
          </div>
        </section>
      {/if}

      {#if showControlNotes}
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Control Notes
              </p>
              <h3 class="card-title mt-2">Governance Constraints</h3>
              <p class="text-sm text-slate-500">
                预算和奖励额属于共享引擎约束，停用和删除都会影响 draw runtime
                的可用奖品集合。
              </p>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Active budget load</dt>
                <dd class="font-mono text-xs">
                  {formatCurrencyLike(totalPayoutBudget)}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Active prize count</dt>
                <dd class="font-mono text-xs">{activePrizeCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Inventory units</dt>
                <dd class="font-mono text-xs">
                  {formatCompactNumber(totalStock)}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      {/if}
    </aside>
  </div>
</section>
