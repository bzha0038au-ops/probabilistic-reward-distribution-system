<script lang="ts">
  import {
    buildEditPrizeForm,
    createPrizeForm,
    type Prize,
    type PrizeEditForm,
  } from "./page-support"

  type Translate = (key: string) => string

  let {
    prizes,
    t,
  }: {
    prizes: Prize[]
    t: Translate
  } = $props()

  let createForm = $state(createPrizeForm())
  let editForm = $state<PrizeEditForm | null>(null)

  const startEdit = (prize: Prize) => {
    editForm = buildEditPrizeForm(prize)
  }

  const confirmDelete = (event: SubmitEvent) => {
    if (!confirm(t("admin.confirmDelete"))) {
      event.preventDefault()
    }
  }
</script>

<div class="card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div>
      <h2 class="card-title">{t("admin.create.title")}</h2>
      <p class="text-sm text-slate-500">{t("admin.create.description")}</p>
    </div>

    <form method="post" action="?/create" class="grid gap-4">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="form-control">
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
            <span class="label-text">{t("admin.form.poolThreshold")}</span>
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
            <span class="label-text">{t("admin.form.userPoolThreshold")}</span>
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
            <span class="label-text">{t("admin.form.rewardAmount")}</span>
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
            <span class="label-text">{t("admin.form.payoutBudget")}</span>
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
            <span class="label-text">{t("admin.form.payoutPeriodDays")}</span>
          </label>
          <input
            id="create-period"
            name="payoutPeriodDays"
            type="number"
            class="input input-bordered"
            bind:value={createForm.payoutPeriodDays}
          />
        </div>
        <label class="label cursor-pointer justify-start gap-3">
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
  </div>
</div>

<div class="card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div>
      <h2 class="card-title">{t("admin.edit.title")}</h2>
      <p class="text-sm text-slate-500">{t("admin.edit.description")}</p>
    </div>

    {#if editForm}
      <form method="post" action="?/update" class="grid gap-4">
        <input type="hidden" name="id" value={editForm.id} />
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
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
              <span class="label-text">{t("admin.form.poolThreshold")}</span>
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
              <span class="label-text">{t("admin.form.userPoolThreshold")}</span>
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
              <span class="label-text">{t("admin.form.rewardAmount")}</span>
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
              <span class="label-text">{t("admin.form.payoutBudget")}</span>
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
              <span class="label-text">{t("admin.form.payoutPeriodDays")}</span>
            </label>
            <input
              id="edit-period"
              name="payoutPeriodDays"
              type="number"
              class="input input-bordered"
              bind:value={editForm.payoutPeriodDays}
            />
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-primary" type="submit">
            {t("admin.edit.save")}
          </button>
          <button
            class="btn btn-outline"
            type="button"
            onclick={() => (editForm = null)}
          >
            {t("admin.edit.cancel")}
          </button>
        </div>
      </form>
    {:else}
      <p class="text-sm text-slate-500">{t("admin.edit.empty")}</p>
    {/if}
  </div>
</div>

<section class="mt-8 card bg-base-100 shadow lg:col-span-2">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("admin.table.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.table.description")}</p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("admin.table.headers.name")}</th>
            <th>{t("admin.table.headers.stock")}</th>
            <th>{t("admin.table.headers.weight")}</th>
            <th>{t("admin.table.headers.threshold")}</th>
            <th>{t("admin.table.headers.userThreshold")}</th>
            <th>{t("admin.table.headers.reward")}</th>
            <th>{t("admin.table.headers.budget")}</th>
            <th>{t("admin.table.headers.period")}</th>
            <th>{t("admin.table.headers.status")}</th>
            <th class="text-right">{t("admin.table.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each prizes as prize}
            <tr>
              <td class="font-medium">{prize.name}</td>
              <td>{prize.stock}</td>
              <td>{prize.weight}</td>
              <td>{prize.poolThreshold}</td>
              <td>{prize.userPoolThreshold}</td>
              <td>{prize.rewardAmount}</td>
              <td>{prize.payoutBudget}</td>
              <td>{prize.payoutPeriodDays}</td>
              <td>
                <span class={prize.isActive ? "badge badge-primary" : "badge"}>
                  {prize.isActive
                    ? t("admin.table.statusActive")
                    : t("admin.table.statusInactive")}
                </span>
              </td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    onclick={() => startEdit(prize)}
                  >
                    {t("admin.table.actionEdit")}
                  </button>
                  <form method="post" action="?/toggle">
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-xs" type="submit">
                      {t("admin.table.actionToggle")}
                    </button>
                  </form>
                  <form method="post" action="?/delete" onsubmit={confirmDelete}>
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-error btn-xs" type="submit">
                      {t("admin.table.actionDelete")}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
          {#if prizes.length === 0}
            <tr>
              <td colspan="10" class="text-center text-slate-500">
                {t("admin.table.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
