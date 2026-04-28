<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  type ScopeGroup = "engine" | "consumer" | "business"

  interface ScopeDefinition {
    key: string
    group: ScopeGroup
    label: string
    description: string
  }

  interface AdminScopeAssignment {
    adminId: number
    userId: number
    email: string
    displayName: string | null
    isActive: boolean
    mfaEnabled: boolean
    managedScopes: string[]
    legacyPermissions: string[]
  }

  interface ScopeUpdateResult {
    admin: AdminScopeAssignment
    addedScopes: string[]
    removedScopes: string[]
  }

  interface PageData {
    admins: AdminScopeAssignment[]
    scopePool: ScopeDefinition[]
    selectedAdminId: number | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let confirmationText = $state("")
  let stepUpCode = $state("")

  const admins = $derived(data.admins ?? [])
  const scopePool = $derived(data.scopePool ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const selectedAdminId = $derived(
    (($page.form?.selectedAdminId as number | undefined) ?? data.selectedAdminId) ??
      null,
  )
  const scopeUpdate = $derived(
    ($page.form?.scopeUpdate as ScopeUpdateResult | undefined) ?? null,
  )
  const selectedAdmin = $derived(
    admins.find((admin) => admin.adminId === selectedAdminId) ?? admins[0] ?? null,
  )
  const adminsWithManagedScopes = $derived(
    admins.filter((admin) => admin.managedScopes.length > 0).length,
  )
  const groupedScopePool = $derived.by(() => ({
    engine: scopePool.filter((scope) => scope.group === "engine"),
    consumer: scopePool.filter((scope) => scope.group === "consumer"),
    business: scopePool.filter((scope) => scope.group === "business"),
  }))

  const buildConfirmationText = (adminId: number) =>
    `APPLY ENGINE SCOPES ${adminId}`

  $effect(() => {
    if (!selectedAdmin) return
    confirmationText = buildConfirmationText(selectedAdmin.adminId)
  })
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("permissions.title")}
  </p>
  <h1 class="text-3xl font-semibold">{t("permissions.title")}</h1>
  <p class="max-w-4xl text-sm text-slate-600">{t("permissions.description")}</p>
</header>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if actionError}
  <div class="alert alert-error mt-6 text-sm">
    <span>{actionError}</span>
  </div>
{/if}

