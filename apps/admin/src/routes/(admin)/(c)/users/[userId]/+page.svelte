<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  type FreezeRecord = {
    id: number
    userId: number
    category: string
    reason: string
    scope: string
    status: string
    metadata?: Record<string, unknown> | null
    createdAt: string
    releasedAt?: string | null
  }

  type PageData = {
    detail: {
      user: {
        id: number
        email: string
        phone: string | null
        role: string
        birthDate: string | null
        registrationCountryCode: string | null
        countryTier: string
        countryResolvedAt?: string | null
        createdAt: string
        updatedAt: string
        emailVerifiedAt?: string | null
        phoneVerifiedAt?: string | null
        userPoolBalance: string
        pityStreak: number
        lastDrawAt?: string | null
        lastWinAt?: string | null
        kycProfileId?: number | null
        kycTier: string
        kycTierSource: string
        activeScopes: string[]
        jurisdiction: {
          registrationCountryCode: string | null
          birthDate: string | null
          countryTier: string
          minimumAge: number
          userAge: number | null
          isOfAge: boolean
          allowedFeatures: string[]
          blockedScopes: string[]
          restrictionReasons: string[]
          countryResolvedAt?: string | null
        }
      }
      wallet: {
        withdrawableBalance: string
        bonusBalance: string
        lockedBalance: string
        wageredAmount: string
        updatedAt?: string | null
      }
      freezes: FreezeRecord[]
      recentDraws: Array<{
        id: number
        prizeId: number | null
        prizeName: string | null
        status: string
        drawCost: string
        rewardAmount: string
        createdAt: string
      }>
      recentPayments: Array<{
        id: number
        flow: "deposit" | "withdrawal"
        amount: string
        status: string
        channelType: string
        assetType: string
        assetCode: string | null
        network: string | null
        createdAt: string
        updatedAt: string
      }>
      recentLoginIps: Array<{
        id: number
        eventType: string
        ip: string | null
        userAgent: string | null
        createdAt: string
      }>
    } | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")
  let freezeCategory = $state("risk")
  let freezeReason = $state("manual_admin")
  let freezeScope = $state("account_lock")

  const actionError = $derived($page.form?.error as string | undefined)
  const actionMessage = $derived($page.form?.message as string | undefined)

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
      real_money_gameplay: t("security.jurisdiction.features.realMoneyGameplay"),
      topup: t("security.jurisdiction.features.topup"),
      withdrawal: t("security.jurisdiction.features.withdrawal"),
    })[value] ?? value
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <a href="/users" class="text-sm text-primary hover:underline">
      {t("users.backToSearch")}
    </a>
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {t("users.title")}
    </p>
    <h1 class="text-3xl font-semibold">{t("users.detail.title")}</h1>
    <p class="text-sm text-slate-600">{t("users.detail.description")}</p>
  </header>

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
    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="card-title">#{data.detail.user.id}</h2>
              <p class="text-sm text-slate-700">{data.detail.user.email}</p>
              <p class="text-sm text-slate-500">{data.detail.user.phone ?? "-"}</p>
              {#if data.detail.user.kycProfileId}
                <a
                  class="mt-3 inline-flex text-sm text-primary hover:underline"
                  href={`/kyc/${data.detail.user.kycProfileId}`}
                >
                  {t("users.actions.openKycProfile")}
                </a>
              {/if}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <a
                class="btn btn-outline btn-sm"
                href={`/users/${data.detail.user.id}/associations`}
              >
                Association graph
              </a>
              <span class="badge badge-outline">
                {formatKycTier(data.detail.user.kycTier)}
              </span>
              {#if data.detail.user.activeScopes.length === 0}
                <span class="badge badge-success badge-outline">
                  {t("users.status.noFreeze")}
                </span>
              {:else}
                {#each data.detail.user.activeScopes as scope}
                  <span class="badge badge-warning badge-outline">
                    {formatScope(scope)}
                  </span>
                {/each}
              {/if}
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.createdAt")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatDate(data.detail.user.createdAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.updatedAt")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatDate(data.detail.user.updatedAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.emailStatus")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.emailVerifiedAt
                  ? `${t("users.status.emailVerified")} · ${formatDate(data.detail.user.emailVerifiedAt)}`
                  : t("users.status.unverified")}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.phoneStatus")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.phoneVerifiedAt
                  ? `${t("users.status.phoneVerified")} · ${formatDate(data.detail.user.phoneVerifiedAt)}`
                  : t("users.status.unverified")}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.birthDate")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.birthDate ?? "-"}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.registrationCountry")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.registrationCountryCode ?? "-"}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.countryTier")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatCountryTier(data.detail.user.countryTier)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.countryResolvedAt")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {formatDate(data.detail.user.countryResolvedAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.userPoolBalance")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.userPoolBalance}
              </p>
            </div>
            <div class="rounded-2xl bg-base-200 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.profile.pityStreak")}
              </p>
              <p class="mt-2 text-sm text-slate-800">
                {data.detail.user.pityStreak}
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-base-300 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
              {t("users.profile.jurisdiction")}
            </p>
            <div class="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p>
                {t("security.jurisdiction.minimumAge")}: {data.detail.user.jurisdiction.minimumAge}
              </p>
              <p>{t("users.profile.age")}: {data.detail.user.jurisdiction.userAge ?? "-"}</p>
              <p class="md:col-span-2">
                {t("security.jurisdiction.allowedFeatures")}: {data.detail.user.jurisdiction.allowedFeatures.length === 0
                  ? t("security.jurisdiction.noFeatures")
                  : data.detail.user.jurisdiction.allowedFeatures
                      .map((feature) => formatJurisdictionFeature(feature))
                      .join(", ")}
              </p>
            </div>
          </div>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{t("users.wallet.title")}</h2>
            <p class="text-sm text-slate-500">{t("users.wallet.description")}</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.wallet.withdrawable")}
              </p>
              <p class="mt-2 text-lg font-semibold">
                {data.detail.wallet.withdrawableBalance}
              </p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.wallet.bonus")}
              </p>
              <p class="mt-2 text-lg font-semibold">
                {data.detail.wallet.bonusBalance}
              </p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.wallet.locked")}
              </p>
              <p class="mt-2 text-lg font-semibold">
                {data.detail.wallet.lockedBalance}
              </p>
            </div>
            <div class="rounded-2xl border border-base-300 p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
                {t("users.wallet.wagered")}
              </p>
              <p class="mt-2 text-lg font-semibold">
                {data.detail.wallet.wageredAmount}
              </p>
            </div>
          </div>
          <p class="text-xs text-slate-500">
            {t("users.wallet.updatedAt")}: {formatDate(data.detail.wallet.updatedAt)}
          </p>
        </div>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{t("users.freeze.title")}</h2>
            <p class="text-sm text-slate-500">{t("users.freeze.description")}</p>
          </div>

          <label class="form-control">
            <span class="label-text mb-2">{t("common.totpCode")}</span>
            <input
              class="input input-bordered"
              bind:value={stepUpCode}
              autocomplete="one-time-code"
              placeholder={t("users.freeze.stepUpPlaceholder")}
            />
          </label>

          <form method="post" action="?/freezeScope" class="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <label class="form-control">
              <span class="label-text mb-2">{t("users.freeze.category")}</span>
              <select
                class="select select-bordered"
                name="category"
                bind:value={freezeCategory}
              >
                <option value="risk">{t("users.category.risk")}</option>
                <option value="community">{t("users.category.community")}</option>
                <option value="compliance">{t("users.category.compliance")}</option>
                <option value="security">{t("users.category.security")}</option>
                <option value="support">{t("users.category.support")}</option>
                <option value="operations">{t("users.category.operations")}</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("users.freeze.reason")}</span>
              <select
                class="select select-bordered"
                name="reason"
                bind:value={freezeReason}
              >
                <option value="manual_admin">{t("users.reason.manualAdmin")}</option>
                <option value="account_lock">{t("users.reason.accountLock")}</option>
                <option value="withdrawal_lock">{t("users.reason.withdrawalLock")}</option>
                <option value="gameplay_lock">{t("users.reason.gameplayLock")}</option>
                <option value="pending_kyc">{t("users.reason.pendingKyc")}</option>
                <option value="aml_review">{t("users.reason.amlReview")}</option>
                <option value="auth_failure">{t("users.reason.authFailure")}</option>
                <option value="forum_moderation">{t("users.reason.forumModeration")}</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("users.freeze.scope")}</span>
              <select
                class="select select-bordered"
                name="scope"
                bind:value={freezeScope}
              >
                <option value="account_lock">{t("users.scope.account")}</option>
                <option value="gameplay_lock">{t("users.scope.gameplay")}</option>
                <option value="topup_lock">{t("users.scope.topup")}</option>
                <option value="withdrawal_lock">{t("users.scope.withdrawal")}</option>
              </select>
            </label>
            <div class="md:col-span-3 flex justify-end">
              <button class="btn btn-warning" type="submit">
                {t("users.actions.freeze")}
              </button>
            </div>
          </form>

          <div class="grid gap-3 md:grid-cols-2">
            <form method="post" action="?/forceLogout" class="rounded-2xl border border-base-300 p-4">
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <p class="font-medium text-slate-900">{t("users.actions.forceLogout")}</p>
              <p class="mt-1 text-sm text-slate-500">
                {t("users.actions.forceLogoutDescription")}
              </p>
              <button class="btn btn-outline btn-sm mt-4" type="submit">
                {t("users.actions.forceLogout")}
              </button>
            </form>

            <form method="post" action="?/resetPassword" class="rounded-2xl border border-base-300 p-4">
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <p class="font-medium text-slate-900">{t("users.actions.resetPassword")}</p>
              <p class="mt-1 text-sm text-slate-500">
                {t("users.actions.resetPasswordDescription")}
              </p>
              <button class="btn btn-outline btn-sm mt-4" type="submit">
                {t("users.actions.resetPassword")}
              </button>
            </form>
          </div>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body space-y-4">
          <div>
            <h2 class="card-title">{t("users.freeze.activeScopes")}</h2>
            <p class="text-sm text-slate-500">{t("users.freeze.activeScopesDescription")}</p>
          </div>

          {#if data.detail.user.activeScopes.length === 0}
            <div class="rounded-2xl border border-dashed border-base-300 p-5 text-sm text-slate-500">
              {t("users.freeze.noActiveScope")}
            </div>
          {:else}
            <div class="space-y-3">
              {#each data.detail.user.activeScopes as scope}
                <form
                  method="post"
                  action="?/unfreezeScope"
                  class="flex items-center justify-between gap-3 rounded-2xl border border-base-300 p-4"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <input type="hidden" name="scope" value={scope} />
                  <div>
                    <p class="font-medium text-slate-900">{formatScope(scope)}</p>
                    <p class="text-sm text-slate-500">{t("users.freeze.scopeReleaseHint")}</p>
                  </div>
                  <button class="btn btn-sm btn-success" type="submit">
                    {t("users.actions.unfreeze")}
                  </button>
                </form>
              {/each}
            </div>
          {/if}
        </div>
      </article>
    </section>

    <section class="card bg-base-100 shadow">
      <div class="card-body">
        <div>
          <h2 class="card-title">{t("users.freeze.recordsTitle")}</h2>
          <p class="text-sm text-slate-500">{t("users.freeze.recordsDescription")}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="table">
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
                <tr>
                  <td>#{record.id}</td>
                  <td>{formatCategory(record.category)}</td>
                  <td>{formatReason(record.reason)}</td>
                  <td>{formatScope(record.scope)}</td>
                  <td>{record.status}</td>
                  <td>{formatDate(record.createdAt)}</td>
                  <td>{formatDate(record.releasedAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-3">
      <article class="card bg-base-100 shadow">
        <div class="card-body">
          <div>
            <h2 class="card-title">{t("users.activity.drawsTitle")}</h2>
            <p class="text-sm text-slate-500">{t("users.activity.drawsDescription")}</p>
          </div>
          <div class="space-y-3">
            {#if data.detail.recentDraws.length === 0}
              <p class="text-sm text-slate-500">{t("users.activity.empty")}</p>
            {:else}
              {#each data.detail.recentDraws as draw}
                <div class="rounded-2xl border border-base-300 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium text-slate-900">#{draw.id}</p>
                      <p class="text-sm text-slate-600">
                        {draw.prizeName ?? t("users.activity.noPrize")}
                      </p>
                    </div>
                    <span class="badge badge-outline">{draw.status}</span>
                  </div>
                  <div class="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>{t("users.activity.drawCost")}: {draw.drawCost}</p>
                    <p>{t("users.activity.rewardAmount")}: {draw.rewardAmount}</p>
                    <p>{formatDate(draw.createdAt)}</p>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body">
          <div>
            <h2 class="card-title">{t("users.activity.paymentsTitle")}</h2>
            <p class="text-sm text-slate-500">{t("users.activity.paymentsDescription")}</p>
          </div>
          <div class="space-y-3">
            {#if data.detail.recentPayments.length === 0}
              <p class="text-sm text-slate-500">{t("users.activity.empty")}</p>
            {:else}
              {#each data.detail.recentPayments as payment}
                <div class="rounded-2xl border border-base-300 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium text-slate-900">
                        {payment.flow === "deposit"
                          ? t("users.activity.deposit")
                          : t("users.activity.withdrawal")}
                        #{payment.id}
                      </p>
                      <p class="text-sm text-slate-600">{payment.amount}</p>
                    </div>
                    <span class="badge badge-outline">{payment.status}</span>
                  </div>
                  <div class="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>{payment.channelType} / {payment.assetCode ?? payment.assetType}</p>
                    <p>{payment.network ?? "-"}</p>
                    <p>{formatDate(payment.createdAt)}</p>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body">
          <div>
            <h2 class="card-title">{t("users.activity.loginsTitle")}</h2>
            <p class="text-sm text-slate-500">{t("users.activity.loginsDescription")}</p>
          </div>
          <div class="space-y-3">
            {#if data.detail.recentLoginIps.length === 0}
              <p class="text-sm text-slate-500">{t("users.activity.empty")}</p>
            {:else}
              {#each data.detail.recentLoginIps as login}
                <div class="rounded-2xl border border-base-300 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium text-slate-900">{login.ip ?? "-"}</p>
                      <p class="text-sm text-slate-600">{login.eventType}</p>
                    </div>
                    <span class="text-xs text-slate-500">
                      {formatDate(login.createdAt)}
                    </span>
                  </div>
                  <p class="mt-3 text-xs text-slate-500 break-all">
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
</div>
