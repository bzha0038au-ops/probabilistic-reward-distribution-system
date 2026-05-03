<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/audit", label: "Audit Hub" },
    { href: "/audit/queue", label: "Queue" },
    { href: "/audit/context", label: "Context" },
    { href: "/audit/filters", label: "Filters" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/audit"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Audit modules" class="admin-subnav mt-6">
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
