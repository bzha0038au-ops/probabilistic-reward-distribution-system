<script lang="ts">
  import { page } from "$app/stores"

  let { tenantSlug }: { tenantSlug: string } = $props()

  const tabs = $derived([
    { href: `/saas/${tenantSlug}/usage`, label: "Usage Hub" },
    { href: `/saas/${tenantSlug}/usage/overview`, label: "Overview" },
    { href: `/saas/${tenantSlug}/usage/distribution`, label: "Distribution" },
    { href: `/saas/${tenantSlug}/usage/thresholds`, label: "Thresholds" },
  ])

  const isActive = (href: string, pathname: string) =>
    href === `/saas/${tenantSlug}/usage`
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Tenant usage modules" class="admin-subnav mt-6">
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
