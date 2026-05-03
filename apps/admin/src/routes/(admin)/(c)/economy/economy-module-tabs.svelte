<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/economy", label: "Economy Hub" },
    { href: "/economy/assets", label: "Assets" },
    { href: "/economy/orders", label: "Orders" },
    { href: "/economy/controls", label: "Controls" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/economy"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Economy modules" class="admin-subnav mt-6">
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
