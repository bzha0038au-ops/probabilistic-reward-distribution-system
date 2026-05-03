<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/saas", label: "SaaS Hub" },
    { href: "/saas/tenants", label: "Tenants" },
    { href: "/saas/projects", label: "Projects" },
    { href: "/saas/billing", label: "Billing" },
    { href: "/saas/webhooks", label: "Webhooks" },
    { href: "/saas/disputes", label: "Disputes" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/saas"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="SaaS modules" class="admin-subnav mt-6">
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
