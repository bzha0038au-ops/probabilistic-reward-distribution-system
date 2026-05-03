<script lang="ts">
  import { page } from "$app/stores"

  let { userId }: { userId: number } = $props()

  const tabs = $derived([
    { href: `/users/${userId}`, label: "User Hub" },
    { href: `/users/${userId}/identity`, label: "Identity" },
    { href: `/users/${userId}/wallet`, label: "Wallet" },
    { href: `/users/${userId}/governance`, label: "Governance" },
    { href: `/users/${userId}/associations`, label: "Associations" },
  ])

  const isActive = (href: string, pathname: string) =>
    href === `/users/${userId}`
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="User detail modules" class="admin-subnav mt-6">
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
