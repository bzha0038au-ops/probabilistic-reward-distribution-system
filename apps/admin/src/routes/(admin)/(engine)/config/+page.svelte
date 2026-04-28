<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminConfigGovernanceSection from "../(shared)/control-center/admin-config-governance-section.svelte"
  import AdminMetricsSection from "../(shared)/control-center/admin-metrics-section.svelte"
  import AdminTopSpendersSection from "../(shared)/control-center/admin-top-spenders-section.svelte"
  import {
    type CurrentAdmin,
    type MfaEnrollment,
    type PageData,
  } from "../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")
  let mfaEnrollmentCode = $state("")

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const currentAdmin = $derived(data.admin ?? null)
  const analytics = $derived(data.analytics)
  const mfaStatus = $derived(data.mfaStatus)
  const mfaEnrollment = $derived(
    $page.form?.mfaEnrollment as MfaEnrollment | undefined,
  )
  const recoveryCodes = $derived(
    ($page.form?.recoveryCodes as string[] | undefined) ?? [],
  )
  const recoveryCodesRemaining = $derived(
    Number(
      ($page.form?.recoveryCodesRemaining as number | undefined) ??
        mfaStatus?.recoveryCodesRemaining ??
        0,
    ),
  )
  const recoveryMode = $derived(
    ($page.form?.mfaRecoveryMode as
      | CurrentAdmin["mfaRecoveryMode"]
      | undefined) ??
      currentAdmin?.mfaRecoveryMode ??
      "none",
  )
  const mfaEnabled = $derived(
    Boolean(
      ($page.form?.mfaEnabled as boolean | undefined) ??
        currentAdmin?.mfaEnabled ??
        mfaStatus?.mfaEnabled,
    ),
  )
  const winRateLabel = $derived(
    analytics ? `${(analytics.winRate * 100).toFixed(2)}%` : "0%",
  )
  const actionError = $derived($page.form?.error as string | undefined)
</script>

<header class="space-y-3">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Engine
  </p>
  <h1 class="text-3xl font-semibold">Config</h1>
  <p class="max-w-3xl text-sm text-slate-600">
    共享引擎配置、管理员 MFA 和运行指标集中在这里，和 C 端 / B 端产品面板明确分层。
  </p>
</header>

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if actionError}
  <div class="alert alert-error mt-6 text-sm">
    <span>{actionError}</span>
  </div>
{/if}

<AdminMetricsSection
  {analytics}
  reconciliationAlertsSummary={data.reconciliationAlertsSummary}
  {t}
  {winRateLabel}
/>

