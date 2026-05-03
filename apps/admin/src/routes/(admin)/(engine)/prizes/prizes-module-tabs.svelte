<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/prizes", label: "Prize Hub" },
    { href: "/prizes/registry", label: "Registry" },
    { href: "/prizes/management", label: "Management" },
    { href: "/prizes/controls", label: "Controls" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/prizes"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Prize modules" class="admin-subnav mt-6">
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
