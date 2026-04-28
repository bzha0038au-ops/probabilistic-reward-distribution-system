<script lang="ts">
  import "../../app.css"
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import LocaleSwitcher from "$lib/components/locale-switcher.svelte"
  import type {
    AdminNavGroup,
    AdminScopeId,
  } from "$lib/admin/access"

  interface Props {
    children?: import("svelte").Snippet
    data?: {
      admin?: { email?: string } | null
      adminScope?: AdminScopeId
      defaultRoute?: string
      navGroups?: AdminNavGroup[]
      reconciliationAlertsSummary?: { unresolvedCount?: number } | null
    }
  }

  let { children, data }: Props = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const adminEmail = $derived(data?.admin?.email ?? t("common.adminLabel"))
  const defaultRoute = $derived(data?.defaultRoute ?? "/")
  const adminScope = $derived(data?.adminScope ?? "mixedAccess")
  const navGroups = $derived(data?.navGroups ?? [])
  const unresolvedCount = $derived(
    data?.reconciliationAlertsSummary?.unresolvedCount ?? 0,
  )

  const scopeTitleKeys: Record<AdminScopeId, string> = {
    financeOps: "workspace.scopes.financeOps.title",
    saasOps: "workspace.scopes.saasOps.title",
    engineerOnCall: "workspace.scopes.engineerOnCall.title",
    controlCenter: "workspace.scopes.controlCenter.title",
    mixedAccess: "workspace.scopes.mixedAccess.title",
    restricted: "workspace.scopes.restricted.title",
  }

  const scopeDescriptionKeys: Record<AdminScopeId, string> = {
    financeOps: "workspace.scopes.financeOps.description",
    saasOps: "workspace.scopes.saasOps.description",
    engineerOnCall: "workspace.scopes.engineerOnCall.description",
    controlCenter: "workspace.scopes.controlCenter.description",
    mixedAccess: "workspace.scopes.mixedAccess.description",
    restricted: "workspace.scopes.restricted.description",
  }

  const isActive = (href: string, pathname: string) =>
    pathname === href || pathname.startsWith(`${href}/`)
</script>

<div class="min-h-screen bg-base-200">
  <nav
    class="navbar sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur"
  >
    <div class="flex-1 gap-4">
      <a href={defaultRoute} class="btn btn-ghost text-lg sm:text-xl">
        {t("common.appName")}
      </a>
      <div class="hidden md:flex flex-col">
        <span class="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
          {t("workspace.label")}
        </span>
        <span class="text-sm font-medium text-slate-900">
          {t(scopeTitleKeys[adminScope])}
        </span>
        <span class="text-xs text-slate-500">
          {t(scopeDescriptionKeys[adminScope])}
        </span>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm text-slate-600">{adminEmail}</span>
      <LocaleSwitcher />
      <a href="/logout" class="btn btn-outline btn-sm">{t("common.signOut")}</a>
    </div>
  </nav>

  <div
    class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6"
  >
    <aside class="w-full shrink-0 lg:sticky lg:top-24 lg:w-72">
      <div class="rounded-3xl border border-base-300 bg-base-100 p-4 shadow-sm">
        {#each navGroups as group, index}
          <section class={`space-y-2 ${index < navGroups.length - 1 ? "mb-5" : ""}`}>
            <p class="px-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
              {t(group.labelKey)}
            </p>
            <div class="space-y-1">
              {#each group.items as item}
                {@const active = isActive(item.href, $page.url.pathname)}
                <a
                  href={item.href}
                  class={`flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition ${
                    active
                      ? "bg-primary text-primary-content shadow-sm"
                      : "text-slate-700 hover:bg-base-200"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{t(item.labelKey)}</span>
                  {#if item.id === "reconciliation" && unresolvedCount > 0}
                    <span
                      class={`inline-flex h-2.5 w-2.5 rounded-full ${
                        active ? "bg-primary-content" : "bg-error"
                      }`}
                    ></span>
                  {:else if active}
                    <span class="text-xs opacity-80">●</span>
                  {/if}
                </a>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      {@render children?.()}
    </main>
  </div>
</div>