{#if scopeUpdate}
  <div class="alert alert-success mt-6 text-sm">
    <span>
      {t("permissions.success")} {scopeUpdate.admin.email}
      {#if scopeUpdate.addedScopes.length > 0}
        · +{scopeUpdate.addedScopes.join(", ")}
      {/if}
      {#if scopeUpdate.removedScopes.length > 0}
        · -{scopeUpdate.removedScopes.join(", ")}
      {/if}
    </span>
  </div>
{/if}

<section class="mt-6 grid gap-4 md:grid-cols-3">
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("permissions.summary.adminCount")}</p>
    <p class="mt-3 text-3xl font-semibold">{admins.length}</p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("permissions.summary.activeCount")}</p>
    <p class="mt-3 text-3xl font-semibold">{adminsWithManagedScopes}</p>
  </article>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-sm text-slate-500">{t("permissions.summary.scopeCount")}</p>
    <p class="mt-3 text-3xl font-semibold">{scopePool.length}</p>
  </article>
</section>

<section class="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
  <p class="font-semibold">{t("permissions.noticeTitle")}</p>
  <p class="mt-2">{t("permissions.noticeBody")}</p>
</section>

<div class="mt-6 grid gap-6 xl:grid-cols-[1.1fr,1.9fr]">
  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{t("permissions.directory.title")}</h2>
        <p class="mt-1 text-sm text-slate-500">
          {t("permissions.directory.description")}
        </p>
      </div>
    </div>

    {#if admins.length === 0}
      <p class="mt-6 text-sm text-slate-500">{t("permissions.directory.empty")}</p>
    {:else}
      <div class="mt-5 space-y-3">
        {#each admins as admin}
          {@const isSelected = selectedAdmin?.adminId === admin.adminId}
          <a
            href={`?adminId=${admin.adminId}`}
            class={`block rounded-2xl border p-4 transition hover:border-primary/50 hover:shadow-sm ${
              isSelected ? "border-primary bg-primary/5" : "border-slate-200"
            }`}
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">
                  {admin.displayName ?? admin.email}
                </p>
                <p class="text-sm text-slate-500">{admin.email}</p>
              </div>
              <span class="badge badge-outline">
                {admin.mfaEnabled
                  ? t("permissions.directory.mfaEnabled")
                  : t("permissions.directory.mfaDisabled")}
              </span>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              {#if admin.managedScopes.length === 0}
                <span class="badge badge-ghost">
                  {t("permissions.directory.noScopes")}
                </span>
              {:else}
                {#each admin.managedScopes as scopeKey}
                  <span class="badge badge-primary badge-outline">{scopeKey}</span>
                {/each}
              {/if}
            </div>

            <p class="mt-3 text-xs text-slate-500">
              {t("permissions.directory.legacyCount")} {admin.legacyPermissions.length}
            </p>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    {#if !selectedAdmin}
      <p class="text-sm text-slate-500">{t("permissions.editor.empty")}</p>
    {:else}
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 class="text-lg font-semibold">{t("permissions.editor.title")}</h2>
          <p class="mt-1 text-sm text-slate-500">
            {selectedAdmin.displayName ?? selectedAdmin.email} · {selectedAdmin.email}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if selectedAdmin.managedScopes.length === 0}
            <span class="badge badge-ghost">{t("permissions.editor.none")}</span>
          {:else}
            {#each selectedAdmin.managedScopes as scopeKey}
              <span class="badge badge-primary badge-outline">{scopeKey}</span>
            {/each}
          {/if}
        </div>
      </div>

      <form method="post" action="?/save" class="mt-6 space-y-6">
        <input type="hidden" name="adminId" value={selectedAdmin.adminId} />

        <div class="grid gap-4 lg:grid-cols-3">
          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 class="font-semibold text-slate-900">
              {t("permissions.groups.engine")}
            </h3>
            <div class="mt-4 space-y-3">
              {#each groupedScopePool.engine as scope}
                <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    name="scopeKeys"
                    value={scope.key}
                    class="checkbox checkbox-sm mt-0.5"
                    checked={selectedAdmin.managedScopes.includes(scope.key)}
                  />
                  <span>
                    <span class="block text-sm font-medium text-slate-900">
                      {scope.key}
                    </span>
                    <span class="block text-xs text-slate-500">
                      {scope.description}
                    </span>
                  </span>
                </label>
              {/each}
            </div>
          </article>

          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 class="font-semibold text-slate-900">
              {t("permissions.groups.consumer")}
            </h3>
            <div class="mt-4 space-y-3">
              {#each groupedScopePool.consumer as scope}
                <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    name="scopeKeys"
                    value={scope.key}
                    class="checkbox checkbox-sm mt-0.5"
                    checked={selectedAdmin.managedScopes.includes(scope.key)}
                  />
                  <span>
                    <span class="block text-sm font-medium text-slate-900">
                      {scope.key}
                    </span>
                    <span class="block text-xs text-slate-500">
                      {scope.description}
                    </span>
                  </span>
                </label>
              {/each}
            </div>
          </article>

          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 class="font-semibold text-slate-900">
              {t("permissions.groups.business")}
            </h3>
            <div class="mt-4 space-y-3">
              {#each groupedScopePool.business as scope}
                <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    name="scopeKeys"
                    value={scope.key}
                    class="checkbox checkbox-sm mt-0.5"
                    checked={selectedAdmin.managedScopes.includes(scope.key)}
                  />
                  <span>
                    <span class="block text-sm font-medium text-slate-900">
                      {scope.key}
                    </span>
                    <span class="block text-xs text-slate-500">
                      {scope.description}
                    </span>
                  </span>
                </label>
              {/each}
            </div>
          </article>
        </div>

        <details class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <summary class="cursor-pointer font-semibold text-slate-900">
            {t("permissions.editor.legacyTitle")} ({selectedAdmin.legacyPermissions.length})
          </summary>
          <p class="mt-2 text-sm text-slate-500">
            {t("permissions.editor.legacyDescription")}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            {#if selectedAdmin.legacyPermissions.length === 0}
              <span class="badge badge-ghost">{t("permissions.editor.none")}</span>
            {:else}
              {#each selectedAdmin.legacyPermissions as permissionKey}
                <span class="badge badge-outline">{permissionKey}</span>
              {/each}
            {/if}
          </div>
        </details>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="form-control">
            <span class="label-text mb-2">
              {t("permissions.editor.confirmationLabel")}
            </span>
            <input
              name="confirmationText"
              class="input input-bordered"
              bind:value={confirmationText}
              placeholder={buildConfirmationText(selectedAdmin.adminId)}
            />
            <span class="mt-2 text-xs text-slate-500">
              {t("permissions.editor.confirmationHint")}
              <code class="ml-1 rounded bg-slate-100 px-1.5 py-0.5">
                {buildConfirmationText(selectedAdmin.adminId)}
              </code>
            </span>
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("common.totpCode")}</span>
            <input
              name="totpCode"
              type="text"
              inputmode="text"
              autocomplete="one-time-code"
              class="input input-bordered"
              bind:value={stepUpCode}
              placeholder={t("permissions.editor.stepUpPlaceholder")}
            />
            <span class="mt-2 text-xs text-slate-500">
              {t("permissions.editor.stepUpDescription")}
            </span>
          </label>
        </div>

        <div class="flex items-center justify-end">
          <button class="btn btn-primary">{t("permissions.editor.save")}</button>
        </div>
      </form>
    {/if}
  </section>
</div>
