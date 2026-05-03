<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import type { PageData } from "./page-support"
  import UserDetailModuleTabs from "./user-detail-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let freezeCategory = $state("risk")
  let freezeReason = $state("manual_admin")
  let freezeScope = $state("account_lock")

  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)
  const activeScopeCount = $derived(data.detail?.user.activeScopes.length ?? 0)
  const freezeRecordCount = $derived(data.detail?.freezes.length ?? 0)
  const loginSignalCount = $derived(data.detail?.recentLoginIps.length ?? 0)
  const verifiedChannelCount = $derived(
    (data.detail?.user.emailVerifiedAt ? 1 : 0) +
      (data.detail?.user.phoneVerifiedAt ? 1 : 0),
  )

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
  }

  const formatScope = (scope: string) =>
    ({
      account_lock: t("users.scope.account"),
      gameplay_lock: t("users.scope.gameplay"),
      topup_lock: t("users.scope.topup"),
      withdrawal_lock: t("users.scope.withdrawal"),
    })[scope] ?? scope

  const formatCategory = (category: string) =>
    ({
      risk: t("users.category.risk"),
      community: t("users.category.community"),
      compliance: t("users.category.compliance"),
      security: t("users.category.security"),
      support: t("users.category.support"),
      operations: t("users.category.operations"),
    })[category] ?? category

  const formatReason = (reason: string) =>
    ({
      account_lock: t("users.reason.accountLock"),
      withdrawal_lock: t("users.reason.withdrawalLock"),
      gameplay_lock: t("users.reason.gameplayLock"),
      pending_kyc: t("users.reason.pendingKyc"),
      aml_review: t("users.reason.amlReview"),
      auth_failure: t("users.reason.authFailure"),
      manual_admin: t("users.reason.manualAdmin"),
      forum_moderation: t("users.reason.forumModeration"),
      jurisdiction_restriction: t("users.reason.jurisdictionRestriction"),
      underage_restriction: t("users.reason.underageRestriction"),
    })[reason] ?? reason

  const formatKycTier = (tier: string) =>
    ({
      tier_0: t("users.kyc.tier0"),
      tier_1: t("users.kyc.tier1"),
      tier_2: t("users.kyc.tier2"),
    })[tier] ?? tier

  const formatCountryTier = (tier: string) =>
    ({
      blocked: t("security.jurisdiction.tiers.blocked"),
      restricted: t("security.jurisdiction.tiers.restricted"),
      full: t("security.jurisdiction.tiers.full"),
      unknown: "-",
    })[tier] ?? tier

  const formatJurisdictionFeature = (value: string) =>
    ({
      real_money_gameplay: t(
        "security.jurisdiction.features.realMoneyGameplay",
      ),
      topup: t("security.jurisdiction.features.topup"),
      withdrawal: t("security.jurisdiction.features.withdrawal"),
    })[value] ?? value

  const formatFlag = (value: string) => value.replaceAll("_", " ")
  const activeModule = $derived.by(() => {
    if ($page.url.pathname.endsWith("/identity")) return "identity"
    if ($page.url.pathname.endsWith("/wallet")) return "wallet"
    if ($page.url.pathname.endsWith("/governance")) return "governance"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isIdentityModule = $derived(activeModule === "identity")
  const isWalletModule = $derived(activeModule === "wallet")
  const isGovernanceModule = $derived(activeModule === "governance")
  const latestPayment = $derived(data.detail?.recentPayments[0] ?? null)
  const latestDraw = $derived(data.detail?.recentDraws[0] ?? null)
  const userModules = $derived.by(() => {
    if (!data.detail) return []

    return [
      {
        href: `/users/${data.detail.user.id}/identity`,
        eyebrow: "Identity Dossier",
        title: "Identity",
        description:
          "身份、KYC、司法辖区和最近 access events 单独成页，避免和钱包控制混排。",
        badge: `${verifiedChannelCount}/2`,
      },
      {
        href: `/users/${data.detail.user.id}/wallet`,
        eyebrow: "Wallet Ledger",
        title: "Wallet",
        description:
          "余额、draw activity 和 payment activity 拆进资金视图，便于只做财务审阅。",
        badge: `${data.detail.recentPayments.length}`,
      },
      {
        href: `/users/${data.detail.user.id}/governance`,
        eyebrow: "Command Rail",
        title: "Governance",
        description:
          "冻结、解冻、强制登出和密码重置集中在同一个 operator 控制面。",
        badge: `${activeScopeCount}`,
      },
      {
        href: `/users/${data.detail.user.id}/associations`,
        eyebrow: "Risk Graph",
        title: "Associations",
        description:
          "设备、IP 和 payout overlap 保持独立的关联图谱工作台，不再挤在用户主记录页。",
        badge: "graph",
      },
    ]
  })
</script>

<div class="space-y-6">
  <a
    href="/users"
    class="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] transition hover:text-[var(--admin-ink)]"
  >
    <span class="material-symbols-outlined text-sm">arrow_back</span>
    <span>{t("users.backToSearch")}</span>
  </a>

  {#if data.detail}
    {@const user = data.detail.user}

    {#snippet userDetailActions()}
      <div class="admin-header-action-cluster">
        <span class="badge badge-outline">{formatKycTier(user.kycTier)}</span>
        {#if activeScopeCount === 0}
          <span class="badge badge-success badge-outline">
            {t("users.status.noFreeze")}
          </span>
        {:else}
          <span class="badge badge-warning badge-outline">
            {activeScopeCount} active scopes
          </span>
        {/if}
        {#if user.kycProfileId}
          <a class="btn btn-outline btn-sm" href={`/kyc/${user.kycProfileId}`}>
            {t("users.actions.openKycProfile")}
          </a>
        {/if}
        <a
          class="btn btn-outline btn-sm"
          href={`/users/${user.id}/associations`}
        >
          Association Graph
        </a>
      </div>
    {/snippet}

    <AdminPageHeader
      context="Workspace · userInvestigation"
      eyebrow="Users"
      title={`User #${user.id}`}
      description={`${t("users.detail.description")} · ${user.email}`}
      actions={userDetailActions}
    />

    <UserDetailModuleTabs userId={user.id} />
  {:else}
    <AdminPageHeader
      context="Workspace · userInvestigation"
      eyebrow="Users"
      title={t("users.detail.title")}
      description={t("users.detail.description")}
    />
  {/if}

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if actionMessage}
    <div class="alert alert-success text-sm">
      <span>{actionMessage}</span>
    </div>
  {/if}

  {#if data.detail}
    {@const user = data.detail.user}
    {@const wallet = data.detail.wallet}

    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Identity Status
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {formatKycTier(user.kycTier)}
            </p>
            <span class="badge badge-outline"
              >{verifiedChannelCount}/2 verified</span
            >
          </div>
          <p class="text-sm text-slate-500">
            {user.emailVerifiedAt || user.phoneVerifiedAt
              ? "At least one trusted contact channel is confirmed."
              : "No verified contact channel is currently on file."}
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Active Scopes
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {activeScopeCount}
            </p>
            <span class="badge badge-outline">gated</span>
          </div>
          <p class="text-sm text-slate-500">
            Freeze scopes currently affecting account, gameplay, top-up, or
            withdrawal actions.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Withdrawable
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {wallet.withdrawableBalance}
            </p>
            <span class="badge badge-outline">wallet</span>
          </div>
          <p class="text-sm text-slate-500">
            Current withdrawable balance with locked and bonus balances broken
            out below.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Login Signals
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {loginSignalCount}
            </p>
            <span class="badge badge-outline">{freezeRecordCount} records</span>
          </div>
          <p class="text-sm text-slate-500">
            Recent auth events and freeze history available for operator review.
          </p>
        </div>
      </article>
    </section>

    {#if isHubModule}
      <section class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              User Drawer
            </p>
            <h2
              class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
            >
              分域操作入口
            </h2>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            用户主记录页现在只保留摘要和模块入口。进入具体模块，再分别处理
            identity、wallet、governance 和 associations。
          </p>

          <div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {#each userModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]">
                    arrow_forward
                  </span>
                </div>
              </a>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    {#if isIdentityModule || isWalletModule || isGovernanceModule}
      <section
        class="grid gap-6 2xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]"
      >
        <div class="admin-main--after-rail-2xl min-w-0 space-y-6">
          {#if isIdentityModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div
                  class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Identity Dossier
                    </p>
                    <h2 class="card-title mt-2">{t("users.detail.title")}</h2>
                    <p class="text-sm text-slate-500">
                      Consolidated identity, jurisdiction, and verification
                      state for the selected account.
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    {#if user.emailVerifiedAt}
                      <span class="badge badge-outline">
                        {t("users.status.emailVerified")}
                      </span>
                    {/if}
                    {#if user.phoneVerifiedAt}
                      <span class="badge badge-outline">
                        {t("users.status.phoneVerified")}
                      </span>
                    {/if}
                    {#if formatCountryTier(user.countryTier) !== "-"}
                      <span class="badge badge-outline">
                        {formatCountryTier(user.countryTier)}
                      </span>
                    {/if}
                  </div>
                </div>

                <div class="grid gap-4 lg:grid-cols-2">
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Core Record
                    </p>
                    <dl class="mt-4 space-y-3 text-sm text-slate-700">
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.table.user")}</dt>
                        <dd class="font-mono text-xs text-right">#{user.id}</dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>Email</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.email}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>Phone</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.phone ?? "-"}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.createdAt")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {formatDate(user.createdAt)}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.updatedAt")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {formatDate(user.updatedAt)}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.userPoolBalance")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.userPoolBalance}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.pityStreak")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.pityStreak}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Identity Profile
                    </p>
                    <dl class="mt-4 space-y-3 text-sm text-slate-700">
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.birthDate")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.birthDate ?? "-"}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.registrationCountry")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.registrationCountryCode ?? "-"}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.countryResolvedAt")}</dt>
                        <dd class="font-mono text-xs text-right">
                          {formatDate(user.countryResolvedAt)}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.emailStatus")}</dt>
                        <dd class="text-right">
                          {user.emailVerifiedAt
                            ? `${t("users.status.emailVerified")} · ${formatDate(user.emailVerifiedAt)}`
                            : t("users.status.unverified")}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.phoneStatus")}</dt>
                        <dd class="text-right">
                          {user.phoneVerifiedAt
                            ? `${t("users.status.phoneVerified")} · ${formatDate(user.phoneVerifiedAt)}`
                            : t("users.status.unverified")}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>KYC Source</dt>
                        <dd class="font-mono text-xs text-right">
                          {formatFlag(user.kycTierSource)}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>Role</dt>
                        <dd class="font-mono text-xs text-right">
                          {user.role}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div class="grid gap-4 xl:grid-cols-2">
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Jurisdiction Engine
                    </p>
                    <dl class="mt-4 space-y-3 text-sm text-slate-700">
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.countryTier")}</dt>
                        <dd>
                          {formatCountryTier(user.jurisdiction.countryTier)}
                        </dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("security.jurisdiction.minimumAge")}</dt>
                        <dd>{user.jurisdiction.minimumAge}</dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>{t("users.profile.age")}</dt>
                        <dd>{user.jurisdiction.userAge ?? "-"}</dd>
                      </div>
                      <div class="flex items-start justify-between gap-4">
                        <dt>Eligibility</dt>
                        <dd>
                          {user.jurisdiction.isOfAge ? "of age" : "restricted"}
                        </dd>
                      </div>
                    </dl>
                    <div class="mt-4 space-y-3">
                      <div>
                        <p
                          class="text-xs uppercase tracking-[0.18em] text-slate-500"
                        >
                          {t("security.jurisdiction.allowedFeatures")}
                        </p>
                        <p class="mt-2 text-sm text-slate-700">
                          {user.jurisdiction.allowedFeatures.length === 0
                            ? t("security.jurisdiction.noFeatures")
                            : user.jurisdiction.allowedFeatures
                                .map((feature) =>
                                  formatJurisdictionFeature(feature),
                                )
                                .join(", ")}
                        </p>
                      </div>
                      <div>
                        <p
                          class="text-xs uppercase tracking-[0.18em] text-slate-500"
                        >
                          Blocked Scopes
                        </p>
                        <p class="mt-2 text-sm text-slate-700">
                          {user.jurisdiction.blockedScopes.length === 0
                            ? "-"
                            : user.jurisdiction.blockedScopes
                                .map((scope) => formatScope(scope))
                                .join(", ")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Restriction Notes
                    </p>
                    <div class="mt-4 space-y-3">
                      <div class="rounded-[0.85rem] bg-base-100 p-4">
                        <p
                          class="text-xs uppercase tracking-[0.18em] text-slate-500"
                        >
                          Restriction Reasons
                        </p>
                        <div class="mt-3 flex flex-wrap gap-2">
                          {#if user.jurisdiction.restrictionReasons.length === 0}
                            <span class="text-sm text-slate-500"
                              >None recorded.</span
                            >
                          {:else}
                            {#each user.jurisdiction.restrictionReasons as reason}
                              <span class="badge badge-outline"
                                >{formatFlag(reason)}</span
                              >
                            {/each}
                          {/if}
                        </div>
                      </div>
                      <div class="rounded-[0.85rem] bg-base-100 p-4">
                        <p
                          class="text-xs uppercase tracking-[0.18em] text-slate-500"
                        >
                          Last Activity
                        </p>
                        <dl class="mt-3 space-y-2 text-sm text-slate-700">
                          <div class="flex items-start justify-between gap-4">
                            <dt>Last draw</dt>
                            <dd class="font-mono text-xs text-right">
                              {formatDate(user.lastDrawAt)}
                            </dd>
                          </div>
                          <div class="flex items-start justify-between gap-4">
                            <dt>Last win</dt>
                            <dd class="font-mono text-xs text-right">
                              {formatDate(user.lastWinAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          {#if isWalletModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div
                  class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Wallet Ledger
                    </p>
                    <h2 class="card-title mt-2">{t("users.wallet.title")}</h2>
                    <p class="text-sm text-slate-500">
                      {t("users.wallet.description")}
                    </p>
                  </div>
                  <p class="font-mono text-xs text-slate-500">
                    {t("users.wallet.updatedAt")}: {formatDate(
                      wallet.updatedAt,
                    )}
                  </p>
                </div>

                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("users.wallet.withdrawable")}
                    </p>
                    <p
                      class="mt-3 font-[Newsreader] text-3xl text-[var(--admin-ink)]"
                    >
                      {wallet.withdrawableBalance}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("users.wallet.bonus")}
                    </p>
                    <p
                      class="mt-3 font-[Newsreader] text-3xl text-[var(--admin-ink)]"
                    >
                      {wallet.bonusBalance}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("users.wallet.locked")}
                    </p>
                    <p
                      class="mt-3 font-[Newsreader] text-3xl text-[var(--admin-ink)]"
                    >
                      {wallet.lockedBalance}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.18em] text-slate-500"
                    >
                      {t("users.wallet.wagered")}
                    </p>
                    <p
                      class="mt-3 font-[Newsreader] text-3xl text-[var(--admin-ink)]"
                    >
                      {wallet.wageredAmount}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          {#if isGovernanceModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-5">
                <div
                  class="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Governance Ledger
                    </p>
                    <h2 class="card-title mt-2">
                      {t("users.freeze.recordsTitle")}
                    </h2>
                    <p class="text-sm text-slate-500">
                      {t("users.freeze.recordsDescription")}
                    </p>
                  </div>
                  <span class="badge badge-outline"
                    >{freezeRecordCount} entries</span
                  >
                </div>

                {#if data.detail.freezes.length === 0}
                  <div class="admin-empty-state p-5 text-sm">
                    No freeze records are currently on file for this user.
                  </div>
                {:else}
                  <div
                    class="admin-table-scroll overflow-x-auto rounded-[1rem] border border-[var(--admin-border)]"
                  >
                    <table class="table admin-table-compact">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>{t("users.freeze.category")}</th>
                          <th>{t("users.freeze.reason")}</th>
                          <th>{t("users.freeze.scope")}</th>
                          <th>{t("users.freeze.status")}</th>
                          <th>{t("users.freeze.createdAt")}</th>
                          <th>{t("users.freeze.releasedAt")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each data.detail.freezes as record}
                          <tr
                            style={!record.releasedAt &&
                            record.status.toLowerCase() !== "released"
                              ? "background: var(--admin-warning-soft);"
                              : undefined}
                          >
                            <td class="font-mono text-xs">#{record.id}</td>
                            <td>{formatCategory(record.category)}</td>
                            <td>{formatReason(record.reason)}</td>
                            <td>{formatScope(record.scope)}</td>
                            <td>{formatFlag(record.status)}</td>
                            <td class="font-mono text-xs">
                              {formatDate(record.createdAt)}
                            </td>
                            <td class="font-mono text-xs">
                              {formatDate(record.releasedAt)}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
              </div>
            </section>
          {/if}

          {#if isIdentityModule}
            <section class="grid gap-6 xl:grid-cols-1">
              <article class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Access Events
                    </p>
                    <h2 class="card-title mt-2">
                      {t("users.activity.loginsTitle")}
                    </h2>
                    <p class="text-sm text-slate-500">
                      {t("users.activity.loginsDescription")}
                    </p>
                  </div>
                  <div class="space-y-3">
                    {#if data.detail.recentLoginIps.length === 0}
                      <p class="text-sm text-slate-500">
                        {t("users.activity.empty")}
                      </p>
                    {:else}
                      {#each data.detail.recentLoginIps as login}
                        <div
                          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="font-medium text-base-content">
                                {login.ip ?? "-"}
                              </p>
                              <p class="text-sm text-slate-600">
                                {formatFlag(login.eventType)}
                              </p>
                            </div>
                            <span class="font-mono text-xs text-slate-500">
                              {formatDate(login.createdAt)}
                            </span>
                          </div>
                          <p
                            class="mt-3 break-all font-mono text-xs text-slate-500"
                          >
                            {login.userAgent ?? "-"}
                          </p>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              </article>
            </section>
          {/if}

          {#if isWalletModule}
            <section class="grid gap-6 xl:grid-cols-2">
              <article class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Reward Activity
                    </p>
                    <h2 class="card-title mt-2">
                      {t("users.activity.drawsTitle")}
                    </h2>
                    <p class="text-sm text-slate-500">
                      {t("users.activity.drawsDescription")}
                    </p>
                  </div>
                  <div class="space-y-3">
                    {#if data.detail.recentDraws.length === 0}
                      <p class="text-sm text-slate-500">
                        {t("users.activity.empty")}
                      </p>
                    {:else}
                      {#each data.detail.recentDraws as draw}
                        <div
                          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="font-medium text-base-content">
                                #{draw.id}
                              </p>
                              <p class="text-sm text-slate-600">
                                {draw.prizeName ?? t("users.activity.noPrize")}
                              </p>
                            </div>
                            <span class="badge badge-outline"
                              >{draw.status}</span
                            >
                          </div>
                          <dl class="mt-3 space-y-2 text-sm text-slate-600">
                            <div class="flex items-start justify-between gap-4">
                              <dt>{t("users.activity.drawCost")}</dt>
                              <dd class="font-mono text-xs">{draw.drawCost}</dd>
                            </div>
                            <div class="flex items-start justify-between gap-4">
                              <dt>{t("users.activity.rewardAmount")}</dt>
                              <dd class="font-mono text-xs">
                                {draw.rewardAmount}
                              </dd>
                            </div>
                            <div class="flex items-start justify-between gap-4">
                              <dt>Created</dt>
                              <dd class="font-mono text-xs">
                                {formatDate(draw.createdAt)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              </article>

              <article class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                  <div>
                    <p
                      class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                    >
                      Payment Activity
                    </p>
                    <h2 class="card-title mt-2">
                      {t("users.activity.paymentsTitle")}
                    </h2>
                    <p class="text-sm text-slate-500">
                      {t("users.activity.paymentsDescription")}
                    </p>
                  </div>
                  <div class="space-y-3">
                    {#if data.detail.recentPayments.length === 0}
                      <p class="text-sm text-slate-500">
                        {t("users.activity.empty")}
                      </p>
                    {:else}
                      {#each data.detail.recentPayments as payment}
                        <div
                          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="font-medium text-base-content">
                                {payment.flow === "deposit"
                                  ? t("users.activity.deposit")
                                  : t("users.activity.withdrawal")}
                                #{payment.id}
                              </p>
                              <p class="font-mono text-xs text-slate-600">
                                {payment.amount}
                              </p>
                            </div>
                            <span class="badge badge-outline"
                              >{payment.status}</span
                            >
                          </div>
                          <dl class="mt-3 space-y-2 text-sm text-slate-600">
                            <div class="flex items-start justify-between gap-4">
                              <dt>Channel</dt>
                              <dd class="text-right">
                                {payment.channelType} / {payment.assetCode ??
                                  payment.assetType}
                              </dd>
                            </div>
                            <div class="flex items-start justify-between gap-4">
                              <dt>Network</dt>
                              <dd class="text-right">
                                {payment.network ?? "-"}
                              </dd>
                            </div>
                            <div class="flex items-start justify-between gap-4">
                              <dt>Created</dt>
                              <dd class="font-mono text-xs">
                                {formatDate(payment.createdAt)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              </article>
            </section>
          {/if}
        </div>

        <aside
          class="admin-rail admin-rail--early-2xl space-y-6 2xl:sticky 2xl:top-24 2xl:self-start"
        >
          {#if isIdentityModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Verification Snapshot
                  </p>
                  <h2 class="card-title mt-2">Trusted Channels</h2>
                  <p class="text-sm text-slate-500">
                    Review confirmed contact paths and KYC state without opening
                    governance controls.
                  </p>
                </div>

                <div class="admin-rail-panel">
                  <dl class="admin-data-list text-sm text-slate-600">
                    <div class="admin-data-row">
                      <dt>KYC tier</dt>
                      <dd class="admin-data-value">
                        {formatKycTier(user.kycTier)}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Email</dt>
                      <dd class="admin-data-value">
                        {user.emailVerifiedAt ? "verified" : "unverified"}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Phone</dt>
                      <dd class="admin-data-value">
                        {user.phoneVerifiedAt ? "verified" : "unverified"}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Role</dt>
                      <dd class="admin-data-value font-mono text-xs">
                        {user.role}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div class="admin-rail-panel">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Jurisdiction Snapshot
                  </p>
                  <div class="mt-3 space-y-2 text-sm text-slate-600">
                    <p>{formatCountryTier(user.jurisdiction.countryTier)}</p>
                    <p>Minimum age: {user.jurisdiction.minimumAge}</p>
                    <p>User age: {user.jurisdiction.userAge ?? "-"}</p>
                    <p>
                      {user.jurisdiction.allowedFeatures.length === 0
                        ? t("security.jurisdiction.noFeatures")
                        : user.jurisdiction.allowedFeatures
                            .map((feature) =>
                              formatJurisdictionFeature(feature),
                            )
                            .join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          {#if isWalletModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Balance Snapshot
                  </p>
                  <h2 class="card-title mt-2">Wallet Context</h2>
                  <p class="text-sm text-slate-500">
                    Keep top-line balances and latest movement in one narrow
                    operator rail.
                  </p>
                </div>

                <div class="admin-rail-panel">
                  <dl class="admin-data-list text-sm text-slate-600">
                    <div class="admin-data-row">
                      <dt>Withdrawable</dt>
                      <dd class="admin-data-value font-mono text-xs">
                        {wallet.withdrawableBalance}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Bonus</dt>
                      <dd class="admin-data-value font-mono text-xs">
                        {wallet.bonusBalance}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Locked</dt>
                      <dd class="admin-data-value font-mono text-xs">
                        {wallet.lockedBalance}
                      </dd>
                    </div>
                    <div class="admin-data-row">
                      <dt>Updated</dt>
                      <dd class="admin-data-value font-mono text-xs">
                        {formatDate(wallet.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div class="admin-rail-panel">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Recent Activity
                  </p>
                  <div class="mt-3 space-y-3 text-sm text-slate-600">
                    <div>
                      <p class="font-medium text-[var(--admin-ink)]">
                        Latest draw
                      </p>
                      <p class="font-mono text-xs">
                        {latestDraw
                          ? `#${latestDraw.id} · ${latestDraw.rewardAmount}`
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p class="font-medium text-[var(--admin-ink)]">
                        Latest payment
                      </p>
                      <p class="font-mono text-xs">
                        {latestPayment
                          ? `${latestPayment.flow} #${latestPayment.id} · ${latestPayment.amount}`
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          {#if isGovernanceModule}
            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Operator Verification
                  </p>
                  <h2 class="card-title mt-2">{t("users.freeze.title")}</h2>
                  <p class="text-sm text-slate-500">
                    Enter step-up verification before issuing any account
                    command.
                  </p>
                </div>

                <label class="form-control">
                  <span class="label-text mb-2">{t("common.totpCode")}</span>
                  <input
                    class="input input-bordered"
                    bind:value={stepUpCode}
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    placeholder={t("users.freeze.stepUpPlaceholder")}
                  />
                </label>

                <div class="admin-rail-panel text-sm text-slate-600">
                  Review KYC tier, jurisdiction state, and active scopes
                  together before applying any freeze or session control.
                </div>
              </div>
            </section>

            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Governance Desk
                  </p>
                  <h2 class="card-title mt-2">{t("users.actions.freeze")}</h2>
                  <p class="text-sm text-slate-500">
                    Add a new scoped restriction with explicit category and
                    reason.
                  </p>
                </div>

                <form method="post" action="?/freezeScope" class="space-y-4">
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{t("users.freeze.category")}</span
                    >
                    <select
                      class="select select-bordered"
                      name="category"
                      bind:value={freezeCategory}
                    >
                      <option value="risk">{t("users.category.risk")}</option>
                      <option value="community"
                        >{t("users.category.community")}</option
                      >
                      <option value="compliance">
                        {t("users.category.compliance")}
                      </option>
                      <option value="security"
                        >{t("users.category.security")}</option
                      >
                      <option value="support"
                        >{t("users.category.support")}</option
                      >
                      <option value="operations"
                        >{t("users.category.operations")}</option
                      >
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{t("users.freeze.reason")}</span
                    >
                    <select
                      class="select select-bordered"
                      name="reason"
                      bind:value={freezeReason}
                    >
                      <option value="manual_admin"
                        >{t("users.reason.manualAdmin")}</option
                      >
                      <option value="account_lock"
                        >{t("users.reason.accountLock")}</option
                      >
                      <option value="withdrawal_lock">
                        {t("users.reason.withdrawalLock")}
                      </option>
                      <option value="gameplay_lock">
                        {t("users.reason.gameplayLock")}
                      </option>
                      <option value="pending_kyc"
                        >{t("users.reason.pendingKyc")}</option
                      >
                      <option value="aml_review"
                        >{t("users.reason.amlReview")}</option
                      >
                      <option value="auth_failure"
                        >{t("users.reason.authFailure")}</option
                      >
                      <option value="forum_moderation">
                        {t("users.reason.forumModeration")}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{t("users.freeze.scope")}</span
                    >
                    <select
                      class="select select-bordered"
                      name="scope"
                      bind:value={freezeScope}
                    >
                      <option value="account_lock"
                        >{t("users.scope.account")}</option
                      >
                      <option value="gameplay_lock"
                        >{t("users.scope.gameplay")}</option
                      >
                      <option value="topup_lock"
                        >{t("users.scope.topup")}</option
                      >
                      <option value="withdrawal_lock">
                        {t("users.scope.withdrawal")}
                      </option>
                    </select>
                  </label>
                  <div class="admin-rail-note admin-rail-note--danger text-sm">
                    Freezes are enforced immediately on the selected scope. Use
                    the narrowest scope that matches the incident and keep the
                    reason auditable.
                  </div>
                  <button class="btn btn-warning w-full" type="submit">
                    {t("users.actions.freeze")}
                  </button>
                </form>
              </div>
            </section>

            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Command Rail
                  </p>
                  <h2 class="card-title mt-2">Session Controls</h2>
                  <p class="text-sm text-slate-500">
                    Force a logout or trigger a password reset after step-up
                    verification.
                  </p>
                </div>

                <form
                  method="post"
                  action="?/forceLogout"
                  class="admin-rail-panel"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <p class="font-medium text-base-content">
                    {t("users.actions.forceLogout")}
                  </p>
                  <p class="mt-1 text-sm text-slate-500">
                    {t("users.actions.forceLogoutDescription")}
                  </p>
                  <button
                    class="btn btn-outline btn-sm mt-4 w-full"
                    type="submit"
                  >
                    {t("users.actions.forceLogout")}
                  </button>
                </form>

                <form
                  method="post"
                  action="?/resetPassword"
                  class="admin-rail-panel"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <p class="font-medium text-base-content">
                    {t("users.actions.resetPassword")}
                  </p>
                  <p class="mt-1 text-sm text-slate-500">
                    {t("users.actions.resetPasswordDescription")}
                  </p>
                  <button
                    class="btn btn-outline btn-sm mt-4 w-full"
                    type="submit"
                  >
                    {t("users.actions.resetPassword")}
                  </button>
                </form>

                <div class="admin-rail-note text-sm">
                  Session controls reuse the same step-up state as freeze
                  actions. Apply them only after checking active scopes and
                  recent access events together.
                </div>
              </div>
            </section>

            <section class="card bg-base-100 shadow">
              <div class="card-body gap-4">
                <div>
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    Active Scope Rail
                  </p>
                  <h2 class="card-title mt-2">
                    {t("users.freeze.activeScopes")}
                  </h2>
                  <p class="text-sm text-slate-500">
                    {t("users.freeze.activeScopesDescription")}
                  </p>
                </div>

                {#if user.activeScopes.length === 0}
                  <div class="admin-empty-state p-4 text-sm text-slate-500">
                    {t("users.freeze.noActiveScope")}
                  </div>
                {:else}
                  <div class="space-y-3">
                    {#each user.activeScopes as scope}
                      <form
                        method="post"
                        action="?/unfreezeScope"
                        class="admin-rail-panel"
                      >
                        <input
                          type="hidden"
                          name="totpCode"
                          value={stepUpCode}
                        />
                        <input type="hidden" name="scope" value={scope} />
                        <div class="flex items-start justify-between gap-4">
                          <div>
                            <p class="font-medium text-base-content">
                              {formatScope(scope)}
                            </p>
                            <p class="mt-1 text-sm text-slate-500">
                              {t("users.freeze.scopeReleaseHint")}
                            </p>
                          </div>
                          <button class="btn btn-sm btn-success" type="submit">
                            {t("users.actions.unfreeze")}
                          </button>
                        </div>
                      </form>
                    {/each}
                  </div>
                {/if}
              </div>
            </section>
          {/if}
        </aside>
      </section>
    {/if}
  {/if}
</div>
