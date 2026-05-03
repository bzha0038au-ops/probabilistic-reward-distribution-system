<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/tables", label: "Tables Hub" },
    { href: "/tables/ledger", label: "Ledger" },
    { href: "/tables/interventions", label: "Interventions" },
    { href: "/tables/runtime", label: "Runtime" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/tables"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Table modules" class="admin-subnav mt-6">
  {#each tabs as tab}
    <a
      href={tab.href}
      class:admin-subnav-link--active={isActive(tab.href, $page.url.pathname)}
      class="admin-subnav-link"
      aria-current={isActive(tab.href, $page.url.pathname) ? "page" : undefined}
    >
      {tab.label}
    </a>
  {/each}
</nav>
