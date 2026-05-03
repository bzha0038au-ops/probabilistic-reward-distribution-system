<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import AdminConfigModuleTabs from "../../(shared)/control-center/admin-config-module-tabs.svelte"
  import AdminConfigOperatorSecuritySection from "../../(shared)/control-center/admin-config-operator-security-section.svelte"
  import type {
    CurrentAdmin,
    MfaEnrollment,
    PageData,
  } from "../../(shared)/control-center/page-support"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")
  let mfaEnrollmentCode = $state("")

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const currentAdmin = $derived(data.admin ?? null)
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
  const operatorIdLabel = $derived(
    currentAdmin
      ? `OP-${String(currentAdmin.adminId).padStart(3, "0")}`
      : "OP-000",
  )
  const recoveryModeLabel = $derived(
    recoveryMode === "break_glass"
      ? "Break-Glass"
      : recoveryMode === "recovery_code"
        ? "Recovery Code"
        : "Standard Session",
  )
</script>

<AdminPageHeader
  context="Config · Operator Security"
  eyebrow="Engine"
  title="Operator MFA"
  description="把 step-up、MFA enrollment、recovery codes 和停用动作单独收进一个页面，不再占用 Config Hub。"
/>

<AdminConfigModuleTabs />

{#if data.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{data.error}</span>
  </div>
{/if}

{#if $page.form?.error}
  <div class="alert alert-error mt-6 text-sm">
    <span>{$page.form?.error as string}</span>
  </div>
{/if}

<section class="mt-8">
  <AdminConfigOperatorSecuritySection
    {currentAdmin}
    {mfaStatus}
    {mfaEnrollment}
    {recoveryCodes}
    {recoveryCodesRemaining}
    {recoveryMode}
    {mfaEnabled}
    {operatorIdLabel}
    {recoveryModeLabel}
    bind:stepUpCode
    bind:mfaEnrollmentCode
    {t}
  />
</section>
