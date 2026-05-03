<script lang="ts">
  import { page } from "$app/stores"

  let { profileId }: { profileId: number } = $props()

  const tabs = $derived([
    { href: `/kyc/${profileId}`, label: "KYC Hub" },
    { href: `/kyc/${profileId}/overview`, label: "Overview" },
    { href: `/kyc/${profileId}/documents`, label: "Documents" },
    { href: `/kyc/${profileId}/decision`, label: "Decision" },
  ])

  const isActive = (href: string, pathname: string) =>
    href === `/kyc/${profileId}`
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
</script>

<nav aria-label="KYC detail modules" class="admin-subnav mt-6">
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
