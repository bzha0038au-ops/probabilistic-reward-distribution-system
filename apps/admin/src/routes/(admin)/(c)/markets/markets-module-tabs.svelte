<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/markets", label: "Markets Hub" },
    { href: "/markets/appeals", label: "Appeals" },
    { href: "/markets/registry", label: "Registry" },
    { href: "/markets/creation", label: "Creation" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/markets"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Market modules" class="admin-subnav mt-6">
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
