<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/security", label: "Security Hub" },
    { href: "/security/signals", label: "Signals" },
    { href: "/security/freezes", label: "Freezes" },
    { href: "/security/jurisdiction", label: "Jurisdiction" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/security"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Security modules" class="admin-subnav mt-6">
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
