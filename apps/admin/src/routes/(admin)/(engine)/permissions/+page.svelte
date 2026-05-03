<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

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
    ($page.form?.selectedAdminId as number | undefined) ??
      data.selectedAdminId ??
      null,
  )
  const scopeUpdate = $derived(
    ($page.form?.scopeUpdate as ScopeUpdateResult | undefined) ?? null,
  )
  const selectedAdmin = $derived(
    admins.find((admin) => admin.adminId === selectedAdminId) ??
      admins[0] ??
      null,
  )
  const adminsWithManagedScopes = $derived(
    admins.filter((admin) => admin.managedScopes.length > 0).length,
  )
  const activeAdminCount = $derived(
    admins.filter((admin) => admin.isActive).length,
  )
  const mfaEnabledCount = $derived(
    admins.filter((admin) => admin.mfaEnabled).length,
  )
  const groupedScopePool = $derived.by(() => ({
    engine: scopePool.filter((scope) => scope.group === "engine"),
    consumer: scopePool.filter((scope) => scope.group === "consumer"),
    business: scopePool.filter((scope) => scope.group === "business"),
  }))
  const scopeGroups = $derived([
    {
      key: "engine" as const,
      title: t("permissions.groups.engine"),
      scopes: groupedScopePool.engine,
    },
    {
      key: "consumer" as const,
      title: t("permissions.groups.consumer"),
      scopes: groupedScopePool.consumer,
    },
    {
      key: "business" as const,
      title: t("permissions.groups.business"),
      scopes: groupedScopePool.business,
    },
  ])
  const selectedScopeDefinitions = $derived(
    selectedAdmin
      ? scopePool.filter((scope) =>
          selectedAdmin.managedScopes.includes(scope.key),
        )
      : [],
  )

  const buildConfirmationText = (adminId: number) =>
    `APPLY ENGINE SCOPES ${adminId}`

  $effect(() => {
    if (!selectedAdmin) return
    confirmationText = buildConfirmationText(selectedAdmin.adminId)
  })

  const displayName = (admin: AdminScopeAssignment) =>
    admin.displayName ?? admin.email
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · permissionOps"
    eyebrow="Engine"
    title={t("permissions.title")}
    description={t("permissions.description")}
  />

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if scopeUpdate}
    <div class="alert alert-success text-sm">
      <span>
        {t("permissions.success")}
        {scopeUpdate.admin.email}
        {#if scopeUpdate.addedScopes.length > 0}
          · +{scopeUpdate.addedScopes.join(", ")}
        {/if}
        {#if scopeUpdate.removedScopes.length > 0}
          · -{scopeUpdate.removedScopes.join(", ")}
        {/if}
      </span>
    </div>
  {/if}

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Registry
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {admins.length}
          </p>
          <span class="badge badge-outline">admins</span>
        </div>
        <p class="text-sm text-slate-500">
          {t("permissions.summary.adminCount")}
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Active
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {activeAdminCount}
          </p>
          <span class="badge badge-outline">live</span>
        </div>
        <p class="text-sm text-slate-500">
          {t("permissions.summary.activeCount")} · {adminsWithManagedScopes} with
          managed scopes
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          MFA
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {mfaEnabledCount}
          </p>
          <span class="badge badge-outline">verified</span>
        </div>
        <p class="text-sm text-slate-500">
          Admin identities currently protected by MFA before scope changes.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Scope Pool
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {scopePool.length}
          </p>
          <span class="badge badge-outline">grants</span>
        </div>
        <p class="text-sm text-slate-500">
          {t("permissions.summary.scopeCount")}
        </p>
      </div>
    </article>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3">
      <p
        class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
      >
        Governance Notice
      </p>
      <div>
        <p class="text-sm font-semibold text-[var(--admin-ink)]">
          {t("permissions.noticeTitle")}
        </p>
        <p class="mt-2 text-sm text-slate-500">{t("permissions.noticeBody")}</p>
      </div>
    </div>
  </section>

  <section
    class="grid gap-6 xl:grid-cols-[minmax(300px,0.88fr)_minmax(0,1.56fr)]"
  >
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Admin Directory
            </p>
            <h2 class="card-title mt-2">{t("permissions.directory.title")}</h2>
            <p class="text-sm text-slate-500">
              {t("permissions.directory.description")}
            </p>
          </div>
          <span class="badge badge-outline">{admins.length} records</span>
        </div>

        {#if admins.length === 0}
          <div class="admin-empty-state admin-empty-state--center p-10">
            {t("permissions.directory.empty")}
          </div>
        {:else}
          <div class="space-y-4">
            {#each admins as admin}
              {@const isSelected = selectedAdmin?.adminId === admin.adminId}
              <a
                href={`?adminId=${admin.adminId}`}
                class={`admin-selectable-card block rounded-[1rem] p-4 ${
                  isSelected ? "admin-selectable-card--active" : ""
                }`}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 space-y-1">
                    <p class="truncate font-semibold text-[var(--admin-ink)]">
                      {displayName(admin)}
                    </p>
                    <p class="truncate text-sm text-slate-500">{admin.email}</p>
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <span
                      class={`badge ${admin.isActive ? "badge-success" : "badge-ghost"}`}
                    >
                      {admin.isActive ? "active" : "inactive"}
                    </span>
                    <span class="badge badge-outline">
                      {admin.mfaEnabled
                        ? t("permissions.directory.mfaEnabled")
                        : t("permissions.directory.mfaDisabled")}
                    </span>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  {#if admin.managedScopes.length === 0}
                    <span class="badge badge-ghost">
                      {t("permissions.directory.noScopes")}
                    </span>
                  {:else}
                    {#each admin.managedScopes as scopeKey}
                      <span class="badge badge-outline">{scopeKey}</span>
                    {/each}
                  {/if}
                </div>

                <p class="mt-4 text-xs text-slate-500">
                  {t("permissions.directory.legacyCount")}
                  {admin.legacyPermissions.length}
                </p>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    {#if !selectedAdmin}
      <section class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="admin-empty-state admin-empty-state--center p-10">
            {t("permissions.editor.empty")}
          </div>
        </div>
      </section>
    {:else}
      <form
        method="post"
        action="?/save"
        class="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]"
      >
        <input type="hidden" name="adminId" value={selectedAdmin.adminId} />

        <div class="min-w-0 space-y-6">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-5">
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
              >
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Scope Editor
                  </p>
                  <h2 class="card-title mt-2">
                    {t("permissions.editor.title")}
                  </h2>
                  <p class="text-sm text-slate-500">
                    {displayName(selectedAdmin)} · {selectedAdmin.email}
                  </p>
                </div>
                <span class="badge badge-outline">
                  {selectedAdmin.managedScopes.length} managed scopes
                </span>
              </div>

              <div class="grid gap-4 xl:grid-cols-3">
                {#each scopeGroups as group}
                  <article
                    class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          {group.key}
                        </p>
                        <h3
                          class="mt-2 text-base font-semibold text-[var(--admin-ink)]"
                        >
                          {group.title}
                        </h3>
                      </div>
                      <span class="badge badge-outline"
                        >{group.scopes.length}</span
                      >
                    </div>

                    <div class="mt-4 space-y-3">
                      {#if group.scopes.length === 0}
                        <div
                          class="rounded-[0.9rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm text-slate-500"
                        >
                          No scopes available in this group.
                        </div>
                      {:else}
                        {#each group.scopes as scope}
                          <label
                            class="flex items-start gap-3 rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-3"
                          >
                            <input
                              type="checkbox"
                              name="scopeKeys"
                              value={scope.key}
                              class="checkbox checkbox-sm mt-0.5"
                              checked={selectedAdmin.managedScopes.includes(
                                scope.key,
                              )}
                            />
                            <span class="min-w-0">
                              <span
                                class="block font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-ink)]"
                              >
                                {scope.key}
                              </span>
                              <span class="mt-1 block text-sm text-slate-500">
                                {scope.description || scope.label}
                              </span>
                            </span>
                          </label>
                        {/each}
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-6 xl:sticky xl:top-24 self-start">
          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Selected Admin
                </p>
                <h2 class="card-title mt-2">Access Dossier</h2>
                <p class="text-sm text-slate-500">
                  Current identity, managed scopes, and legacy grant context for
                  the active operator.
                </p>
              </div>

              <div
                class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
              >
                <p class="text-base font-semibold text-[var(--admin-ink)]">
                  {displayName(selectedAdmin)}
                </p>
                <p class="mt-1 text-sm text-slate-500">{selectedAdmin.email}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <span
                    class={`badge ${selectedAdmin.isActive ? "badge-success" : "badge-ghost"}`}
                  >
                    {selectedAdmin.isActive ? "active" : "inactive"}
                  </span>
                  <span class="badge badge-outline">
                    {selectedAdmin.mfaEnabled
                      ? t("permissions.directory.mfaEnabled")
                      : t("permissions.directory.mfaDisabled")}
                  </span>
                  <span class="badge badge-outline"
                    >user #{selectedAdmin.userId}</span
                  >
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Managed scopes
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    {selectedAdmin.managedScopes.length}
                  </p>
                </div>
                <div
                  class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                >
                  <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Legacy grants
                  </p>
                  <p class="mt-2 text-sm font-medium text-[var(--admin-ink)]">
                    {selectedAdmin.legacyPermissions.length}
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                {#if selectedScopeDefinitions.length === 0}
                  <span class="badge badge-ghost"
                    >{t("permissions.editor.none")}</span
                  >
                {:else}
                  {#each selectedScopeDefinitions as scope}
                    <span class="badge badge-outline">{scope.key}</span>
                  {/each}
                {/if}
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Legacy Ledger
                </p>
                <h2 class="card-title mt-2">
                  {t("permissions.editor.legacyTitle")} ({selectedAdmin
                    .legacyPermissions.length})
                </h2>
                <p class="text-sm text-slate-500">
                  {t("permissions.editor.legacyDescription")}
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                {#if selectedAdmin.legacyPermissions.length === 0}
                  <span class="badge badge-ghost"
                    >{t("permissions.editor.none")}</span
                  >
                {:else}
                  {#each selectedAdmin.legacyPermissions as permissionKey}
                    <span class="badge badge-outline">{permissionKey}</span>
                  {/each}
                {/if}
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Confirmation Desk
                </p>
                <h2 class="card-title mt-2">Scope Commit</h2>
                <p class="text-sm text-slate-500">
                  Confirm the exact scope change and provide an active MFA code
                  before saving the updated operator envelope.
                </p>
              </div>

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
                  <code
                    class="ml-1 rounded bg-[var(--admin-paper)] px-1.5 py-0.5 font-mono"
                  >
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

              <button class="btn btn-primary w-full">
                {t("permissions.editor.save")}
              </button>
            </div>
          </section>
        </aside>
      </form>
    {/if}
  </section>
</div>
