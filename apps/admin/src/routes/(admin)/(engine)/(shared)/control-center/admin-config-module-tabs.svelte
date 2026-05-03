<script lang="ts">
  import { page } from "$app/stores"

  const tabs = [
    { href: "/config", label: "Config Hub" },
    { href: "/config/high-risk-controls", label: "高风险配置控制面" },
    { href: "/config/blackjack-rules", label: "Blackjack 规则" },
    { href: "/config/legacy-bonus-release", label: "Legacy Bonus Release" },
    { href: "/config/operator-security", label: "Operator MFA" },
  ] as const

  const isActive = (href: string, pathname: string) =>
    href === "/config"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="Config modules" class="admin-subnav mt-6">
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
