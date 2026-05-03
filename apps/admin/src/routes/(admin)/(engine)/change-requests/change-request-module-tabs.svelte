<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/change-requests", label: "Change Hub" },
    { href: "/change-requests/drafts", label: "Drafts" },
    { href: "/change-requests/review", label: "Review" },
    { href: "/change-requests/release", label: "Release" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/change-requests"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Change request modules" class="admin-subnav mt-6">
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
