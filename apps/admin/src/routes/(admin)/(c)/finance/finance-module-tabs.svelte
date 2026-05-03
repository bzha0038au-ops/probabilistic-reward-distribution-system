<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/finance", label: "Finance Hub" },
    { href: "/finance/deposits", label: "Deposits" },
    { href: "/finance/withdrawals", label: "Withdrawals" },
    { href: "/finance/crypto-channels", label: "Crypto Channels" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/finance"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Finance modules" class="admin-subnav mt-6">
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
