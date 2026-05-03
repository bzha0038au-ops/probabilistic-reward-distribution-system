<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/providers", label: "Provider Hub" },
    { href: "/providers/drafts", label: "Drafts" },
    { href: "/providers/fleet", label: "Fleet" },
    { href: "/providers/controls", label: "Controls" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/providers"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Provider modules" class="admin-subnav mt-6">
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
