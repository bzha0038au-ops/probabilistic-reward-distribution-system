<script lang="ts">
  import "../../app.css"
  import { dev as isDev } from "$app/environment"
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import LocaleSwitcher from "$lib/components/locale-switcher.svelte"
  import type {
    AdminNavGroup,
    AdminNavItemId,
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
  const configDrawerItems = [
    {
      href: "/config",
      label: "Config Hub",
    },
    {
      href: "/config/high-risk-controls",
      label: "高风险配置控制面",
    },
    {
      href: "/config/blackjack-rules",
      label: "Blackjack 规则",
    },
    {
      href: "/config/legacy-bonus-release",
      label: "Legacy Bonus Release",
    },
    {
      href: "/config/operator-security",
      label: "Operator MFA",
    },
  ] as const
  const financeDrawerItems = [
    {
      href: "/finance",
      label: "Finance Hub",
    },
    {
      href: "/finance/deposits",
      label: "Deposits",
    },
    {
      href: "/finance/withdrawals",
      label: "Withdrawals",
    },
    {
      href: "/finance/crypto-channels",
      label: "Crypto Channels",
    },
  ] as const
  const economyDrawerItems = [
    {
      href: "/economy",
      label: "Economy Hub",
    },
    {
      href: "/economy/assets",
      label: "Assets",
    },
    {
      href: "/economy/orders",
      label: "Orders",
    },
    {
      href: "/economy/controls",
      label: "Controls",
    },
  ] as const
  const marketsDrawerItems = [
    {
      href: "/markets",
      label: "Markets Hub",
    },
    {
      href: "/markets/appeals",
      label: "Appeals",
    },
    {
      href: "/markets/registry",
      label: "Registry",
    },
    {
      href: "/markets/creation",
      label: "Creation",
    },
  ] as const
  const tablesDrawerItems = [
    {
      href: "/tables",
      label: "Tables Hub",
    },
    {
      href: "/tables/ledger",
      label: "Ledger",
    },
    {
      href: "/tables/interventions",
      label: "Interventions",
    },
    {
      href: "/tables/runtime",
      label: "Runtime",
    },
  ] as const
  const missionsDrawerItems = [
    {
      href: "/missions",
      label: "Missions Hub",
    },
    {
      href: "/missions/registry",
      label: "Registry",
    },
    {
      href: "/missions/management",
      label: "Management",
    },
    {
      href: "/missions/authoring",
      label: "Authoring",
    },
  ] as const
  const saasDrawerItems = [
    {
      href: "/saas",
      label: "SaaS Hub",
    },
    {
      href: "/saas/tenants",
      label: "Tenants",
    },
    {
      href: "/saas/projects",
      label: "Projects",
    },
    {
      href: "/saas/billing",
      label: "Billing",
    },
    {
      href: "/saas/webhooks",
      label: "Webhooks",
    },
    {
      href: "/saas/disputes",
      label: "Disputes",
    },
  ] as const
  const securityDrawerItems = [
    {
      href: "/security",
      label: "Security Hub",
    },
    {
      href: "/security/signals",
      label: "Signals",
    },
    {
      href: "/security/freezes",
      label: "Freezes",
    },
    {
      href: "/security/jurisdiction",
      label: "Jurisdiction",
    },
  ] as const
  const auditDrawerItems = [
    {
      href: "/audit",
      label: "Audit Hub",
    },
    {
      href: "/audit/queue",
      label: "Queue",
    },
    {
      href: "/audit/context",
      label: "Context",
    },
    {
      href: "/audit/filters",
      label: "Filters",
    },
  ] as const
  const providersDrawerItems = [
    {
      href: "/providers",
      label: "Provider Hub",
    },
    {
      href: "/providers/drafts",
      label: "Drafts",
    },
    {
      href: "/providers/fleet",
      label: "Fleet",
    },
    {
      href: "/providers/controls",
      label: "Controls",
    },
  ] as const
  const prizesDrawerItems = [
    {
      href: "/prizes",
      label: "Prize Hub",
    },
    {
      href: "/prizes/registry",
      label: "Registry",
    },
    {
      href: "/prizes/management",
      label: "Management",
    },
    {
      href: "/prizes/controls",
      label: "Controls",
    },
  ] as const
  const changeRequestsDrawerItems = [
    {
      href: "/change-requests",
      label: "Change Hub",
    },
    {
      href: "/change-requests/drafts",
      label: "Drafts",
    },
    {
      href: "/change-requests/review",
      label: "Review",
    },
    {
      href: "/change-requests/release",
      label: "Release",
    },
  ] as const
  const operatorInitial = $derived(
    adminEmail.trim().charAt(0).toUpperCase() || "A",
  )
  const threatTheme = $derived($page.url.pathname.startsWith("/risk/collusion"))
  const configDrawerOpen = $derived(
    $page.url.pathname === "/config" ||
      $page.url.pathname.startsWith("/config/"),
  )
  const financeDrawerOpen = $derived(
    $page.url.pathname === "/finance" ||
      $page.url.pathname.startsWith("/finance/"),
  )
  const economyDrawerOpen = $derived(
    $page.url.pathname === "/economy" ||
      $page.url.pathname.startsWith("/economy/"),
  )
  const marketsDrawerOpen = $derived(
    $page.url.pathname === "/markets" ||
      $page.url.pathname.startsWith("/markets/"),
  )
  const tablesDrawerOpen = $derived(
    $page.url.pathname === "/tables" ||
      $page.url.pathname.startsWith("/tables/"),
  )
  const missionsDrawerOpen = $derived(
    $page.url.pathname === "/missions" ||
      $page.url.pathname.startsWith("/missions/"),
  )
  const saasDrawerOpen = $derived(
    $page.url.pathname === "/saas" || $page.url.pathname.startsWith("/saas/"),
  )
  const securityDrawerOpen = $derived(
    $page.url.pathname === "/security" ||
      $page.url.pathname.startsWith("/security/"),
  )
  const auditDrawerOpen = $derived(
    $page.url.pathname === "/audit" || $page.url.pathname.startsWith("/audit/"),
  )
  const providersDrawerOpen = $derived(
    $page.url.pathname === "/providers" ||
      $page.url.pathname.startsWith("/providers/"),
  )
  const prizesDrawerOpen = $derived(
    $page.url.pathname === "/prizes" ||
      $page.url.pathname.startsWith("/prizes/"),
  )
  const changeRequestsDrawerOpen = $derived(
    $page.url.pathname === "/change-requests" ||
      $page.url.pathname.startsWith("/change-requests/"),
  )

  const navItemIcons: Record<AdminNavItemId, string> = {
    config: "settings_input_component",
    legal: "gavel",
    providers: "hub",
    prizes: "military_tech",
    changeRequests: "assignment",
    permissions: "admin_panel_settings",
    economy: "trending_up",
    markets: "monitoring",
    finance: "payments",
    forum: "forum",
    kyc: "fingerprint",
    aml: "verified_user",
    users: "group",
    tables: "table_restaurant",
    missions: "flag",
    saas: "business",
    reconciliation: "account_balance",
    security: "shield",
    audit: "list_alt",
    collusion: "security",
  }

  const navLookup = $derived(
    new Map(
      navGroups.flatMap((group) =>
        group.items.map((item) => [item.id, item] as const),
      ),
    ),
  )

  const workspaceShortcuts = $derived(
    [
      navLookup.get("config")
        ? {
            id: "config",
            href: navLookup.get("config")!.href,
            label: "ControlCenter",
            itemIds: [
              "config",
              "legal",
              "providers",
              "prizes",
              "changeRequests",
              "permissions",
            ] as AdminNavItemId[],
          }
        : null,
      navLookup.get("finance")
        ? {
            id: "finance",
            href: navLookup.get("finance")!.href,
            label: "FinanceOps",
            itemIds: [
              "finance",
              "economy",
              "markets",
              "forum",
              "kyc",
              "users",
              "tables",
              "missions",
              "aml",
            ] as AdminNavItemId[],
          }
        : null,
      navLookup.get("saas")
        ? {
            id: "saas",
            href: navLookup.get("saas")!.href,
            label: "SaaS-Ops",
            itemIds: ["saas"] as AdminNavItemId[],
          }
        : null,
      navLookup.get("reconciliation")
        ? {
            id: "reconciliation",
            href: navLookup.get("reconciliation")!.href,
            label: "On-Call",
            itemIds: [
              "reconciliation",
              "security",
              "audit",
              "collusion",
            ] as AdminNavItemId[],
          }
        : null,
    ].filter(
      (
        shortcut,
      ): shortcut is {
        id: AdminNavItemId
        href: string
        label: string
        itemIds: AdminNavItemId[]
      } => shortcut !== null,
    ),
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

  const isShortcutActive = (itemIds: AdminNavItemId[], pathname: string) =>
    itemIds.some((itemId) => {
      const item = navLookup.get(itemId)
      return item ? isActive(item.href, pathname) : false
    })

  const isConfigDrawerItemActive = (href: string, pathname: string) =>
    href === "/config" ? pathname === href : isActive(href, pathname)

  const isFinanceDrawerItemActive = (href: string, pathname: string) =>
    href === "/finance" ? pathname === href : isActive(href, pathname)

  const isEconomyDrawerItemActive = (href: string, pathname: string) =>
    href === "/economy" ? pathname === href : isActive(href, pathname)

  const isMarketsDrawerItemActive = (href: string, pathname: string) =>
    href === "/markets" ? pathname === href : isActive(href, pathname)

  const isTablesDrawerItemActive = (href: string, pathname: string) =>
    href === "/tables" ? pathname === href : isActive(href, pathname)

  const isMissionsDrawerItemActive = (href: string, pathname: string) =>
    href === "/missions" ? pathname === href : isActive(href, pathname)

  const isSaasDrawerItemActive = (href: string, pathname: string) =>
    href === "/saas" ? pathname === href : isActive(href, pathname)

  const isSecurityDrawerItemActive = (href: string, pathname: string) =>
    href === "/security" ? pathname === href : isActive(href, pathname)

  const isAuditDrawerItemActive = (href: string, pathname: string) =>
    href === "/audit" ? pathname === href : isActive(href, pathname)

  const isProvidersDrawerItemActive = (href: string, pathname: string) =>
    href === "/providers" ? pathname === href : isActive(href, pathname)

  const isPrizesDrawerItemActive = (href: string, pathname: string) =>
    href === "/prizes" ? pathname === href : isActive(href, pathname)

  const isChangeRequestsDrawerItemActive = (href: string, pathname: string) =>
    href === "/change-requests" ? pathname === href : isActive(href, pathname)
</script>

<div class:workspace--threat={threatTheme} class="admin-workspace">
  <nav class="admin-topbar sticky top-0 z-40">
    <div class="admin-topbar-shell mx-auto w-full max-w-[110rem] px-4 sm:px-6">
      <div class="admin-topbar-main">
        <div class="admin-topbar-brand-row">
          <a href={defaultRoute} class="admin-brand shrink-0">
            {t("common.appName")}
          </a>

          {#if workspaceShortcuts.length > 0}
            <div class="admin-topbar-shortcuts hidden items-end gap-6 lg:flex">
              {#each workspaceShortcuts as shortcut}
                <a
                  href={shortcut.href}
                  class:admin-scope-tab--active={isShortcutActive(
                    shortcut.itemIds,
                    $page.url.pathname,
                  )}
                  class="admin-scope-tab"
                >
                  {shortcut.label}
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <div class="admin-topbar-actions">
          <span class="admin-env-pill">{isDev ? "DEV" : "PROD"}</span>

          <div class="admin-topbar-icon-group">
            <button
              aria-label="Notifications"
              class="admin-topbar-icon"
              type="button"
            >
              <span class="material-symbols-outlined">notifications</span>
            </button>
            <button
              aria-label="Settings"
              class="admin-topbar-icon"
              type="button"
            >
              <span class="material-symbols-outlined">settings</span>
            </button>
          </div>

          <div class="hidden items-center gap-3 xl:flex">
            <span class="max-w-[14rem] truncate text-sm text-white/68"
              >{adminEmail}</span
            >
            <LocaleSwitcher />
            <a
              href="/logout"
              class="btn btn-ghost btn-sm border border-white/10 text-white/82 hover:text-white"
            >
              {t("common.signOut")}
            </a>
          </div>

          <div
            class="admin-topbar-avatar flex h-9 w-9 items-center justify-center rounded-md border border-white/12 bg-white/5 font-mono text-sm font-semibold text-white/85"
          >
            {operatorInitial}
          </div>
        </div>
      </div>

      {#if workspaceShortcuts.length > 0}
        <div class="admin-topbar-shortcuts-mobile lg:hidden">
          {#each workspaceShortcuts as shortcut}
            <a
              href={shortcut.href}
              class:admin-scope-tab--active={isShortcutActive(
                shortcut.itemIds,
                $page.url.pathname,
              )}
              class="admin-scope-tab"
            >
              {shortcut.label}
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </nav>

  <div
    class="mx-auto flex w-full max-w-[110rem] gap-5 px-4 py-5 sm:px-6 lg:py-7"
  >
    <aside class="hidden w-[15.5rem] shrink-0 lg:block">
      <div
        class="admin-sidebar-shell sticky top-[5.5rem] flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-[1rem]"
      >
        <div class="px-6 py-6">
          <div class="mb-4 flex items-start gap-3.5">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-black/5 font-mono text-[0.82rem] font-semibold text-[var(--admin-muted)]"
            >
              {operatorInitial}
            </div>
            <div class="min-w-0">
              <p class="admin-sidebar-title text-[var(--admin-ink)]">
                System Engine
              </p>
              <p class="admin-sidebar-tier">Terminal Tier 01</p>
            </div>
          </div>

          <div class="admin-mfa-badge">
            <span class="material-symbols-outlined">verified</span>
            <span>MFA Verified</span>
          </div>

          <div class="mt-5 border-t border-[var(--admin-sidebar-edge)] pt-4">
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-muted-soft)]"
            >
              {t(scopeTitleKeys[adminScope])}
            </p>
            <p class="mt-2 text-sm leading-6 text-[var(--admin-muted)]">
              {t(scopeDescriptionKeys[adminScope])}
            </p>
          </div>
        </div>

        <nav class="flex-1 space-y-4 px-4 pb-6">
          {#each navGroups as group}
            <div class="space-y-1">
              {#each group.items as item}
                {@const active = isActive(item.href, $page.url.pathname)}
                <a
                  href={item.href}
                  class:admin-nav-link--active={active}
                  class="admin-nav-link"
                  aria-current={active ? "page" : undefined}
                >
                  <span class="material-symbols-outlined"
                    >{navItemIcons[item.id]}</span
                  >
                  <span class="admin-nav-link-label">{t(item.labelKey)}</span>
                  {#if item.id === "config"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {configDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "providers"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {providersDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "prizes"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {prizesDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "changeRequests"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {changeRequestsDrawerOpen
                        ? "expand_more"
                        : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "finance"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {financeDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "economy"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {economyDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "markets"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {marketsDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "tables"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {tablesDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "missions"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {missionsDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "saas"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {saasDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "security"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {securityDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "audit"}
                    <span
                      class="ml-auto material-symbols-outlined text-[0.95rem] text-[var(--admin-muted-soft)]"
                    >
                      {auditDrawerOpen ? "expand_more" : "chevron_right"}
                    </span>
                  {/if}
                  {#if item.id === "reconciliation" && unresolvedCount > 0}
                    <span
                      class="ml-auto inline-flex h-2.5 w-2.5 rounded-full bg-[var(--admin-danger)]"
                    ></span>
                  {/if}
                </a>

                {#if item.id === "config" && configDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each configDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isConfigDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isConfigDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "providers" && providersDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each providersDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isProvidersDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isProvidersDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "prizes" && prizesDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each prizesDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isPrizesDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isPrizesDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "changeRequests" && changeRequestsDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each changeRequestsDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isChangeRequestsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isChangeRequestsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "finance" && financeDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each financeDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isFinanceDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isFinanceDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "economy" && economyDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each economyDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isEconomyDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isEconomyDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "markets" && marketsDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each marketsDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isMarketsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isMarketsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "tables" && tablesDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each tablesDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isTablesDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isTablesDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "missions" && missionsDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each missionsDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isMissionsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isMissionsDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "saas" && saasDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each saasDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isSaasDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isSaasDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "security" && securityDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each securityDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isSecurityDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isSecurityDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if item.id === "audit" && auditDrawerOpen}
                  <div class="admin-nav-drawer">
                    {#each auditDrawerItems as drawerItem}
                      <a
                        href={drawerItem.href}
                        class:admin-nav-sublink--active={isAuditDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )}
                        class="admin-nav-sublink"
                        aria-current={isAuditDrawerItemActive(
                          drawerItem.href,
                          $page.url.pathname,
                        )
                          ? "page"
                          : undefined}
                      >
                        {drawerItem.label}
                      </a>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {/each}
        </nav>

        <div class="admin-sidebar-meta mt-auto px-6 py-5">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--admin-muted-soft)]"
          >
            Status
          </p>
          <div
            class="mt-3 flex items-center gap-2 text-sm font-medium text-[var(--admin-ink)]"
          >
            <span
              class="inline-flex h-2 w-2 rounded-full bg-[var(--admin-success)]"
            ></span>
            <span>MFA Verified</span>
          </div>

          <div class="mt-5 grid gap-2.5 text-sm text-[var(--admin-muted)]">
            <a
              class="inline-flex items-center gap-2 transition hover:text-[var(--admin-ink)]"
              href={defaultRoute}
            >
              <span class="material-symbols-outlined">help</span>
              <span>Help</span>
            </a>
            <a
              class="inline-flex items-center gap-2 transition hover:text-[var(--admin-ink)]"
              href={defaultRoute}
            >
              <span class="material-symbols-outlined">description</span>
              <span>Docs</span>
            </a>
          </div>
        </div>
      </div>
    </aside>

    <main class="admin-content min-w-0 flex-1 pb-10">
      {@render children?.()}
    </main>
  </div>
</div>
