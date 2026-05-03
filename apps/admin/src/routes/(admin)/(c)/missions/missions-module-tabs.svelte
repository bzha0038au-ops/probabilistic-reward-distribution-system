<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/missions", label: "Missions Hub" },
    { href: "/missions/registry", label: "Registry" },
    { href: "/missions/management", label: "Management" },
    { href: "/missions/authoring", label: "Authoring" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/missions"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Mission modules" class="admin-subnav mt-6">
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
