<script lang="ts">
  import type { CurrentAdmin, MfaEnrollment, MfaStatus } from "./page-support"

  type Translate = (key: string) => string

  let {
    currentAdmin,
    mfaStatus,
    mfaEnrollment,
    recoveryCodes,
    recoveryCodesRemaining,
    recoveryMode,
    mfaEnabled,
    operatorIdLabel,
    recoveryModeLabel,
    stepUpCode = $bindable(),
    mfaEnrollmentCode = $bindable(),
    t,
  }: {
    currentAdmin: CurrentAdmin | null
    mfaStatus: MfaStatus | null
    mfaEnrollment?: MfaEnrollment
    recoveryCodes: string[]
    recoveryCodesRemaining: number
    recoveryMode: CurrentAdmin["mfaRecoveryMode"] | "none"
    mfaEnabled: boolean
    operatorIdLabel: string
    recoveryModeLabel: string
    stepUpCode: string
    mfaEnrollmentCode: string
    t: Translate
  } = $props()
</script>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.96fr)]">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-5">
      <div
        class="flex items-start justify-between gap-4 border-b border-[var(--admin-border)] pb-4"
      >
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Operator Verification
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.8rem] leading-tight text-[var(--admin-ink)]"
          >
            Access Rail
          </h2>
        </div>
        <span
          class="material-symbols-outlined text-[1.25rem] text-[var(--admin-primary)]"
        >
          shield_person
        </span>
      </div>

      <div class="flex items-start gap-4">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] font-mono text-sm font-semibold text-[var(--admin-ink)]"
        >
          {currentAdmin?.email?.trim().charAt(0).toUpperCase() ?? "A"}
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-[var(--admin-ink)]">
            {currentAdmin?.email ?? "admin@reward.dev"}
          </p>
          <p
            class="mt-1 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-muted-soft)]"
          >
            {operatorIdLabel} · Control Center
          </p>
        </div>
      </div>

      <div
        class="grid gap-3 rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-[var(--admin-muted)]">MFA Status</span>
          <span
            class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}
          >
            {mfaEnabled ? t("admin.mfa.enabled") : t("admin.mfa.disabled")}
          </span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-[var(--admin-muted)]">Recovery Mode</span>
          <span
            class="font-mono text-[0.75rem] uppercase tracking-[0.18em] text-[var(--admin-ink)]"
          >
            {recoveryModeLabel}
          </span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-[var(--admin-muted)]">Codes Remaining</span>
          <span class="font-mono text-sm font-semibold text-[var(--admin-ink)]">
            {recoveryCodesRemaining}
          </span>
        </div>
      </div>

      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
      >
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Step-Up
        </p>
        <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
          {t("admin.stepUp.description")}
        </p>

        <label class="form-control mt-4">
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
          <p class="mt-4 text-sm text-warning">
            {t("admin.stepUp.mfaRequired")}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            {t("admin.mfa.title")}
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
          >
            Authenticator Governance
          </h2>
          <p class="mt-2 text-sm text-slate-500">
            {t("admin.mfa.description")}
          </p>
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
        <div
          class="rounded-[0.95rem] border border-warning/40 bg-warning/10 p-4"
        >
          <p class="text-sm font-semibold">
            {t("admin.mfa.recoveryCodesTitle")}
          </p>
          <p class="mt-1 text-xs text-slate-600">
            {t("admin.mfa.recoveryCodesHint")}
          </p>
          <div class="mt-3 grid gap-2">
            {#each recoveryCodes as recoveryCode}
              <code
                class="rounded-[0.7rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-3 py-2 font-mono text-sm"
              >
                {recoveryCode}
              </code>
            {/each}
          </div>
        </div>
      {/if}

      {#if !mfaEnabled}
        <form method="post" action="?/startMfaEnrollment">
          <button class="btn btn-outline w-full" type="submit">
            {t("admin.mfa.start")}
          </button>
        </form>

        {#if mfaEnrollment}
          <div
            class="grid gap-4 rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
          >
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
              <label class="form-control">
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
              <button class="btn btn-primary" type="submit">
                {t("admin.mfa.confirm")}
              </button>
            </form>
          </div>
        {/if}
      {:else}
        <p class="text-sm text-slate-500">{t("admin.mfa.enabledHint")}</p>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm"
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
        <div class="grid gap-3">
          <form method="post" action="?/regenerateRecoveryCodes">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <button class="btn btn-outline w-full" type="submit">
              {t("admin.mfa.regenerateRecoveryCodes")}
            </button>
          </form>
          <form method="post" action="?/disableMfa">
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <button class="btn btn-outline btn-error w-full" type="submit">
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
</div>