<section class="mt-8 grid gap-6 lg:grid-cols-2">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="card-title">{t("admin.mfa.title")}</h2>
          <p class="text-sm text-slate-500">{t("admin.mfa.description")}</p>
        </div>
        <span class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}>
          {mfaEnabled ? t("admin.mfa.enabled") : t("admin.mfa.disabled")}
        </span>
      </div>

      {#if recoveryMode !== "none"}
        <div class="alert alert-warning text-sm">
          <span>
            {recoveryMode === "break_glass"
              ? t("admin.mfa.breakGlassRecoveryActive")
              : t("admin.mfa.recoveryCodeSessionActive")}
          </span>
        </div>
      {/if}

      {#if recoveryCodes.length > 0}
        <div class="rounded-box border border-warning/40 bg-warning/10 p-4">
          <p class="text-sm font-semibold">
            {t("admin.mfa.recoveryCodesTitle")}
          </p>
          <p class="mt-1 text-xs text-slate-600">
            {t("admin.mfa.recoveryCodesHint")}
          </p>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            {#each recoveryCodes as recoveryCode}
              <code class="rounded bg-base-100 px-3 py-2 font-mono text-sm">
                {recoveryCode}
              </code>
            {/each}
          </div>
        </div>
      {/if}

      {#if !mfaEnabled}
        <form method="post" action="?/startMfaEnrollment">
          <button class="btn btn-outline" type="submit">
            {t("admin.mfa.start")}
          </button>
        </form>

        {#if mfaEnrollment}
          <div class="grid gap-4">
            <label class="form-control">
              <span class="label-text mb-2">{t("admin.mfa.secret")}</span>
              <input
                class="input input-bordered font-mono"
                readonly
                value={mfaEnrollment.secret}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-2">{t("admin.mfa.otpauthUrl")}</span>
              <textarea
                class="textarea textarea-bordered min-h-24 font-mono text-xs"
                readonly>{mfaEnrollment.otpauthUrl}</textarea
              >
            </label>
            <form
              method="post"
              action="?/confirmMfaEnrollment"
              class="grid gap-4"
            >
              <input
                type="hidden"
                name="enrollmentToken"
                value={mfaEnrollment.enrollmentToken}
              />
              <label class="form-control max-w-sm">
                <span class="label-text mb-2">{t("common.totpCode")}</span>
                <input
                  name="totpCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={mfaEnrollmentCode}
                  placeholder={t("admin.mfa.codePlaceholder")}
                />
              </label>
              <button class="btn btn-primary max-w-sm" type="submit">
                {t("admin.mfa.confirm")}
              </button>
            </form>
          </div>
        {/if}
      {:else}
        <p class="text-sm text-slate-500">{t("admin.mfa.enabledHint")}</p>
        <div
          class="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm"
        >
          <p>
            {t("admin.mfa.recoveryCodesRemaining")}
            <span class="ml-2 font-mono font-semibold"
              >{recoveryCodesRemaining}</span
            >
          </p>
          <p class="mt-2 text-xs text-slate-500">
            {mfaStatus?.breakGlassConfigured
              ? t("admin.mfa.breakGlassConfigured")
              : t("admin.mfa.breakGlassMissing")}
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <form method="post" action="?/regenerateRecoveryCodes">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <button class="btn btn-outline" type="submit">
              {t("admin.mfa.regenerateRecoveryCodes")}
            </button>
          </form>
          <form method="post" action="?/disableMfa">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <button class="btn btn-outline btn-error" type="submit">
              {recoveryMode === "none"
                ? t("admin.mfa.disable")
                : t("admin.mfa.disableAfterRecovery")}
            </button>
          </form>
        </div>
        <p class="text-xs text-slate-500">
          {recoveryMode === "none"
            ? t("admin.mfa.disableHint")
            : t("admin.mfa.disableRecoveryHint")}
        </p>
      {/if}
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.stepUp.description")}</p>
      </div>
      <label class="form-control max-w-sm">
        <span class="label-text mb-2">{t("common.totpCode")}</span>
        <input
          name="totpCode"
          type="text"
          inputmode="text"
          autocomplete="one-time-code"
          class="input input-bordered"
          bind:value={stepUpCode}
          placeholder={t("admin.stepUp.placeholder")}
          disabled={!mfaEnabled}
        />
      </label>
      {#if !mfaEnabled}
        <p class="text-sm text-warning">{t("admin.stepUp.mfaRequired")}</p>
      {/if}
    </div>
  </div>
</section>

<section class="mt-6">
  <AdminConfigGovernanceSection config={data.config} {stepUpCode} {t} />
</section>

<section class="mt-6">
  <div class="card bg-base-100 shadow">
    <div
      class="card-body flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center"
    >
      <div class="space-y-2">
        <h2 class="card-title">Legal Workspace</h2>
        <p class="max-w-2xl text-sm text-slate-500">
          协议条款已经迁移到独立的 Legal 页面管理，在那里处理版本草稿、HTML 预览、diff、
          灰度发布和回滚，不再从 Config 页面直接写生产。
        </p>
      </div>
      <a class="btn btn-outline" href="/legal">Open Legal</a>
    </div>
  </div>
</section>

<AdminTopSpendersSection spenders={analytics?.topSpenders ?? []} {t} />
