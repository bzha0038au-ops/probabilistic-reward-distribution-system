<script lang="ts">
  import { page } from "$app/stores"
  import ConfirmDialog from "$lib/components/confirm-dialog.svelte"
  import {
    resolvePendingBreakGlassSubmission,
    upsertHiddenFormValue,
    type PendingBreakGlassSubmission,
  } from "$lib/break-glass"
  import type {
    SaasApiKeyIssue,
    SaasOverview,
    SaasTenantProvisioning,
  } from "@reward/shared-types/saas"
  import { getContext } from "svelte"
  import { saasActionPolicies } from "./action-policies"

  interface PageData {
    overview: SaasOverview | null
    error: string | null
    inviteToken: string | null
    billingSetupStatus: string | null
  }

  type InviteResult = {
    invite: {
      id: number
      email: string
      role: string
    }
    inviteUrl: string
  }

  type RiskEnvelopeDraftResult = {
    id: number
    status: string
    summary: string
  }

  type HelloRewardQuickstart = {
    tenantName: string
    projectId: number
    projectName: string
    projectSlug: string
    environment: "sandbox" | "live"
    apiKeyLabel: string
    apiKeyExpiresAt: string | Date
    fileName: string
    command: string
  }

  let { data }: { data: PageData } = $props()
  const { t } = getContext("i18n") as { t: (key: string) => string }
  let stepUpCode = $state("")
  let stepUpInput = $state<HTMLInputElement | null>(null)
  let breakGlassCode = $state("")
  let breakGlassError = $state<string | null>(null)
  let pendingBreakGlass = $state<PendingBreakGlassSubmission | null>(null)
  let bypassBreakGlassSubmission: PendingBreakGlassSubmission | null = null
  let quickstartProjectId = $state("")

  const overview = $derived(data.overview)
  const actionError = $derived($page.form?.error as string | undefined)
  const issuedKey = $derived(
    ($page.form?.issuedKey as SaasApiKeyIssue | undefined) ?? null,
  )
  const rotatedKey = $derived(
    ($page.form?.rotatedKey as
      | {
          previousKey: {
            label: string
            keyPrefix: string
            expiresAt: string | Date
          }
          issuedKey: SaasApiKeyIssue
          overlapEndsAt: string | Date
        }
      | undefined) ?? null,
  )
  const inviteResult = $derived(
    ($page.form?.inviteResult as InviteResult | undefined) ?? null,
  )
  const tenantProvisioned = $derived(
    ($page.form?.tenantProvisioned as SaasTenantProvisioning | undefined) ??
      null,
  )
  const sandboxQuickstart = $derived(
    ($page.form?.sandboxQuickstart as HelloRewardQuickstart | undefined) ??
      null,
  )
  const sandboxQuickstartWarning = $derived(
    ($page.form?.sandboxQuickstartWarning as string | undefined) ?? null,
  )
  const riskEnvelopeDraft = $derived(
    ($page.form?.riskEnvelopeDraft as RiskEnvelopeDraftResult | undefined) ??
      null,
  )
  const tenants = $derived(overview?.tenants ?? [])
  const memberships = $derived(overview?.memberships ?? [])
  const projects = $derived(overview?.projects ?? [])
  const projectObservability = $derived(overview?.projectObservability ?? [])
  const projectObservabilityByProjectId = $derived(
    new Map(
      projectObservability.map((item) => [item.project.id, item] as const),
    ),
  )
  const projectPrizes = $derived(overview?.projectPrizes ?? [])
  const apiKeys = $derived(overview?.apiKeys ?? [])
  const billingRuns = $derived(overview?.billingRuns ?? [])
  const topUps = $derived(overview?.topUps ?? [])
  const invites = $derived(overview?.invites ?? [])
  const tenantLinks = $derived(overview?.tenantLinks ?? [])
  const agentControls = $derived(overview?.agentControls ?? [])
  const webhookEvents = $derived(overview?.webhookEvents ?? [])
  const outboundWebhooks = $derived(overview?.outboundWebhooks ?? [])
  const outboundDeliveries = $derived(overview?.outboundDeliveries ?? [])
  const recentUsage = $derived(overview?.recentUsage ?? [])
  const sandboxProjects = $derived(
    projects.filter((project) => project.environment === "sandbox"),
  )
  const selectedSandboxProject = $derived(
    sandboxProjects.find(
      (project) => String(project.id) === quickstartProjectId,
    ) ??
      sandboxProjects[0] ??
      null,
  )

  $effect(() => {
    if (!quickstartProjectId && sandboxProjects[0]) {
      quickstartProjectId = String(sandboxProjects[0].id)
    }
  })

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString()
  }

  const humanizeCode = (value: string) => value.replaceAll("_", " ")

  const translateEnum = (
    prefix: string,
    value: string | number | null | undefined,
  ) => {
    if (value === null || value === undefined) return "—"

    const normalized = String(value)
    const key = `${prefix}.${normalized}`
    const translated = t(key)
    return translated === key ? humanizeCode(normalized) : translated
  }

  const formatPercent = (value: number | null | undefined, digits = 1) =>
    `${((value ?? 0) * 100).toFixed(digits)}%`

  const formatSignedPercentPoints = (
    value: number | null | undefined,
    digits = 1,
  ) => {
    const normalized = value ?? 0
    const prefix = normalized > 0 ? "+" : ""
    return `${prefix}${(normalized * 100).toFixed(digits)}pp`
  }

  const driftTone = (value: number | null | undefined) => {
    const normalized = value ?? 0
    if (normalized > 0.02) return "text-rose-600"
    if (normalized < -0.02) return "text-emerald-600"
    return "text-slate-500"
  }

  const tenantName = (tenantId: number) =>
    tenants.find((item) => item.tenant.id === tenantId)?.tenant.name ??
    `#${tenantId}`

  const translateTenantStatus = (value: string | null | undefined) =>
    translateEnum("saas.enums.tenantStatus", value)

  const translateProjectEnvironment = (value: string | null | undefined) =>
    translateEnum("saas.enums.projectEnvironment", value)

  const translateRole = (value: string | null | undefined) =>
    translateEnum("saas.enums.role", value)

  const translateInviteStatus = (value: string | null | undefined) =>
    translateEnum("saas.enums.inviteStatus", value)

  const translateTenantLinkType = (value: string | null | undefined) =>
    translateEnum("saas.enums.tenantLinkType", value)

  const translateBillingPlan = (value: string | null | undefined) =>
    translateEnum("saas.enums.billingPlan", value)

  const translateCollectionMethod = (value: string | null | undefined) =>
    translateEnum("saas.enums.collectionMethod", value)

  const translateBoolean = (value: boolean) =>
    t(value ? "saas.enums.boolean.on" : "saas.enums.boolean.off")

  const translateYesNo = (value: boolean) =>
    t(value ? "saas.enums.boolean.yes" : "saas.enums.boolean.no")

  const projectLabel = (projectId: number) => {
    const project = projects.find((item) => item.id === projectId)
    return project
      ? `${project.name} · ${translateProjectEnvironment(project.environment)}`
      : `#${projectId}`
  }

  const outboundWebhookUrlHost = (value: string) => {
    try {
      return new URL(value).host
    } catch {
      return value
    }
  }

  const tenantLinkChildren = (tenantId: number) =>
    tenantLinks.filter((item) => item.parentTenantId === tenantId)

  const tenantAgentControls = (tenantId: number) =>
    agentControls.filter((item) => item.tenantId === tenantId)

  const projectBillingHints = (tenantId: number) =>
    billingRuns.filter((item) => item.tenantId === tenantId).slice(0, 2)

  const formatDecisionPricing = (pricing: {
    reject: string
    mute: string
    payout: string
  }) =>
    `reject ${pricing.reject} · mute ${pricing.mute} · payout ${pricing.payout}`

  const formatDecisionBreakdown = (
    breakdown: Array<{
      decisionType: string
      units: number
      unitAmount: string
      totalAmount: string
    }>,
  ) =>
    breakdown
      .map(
        (item) =>
          `${item.decisionType} ${item.units}×${item.unitAmount} = ${item.totalAmount}`,
      )
      .join(" · ")
  const readStepUpCode = () => stepUpInput?.value.trim() ?? stepUpCode.trim()
  const activeBreakGlassPolicy = $derived(pendingBreakGlass?.policy ?? null)
  const breakGlassStepUpHint = $derived(
    readStepUpCode() === "" ? t("saas.confirmDialog.stepUpHint") : null,
  )

  const closeBreakGlassDialog = () => {
    pendingBreakGlass = null
    breakGlassCode = ""
    breakGlassError = null
  }

  const handleBreakGlassSubmit = (event: SubmitEvent) => {
    if (event.target instanceof HTMLFormElement) {
      upsertHiddenFormValue(event.target, "totpCode", readStepUpCode())
    }

    const pending = resolvePendingBreakGlassSubmission(
      event,
      saasActionPolicies,
    )
    if (!pending) {
      return
    }

    if (
      bypassBreakGlassSubmission &&
      bypassBreakGlassSubmission.form === pending.form &&
      bypassBreakGlassSubmission.submitter === pending.submitter &&
      bypassBreakGlassSubmission.actionName === pending.actionName
    ) {
      bypassBreakGlassSubmission = null
      return
    }

    event.preventDefault()
    pendingBreakGlass = pending
    breakGlassCode = ""
    breakGlassError = null
  }

  const confirmBreakGlassDialog = () => {
    if (!pendingBreakGlass) {
      return
    }
    if (readStepUpCode() === "") {
      breakGlassError = t("saas.confirmDialog.mfaRequired")
      return
    }
    if (breakGlassCode.trim() === "") {
      breakGlassError = t("saas.confirmDialog.breakGlassRequired")
      return
    }

    upsertHiddenFormValue(pendingBreakGlass.form, "totpCode", readStepUpCode())
    upsertHiddenFormValue(
      pendingBreakGlass.form,
      "breakGlassCode",
      breakGlassCode.trim(),
    )

    const nextSubmission = pendingBreakGlass
    bypassBreakGlassSubmission = nextSubmission
    closeBreakGlassDialog()

    if (nextSubmission.submitter) {
      nextSubmission.form.requestSubmit(nextSubmission.submitter)
      return
    }

    nextSubmission.form.requestSubmit()
  }
</script>

<svelte:head>
  <title>{t("saas.title")}</title>
</svelte:head>

<div class="space-y-8" onsubmitcapture={handleBreakGlassSubmit}>
  <section class="space-y-3">
    <div>
      <p class="text-sm uppercase tracking-[0.2em] text-slate-500">
        {t("saas.eyebrow")}
      </p>
      <h1 class="text-3xl font-semibold text-slate-900">{t("saas.title")}</h1>
      <p class="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
        {t("saas.description")}
      </p>
    </div>

    {#if data.error}
      <div class="alert alert-error text-sm">{data.error}</div>
    {/if}

    {#if actionError}
      <div class="alert alert-error text-sm">{actionError}</div>
    {/if}

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">
          {t("admin.stepUp.title")}
        </h2>
        <p class="mt-1 text-sm text-slate-500">
          {t("admin.stepUp.description")}
        </p>
      </div>
      <label class="form-control mt-4 max-w-sm">
        <span class="label-text mb-2">{t("common.totpCode")}</span>
        <input
          name="totpCode"
          type="text"
          inputmode="text"
          autocomplete="one-time-code"
          class="input input-bordered"
          bind:this={stepUpInput}
          bind:value={stepUpCode}
          placeholder={t("admin.stepUp.placeholder")}
        />
      </label>
    </div>

    {#if data.billingSetupStatus === "success"}
      <div class="alert alert-success text-sm">
        {t("saas.notices.billingSetupSuccess")}
      </div>
    {:else if data.billingSetupStatus === "cancelled"}
      <div class="alert text-sm">{t("saas.notices.billingSetupCancelled")}</div>
    {/if}

    {#if data.inviteToken}
      <form
        method="post"
        action="?/acceptInvite"
        class="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm"
      >
        <input type="hidden" name="token" value={data.inviteToken} />
        <div
          class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p class="text-sm font-semibold text-amber-900">
              {t("saas.notices.inviteDetectedTitle")}
            </p>
            <p class="mt-1 text-sm text-amber-800">
              {t("saas.notices.inviteDetectedDescription")}
            </p>
          </div>
          <button class="btn btn-primary"
            >{t("saas.notices.acceptInvite")}</button
          >
        </div>
      </form>
    {/if}

    {#if issuedKey}
      <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
        <p class="text-sm font-semibold text-emerald-900">
          {t("saas.notices.issuedKeyTitle")}
        </p>
        <p class="mt-1 text-sm text-emerald-800">
          {issuedKey.label} · {issuedKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-emerald-700">
          {t("saas.notices.issuedKeyExpires")}
          {formatDate(issuedKey.expiresAt)}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-emerald-200"
        >
          {issuedKey.apiKey}
        </code>
      </div>
    {/if}

    {#if rotatedKey}
      <div class="rounded-2xl border border-sky-300 bg-sky-50 p-4">
        <p class="text-sm font-semibold text-sky-900">
          {t("saas.notices.rotatedKeyTitle")}
        </p>
        <p class="mt-1 text-sm text-sky-800">
          {rotatedKey.previousKey.label} · {rotatedKey.previousKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-sky-700">
          {t("saas.notices.rotatedKeyOldValidUntil")}
          {formatDate(rotatedKey.overlapEndsAt)}
        </p>
        <p class="mt-3 text-sm text-sky-800">
          {t("saas.notices.rotatedKeyNewKey")}: {rotatedKey.issuedKey.label} ·
          {rotatedKey.issuedKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-sky-700">
          {t("saas.notices.rotatedKeyExpires")}
          {formatDate(rotatedKey.issuedKey.expiresAt)}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-sky-200"
        >
          {rotatedKey.issuedKey.apiKey}
        </code>
      </div>
    {/if}

    {#if inviteResult}
      <div class="rounded-2xl border border-sky-300 bg-sky-50 p-4">
        <p class="text-sm font-semibold text-sky-900">
          {t("saas.notices.inviteCreatedTitle")}
        </p>
        <p class="mt-1 text-sm text-sky-800">
          {inviteResult.invite.email} · {translateRole(
            inviteResult.invite.role,
          )}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-sky-200"
        >
          {inviteResult.inviteUrl}
        </code>
      </div>
    {/if}

    {#if tenantProvisioned}
      <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
        <p class="text-sm font-semibold text-emerald-900">
          {t("saas.notices.tenantProvisionedTitle")}
        </p>
        <p class="mt-1 text-sm text-emerald-800">
          {tenantProvisioned.name} · {tenantProvisioned.bootstrap.sandboxProject
            .name}
          · {tenantProvisioned.bootstrap.sandboxProject.currency}
        </p>
        <p class="mt-1 text-xs text-emerald-700">
          {t("saas.notices.seededPrizes")}
          {tenantProvisioned.bootstrap.sandboxPrizes.length} ·
          {t("saas.notices.billingBillable")}
          {translateYesNo(
            tenantProvisioned.bootstrap.billingAccount.isBillable,
          )}
        </p>
      </div>
    {/if}

    {#if sandboxQuickstart}
      <div class="rounded-2xl border border-violet-300 bg-violet-50 p-4">
        <p class="text-sm font-semibold text-violet-900">
          {t("saas.notices.sandboxQuickstartTitle")}
        </p>
        <p class="mt-1 text-sm text-violet-800">
          {sandboxQuickstart.tenantName} · {sandboxQuickstart.projectName} ·
          {translateProjectEnvironment(sandboxQuickstart.environment)}
        </p>
        <p class="mt-1 text-xs text-violet-700">
          {sandboxQuickstart.apiKeyLabel} · {t(
            "saas.notices.sandboxQuickstartExpires",
          )}
          {formatDate(sandboxQuickstart.apiKeyExpiresAt)}
        </p>
        <pre
          class="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-violet-100"><code
            >{sandboxQuickstart.command}</code
          ></pre>
      </div>
    {/if}

    {#if sandboxQuickstartWarning}
      <div class="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p class="text-sm font-semibold text-amber-900">
          {t("saas.notices.sandboxQuickstartPendingTitle")}
        </p>
        <p class="mt-1 text-sm text-amber-800">{sandboxQuickstartWarning}</p>
      </div>
    {/if}

    {#if riskEnvelopeDraft}
      <div class="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p class="text-sm font-semibold text-amber-900">
          {t("saas.notices.riskEnvelopeRequestCreatedTitle")}
        </p>
        <p class="mt-1 text-sm text-amber-800">
          #{riskEnvelopeDraft.id} · {humanizeCode(riskEnvelopeDraft.status)}
        </p>
        <p class="mt-1 text-xs text-amber-700">{riskEnvelopeDraft.summary}</p>
      </div>
    {/if}
  </section>

  <section class="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.tenants")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.tenantCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.projects")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.projectCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.keys")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.apiKeyCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.players")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.playerCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.draws30d")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.drawCount30d ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("saas.summary.billable")}</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.billableTenantCount ?? 0}
      </p>
    </article>
  </section>

  <section class="grid gap-6 xl:grid-cols-4">
    <form
      method="post"
      action="?/createTenant"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="totpCode" value={stepUpCode} />
      <h2 class="text-lg font-semibold">{t("saas.tenantForm.title")}</h2>
      <div class="mt-4 space-y-3">
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder={t("saas.tenantForm.namePlaceholder")}
        />
        <input
          class="input input-bordered w-full"
          name="slug"
          placeholder={t("saas.tenantForm.slugPlaceholder")}
        />
        <input
          class="input input-bordered w-full"
          name="billingEmail"
          placeholder={t("saas.tenantForm.billingEmailPlaceholder")}
        />
        <select class="select select-bordered w-full" name="status">
          <option value="active">{translateTenantStatus("active")}</option>
          <option value="suspended">{translateTenantStatus("suspended")}</option
          >
          <option value="archived">{translateTenantStatus("archived")}</option>
        </select>
      </div>
      <button class="btn btn-primary mt-5 w-full">
        {t("saas.tenantForm.submit")}
      </button>
    </form>

    <form
      method="post"
      action="?/createProject"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="totpCode" value={stepUpCode} />
      <h2 class="text-lg font-semibold">{t("saas.projectForm.title")}</h2>
      <div class="mt-4 grid gap-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder={t("saas.projectForm.namePlaceholder")}
        />
        <input
          class="input input-bordered w-full"
          name="slug"
          placeholder={t("saas.projectForm.slugPlaceholder")}
        />
        <div class="grid grid-cols-2 gap-3">
          <select class="select select-bordered w-full" name="environment">
            <option value="sandbox">
              {translateProjectEnvironment("sandbox")}
            </option>
            <option value="live">{translateProjectEnvironment("live")}</option>
          </select>
          <select class="select select-bordered w-full" name="status">
            <option value="active">{translateTenantStatus("active")}</option>
            <option value="suspended"
              >{translateTenantStatus("suspended")}</option
            >
            <option value="archived">{translateTenantStatus("archived")}</option
            >
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="currency"
            value="USD"
          />
          <input
            class="input input-bordered w-full"
            name="drawCost"
            value="0"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="prizePoolBalance"
            value="0"
          />
          <input
            class="input input-bordered w-full"
            name="missWeight"
            value="0"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <select class="select select-bordered w-full" name="strategy">
            <option value="weighted_gacha">weighted_gacha</option>
            <option value="epsilon_greedy">epsilon_greedy</option>
          </select>
          <input
            class="input input-bordered w-full"
            name="strategyParams"
            value=""
            placeholder={'{"epsilon":0.1}'}
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="fairnessEpochSeconds"
            value="3600"
          />
          <input
            class="input input-bordered w-full"
            name="maxDrawCount"
            value="1"
          />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <input
            class="input input-bordered w-full"
            name="apiRateLimitBurst"
            value="120"
          />
          <input
            class="input input-bordered w-full"
            name="apiRateLimitHourly"
            value="3600"
          />
          <input
            class="input input-bordered w-full"
            name="apiRateLimitDaily"
            value="86400"
          />
        </div>
        <p class="text-xs text-slate-500">
          {t("saas.projectForm.quotaHint")}
        </p>
      </div>
      <button class="btn btn-primary mt-5 w-full">
        {t("saas.projectForm.submit")}
      </button>
    </form>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.membership.title")}</h2>
      <form method="post" action="?/assignMembership" class="mt-4 space-y-3">
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="adminEmail"
          placeholder={t("saas.membership.adminEmailPlaceholder")}
        />
        <select class="select select-bordered w-full" name="role">
          <option value="tenant_owner">{translateRole("tenant_owner")}</option>
          <option value="tenant_operator">
            {translateRole("tenant_operator")}
          </option>
          <option value="agent_manager">{translateRole("agent_manager")}</option
          >
          <option value="agent_viewer">{translateRole("agent_viewer")}</option>
        </select>
        <button class="btn btn-secondary w-full"
          >{t("saas.membership.save")}</button
        >
      </form>

      <div class="my-5 border-t border-slate-200"></div>

      <form method="post" action="?/createInvite" class="space-y-3">
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="email"
          placeholder={t("saas.membership.inviteEmailPlaceholder")}
        />
        <select class="select select-bordered w-full" name="role">
          <option value="tenant_owner">{translateRole("tenant_owner")}</option>
          <option value="tenant_operator">
            {translateRole("tenant_operator")}
          </option>
          <option value="agent_manager">{translateRole("agent_manager")}</option
          >
          <option value="agent_viewer">{translateRole("agent_viewer")}</option>
        </select>
        <button class="btn btn-primary w-full">
          {t("saas.membership.createInvite")}
        </button>
      </form>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.quickstart.title")}</h2>
      <p class="mt-2 text-sm text-slate-500">
        {t("saas.quickstart.description")}
      </p>
      <form
        method="post"
        action="?/issueHelloRewardSnippet"
        class="mt-4 space-y-3"
      >
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select
          class="select select-bordered w-full"
          name="projectId"
          bind:value={quickstartProjectId}
        >
          {#each sandboxProjects as project}
            <option value={String(project.id)}
              >{project.name} · {tenantName(project.tenantId)}</option
            >
          {/each}
        </select>
        {#if selectedSandboxProject}
          <input
            type="hidden"
            name="projectName"
            value={selectedSandboxProject.name}
          />
          <input
            type="hidden"
            name="projectSlug"
            value={selectedSandboxProject.slug}
          />
          <input
            type="hidden"
            name="tenantName"
            value={tenantName(selectedSandboxProject.tenantId)}
          />
          <input
            type="hidden"
            name="environment"
            value={selectedSandboxProject.environment}
          />
        {/if}
        <p class="text-xs text-slate-500">
          {t("saas.quickstart.autoIssueHint")}
        </p>
        <button
          class="btn btn-secondary w-full"
          disabled={sandboxProjects.length === 0}
        >
          {t("saas.quickstart.submit")}
        </button>
      </form>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-3">
    <form
      method="post"
      action="?/linkTenant"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="totpCode" value={stepUpCode} />
      <h2 class="text-lg font-semibold">{t("saas.agentTree.title")}</h2>
      <p class="mt-2 text-sm text-slate-500">
        {t("saas.agentTree.description")}
      </p>
      <div class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="parentTenantId">
          {#each tenants as item}
            <option value={item.tenant.id}
              >{item.tenant.name} · {t("saas.agentTree.parentSuffix")}</option
            >
          {/each}
        </select>
        <select class="select select-bordered w-full" name="childTenantId">
          {#each tenants as item}
            <option value={item.tenant.id}
              >{item.tenant.name} · {t("saas.agentTree.childSuffix")}</option
            >
          {/each}
        </select>
        <select class="select select-bordered w-full" name="linkType">
          <option value="agent_client">
            {translateTenantLinkType("agent_client")}
          </option>
        </select>
      </div>
      <button class="btn btn-primary mt-5 w-full">
        {t("saas.agentTree.submit")}
      </button>
    </form>

    <form
      method="post"
      action="?/issueKey"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="totpCode" value={stepUpCode} />
      <h2 class="text-lg font-semibold">{t("saas.issueKeyForm.title")}</h2>
      <div class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="projectId">
          {#each projects as project}
            <option value={project.id}
              >{project.name} · {translateProjectEnvironment(
                project.environment,
              )}</option
            >
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="label"
          placeholder={t("saas.issueKeyForm.labelPlaceholder")}
        />
        <input
          class="input input-bordered w-full"
          type="datetime-local"
          name="expiresAt"
        />
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="catalog:read"
            checked
          />
          <span>catalog:read</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="fairness:read"
            checked
          />
          <span>fairness:read</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="reward:write"
            checked
          />
          <span>reward:write</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="draw:write"
          />
          <span>draw:write (legacy)</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="ledger:read"
            checked
          />
          <span>ledger:read</span>
        </label>
      </div>
      <button class="btn btn-primary mt-5 w-full">
        {t("saas.issueKeyForm.submit")}
      </button>
    </form>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">{t("saas.billingOps.title")}</h2>
        <a href="/saas/disputes" class="btn btn-outline btn-sm">
          Billing disputes
        </a>
      </div>
      <form method="post" action="?/createBillingRun" class="mt-4 space-y-3">
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            type="datetime-local"
            name="periodStart"
          />
          <input
            class="input input-bordered w-full"
            type="datetime-local"
            name="periodEnd"
          />
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="finalize" checked />
          <span>{t("saas.billingOps.finalizeInvoice")}</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="sendInvoice" />
          <span>{t("saas.billingOps.sendInvoice")}</span>
        </label>
        <button class="btn btn-secondary w-full">
          {t("saas.billingOps.createBillingRun")}
        </button>
      </form>

      <div class="my-5 border-t border-slate-200"></div>

      <form method="post" action="?/createTopUp" class="space-y-3">
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="amount"
            value="100"
          />
          <input
            class="input input-bordered w-full"
            name="currency"
            value="USD"
          />
        </div>
        <input
          class="input input-bordered w-full"
          name="note"
          placeholder={t("saas.billingOps.notePlaceholder")}
        />
        <button class="btn btn-secondary w-full">
          {t("saas.billingOps.createManualTopUp")}
        </button>
      </form>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-3">
    <div
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2"
    >
      <h2 class="text-lg font-semibold">{t("saas.tenantsSection.title")}</h2>
      <div class="mt-4 space-y-4">
        {#each tenants as item}
          <article class="rounded-2xl border border-slate-200 p-4">
            <div
              class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold">{item.tenant.name}</h3>
                  <span class="badge badge-outline">
                    {translateTenantStatus(item.tenant.status)}
                  </span>
                  <span class="badge badge-outline"
                    >{item.billing?.planCode
                      ? translateBillingPlan(item.billing.planCode)
                      : t("saas.tenantsSection.unbilled")}</span
                  >
                </div>
                <p class="mt-1 text-sm text-slate-500">
                  {item.tenant.slug} · {item.tenant.billingEmail ??
                    t("saas.tenantsSection.noBillingEmail")} ·
                  {t("saas.tenantsSection.projectsCount")}
                  {item.projectCount} ·
                  {t("saas.tenantsSection.draws30d")}
                  {item.drawCount30d}
                </p>
                {#if item.billing}
                  <p class="mt-2 text-sm text-slate-600">
                    {item.billing.currency} · {t("saas.tenantsSection.baseFee")}
                    {item.billing.baseMonthlyFee} ·
                    {t("saas.tenantsSection.drawFee")}
                    {item.billing.drawFee} ·
                    {translateCollectionMethod(item.billing.collectionMethod)} ·
                    {t("saas.tenantsSection.autoBilling")}
                    {translateBoolean(item.billing.autoBillingEnabled)}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    {formatDecisionPricing(item.billing.decisionPricing)}
                  </p>
                {/if}
              </div>
              <div class="flex flex-col gap-2 lg:min-w-[18rem]">
                <a
                  class="btn btn-sm btn-primary"
                  href={`/saas/${item.tenant.slug}/usage`}
                >
                  {t("saas.tenantsSection.usageAlerts")}
                </a>
                <form
                  method="post"
                  action="?/saveBilling"
                  class="grid gap-2 rounded-2xl bg-slate-50 p-3"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <input type="hidden" name="tenantId" value={item.tenant.id} />
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      class="select select-bordered select-sm w-full"
                      name="planCode"
                    >
                      <option
                        selected={item.billing?.planCode === "starter"}
                        value="starter"
                        >{translateBillingPlan("starter")}</option
                      >
                      <option
                        selected={item.billing?.planCode === "growth"}
                        value="growth">{translateBillingPlan("growth")}</option
                      >
                      <option
                        selected={item.billing?.planCode === "enterprise"}
                        value="enterprise"
                        >{translateBillingPlan("enterprise")}</option
                      >
                    </select>
                    <input
                      class="input input-bordered input-sm w-full"
                      name="currency"
                      value={item.billing?.currency ?? "USD"}
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      class="input input-bordered input-sm w-full"
                      name="baseMonthlyFee"
                      placeholder={t("saas.tenantsSection.baseMonthlyPlaceholder")}
                      value={item.billing?.baseMonthlyFee ?? "0"}
                    />
                    <input
                      class="input input-bordered input-sm w-full"
                      name="drawFee"
                      placeholder={t("saas.tenantsSection.drawFeePlaceholder")}
                      value={item.billing?.drawFee ?? "0.0000"}
                    />
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <input
                      class="input input-bordered input-sm w-full"
                      name="decisionRejectFee"
                      placeholder={t("saas.tenantsSection.decisionRejectPlaceholder")}
                      value={item.billing?.decisionPricing.reject ??
                        item.billing?.drawFee ??
                        "0.0000"}
                    />
                    <input
                      class="input input-bordered input-sm w-full"
                      name="decisionMuteFee"
                      placeholder={t("saas.tenantsSection.decisionMutePlaceholder")}
                      value={item.billing?.decisionPricing.mute ??
                        item.billing?.drawFee ??
                        "0.0000"}
                    />
                    <input
                      class="input input-bordered input-sm w-full"
                      name="decisionPayoutFee"
                      placeholder={t("saas.tenantsSection.decisionPayoutPlaceholder")}
                      value={item.billing?.decisionPricing.payout ??
                        item.billing?.drawFee ??
                        "0.0000"}
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      class="select select-bordered select-sm w-full"
                      name="collectionMethod"
                    >
                      <option
                        selected={item.billing?.collectionMethod ===
                          "send_invoice"}
                        value="send_invoice"
                        >{translateCollectionMethod("send_invoice")}</option
                      >
                      <option
                        selected={item.billing?.collectionMethod ===
                          "charge_automatically"}
                        value="charge_automatically"
                        >{translateCollectionMethod(
                          "charge_automatically",
                        )}</option
                      >
                    </select>
                    <input
                      class="input input-bordered input-sm w-full"
                      name="portalConfigurationId"
                      value={item.billing?.portalConfigurationId ?? ""}
                      placeholder={t(
                        "saas.tenantsSection.portalConfigurationPlaceholder",
                      )}
                    />
                  </div>
                  <input
                    class="input input-bordered input-sm w-full"
                    name="stripeCustomerId"
                    value={item.billing?.stripeCustomerId ?? ""}
                    placeholder={t(
                      "saas.tenantsSection.stripeCustomerPlaceholder",
                    )}
                  />
                  <label class="label cursor-pointer justify-start gap-3 py-0">
                    <input
                      class="checkbox checkbox-sm"
                      type="checkbox"
                      name="autoBillingEnabled"
                      checked={item.billing?.autoBillingEnabled ?? false}
                    />
                    <span>{t("saas.tenantsSection.autoMonthClose")}</span>
                  </label>
                  <label class="label cursor-pointer justify-start gap-3 py-0">
                    <input
                      class="checkbox checkbox-sm"
                      type="checkbox"
                      name="isBillable"
                      checked={item.billing?.isBillable ?? true}
                    />
                    <span>{t("saas.tenantsSection.billable")}</span>
                  </label>
                  <button class="btn btn-sm btn-secondary">
                    {t("saas.tenantsSection.saveBilling")}
                  </button>
                </form>
                <form
                  method="post"
                  action="?/saveRiskEnvelope"
                  class="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3"
                >
                  <input type="hidden" name="tenantId" value={item.tenant.id} />
                  <div>
                    <p class="text-sm font-medium text-amber-950">
                      {t("saas.riskEnvelope.title")}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-amber-800">
                      {t("saas.riskEnvelope.description")}
                    </p>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      class="input input-bordered input-sm w-full"
                      name="dailyBudgetCap"
                      value={item.tenant.riskEnvelope.dailyBudgetCap ?? ""}
                      placeholder={t(
                        "saas.riskEnvelope.dailyBudgetPlaceholder",
                      )}
                    />
                    <input
                      class="input input-bordered input-sm w-full"
                      name="maxSinglePayout"
                      value={item.tenant.riskEnvelope.maxSinglePayout ?? ""}
                      placeholder={t(
                        "saas.riskEnvelope.maxSinglePayoutPlaceholder",
                      )}
                    />
                  </div>
                  <input
                    class="input input-bordered input-sm w-full"
                    name="varianceCap"
                    value={item.tenant.riskEnvelope.varianceCap ?? ""}
                    placeholder={t("saas.riskEnvelope.varianceCapPlaceholder")}
                  />
                  <label class="label cursor-pointer justify-start gap-3 py-0">
                    <input
                      class="checkbox checkbox-sm"
                      type="checkbox"
                      name="emergencyStop"
                      checked={item.tenant.riskEnvelope.emergencyStop}
                    />
                    <span>{t("saas.riskEnvelope.emergencyStop")}</span>
                  </label>
                  <input
                    class="input input-bordered input-sm w-full"
                    name="reason"
                    placeholder={t("saas.riskEnvelope.reasonPlaceholder")}
                  />
                  <button class="btn btn-sm btn-warning">
                    {t("saas.riskEnvelope.submit")}
                  </button>
                </form>
                <div class="grid grid-cols-2 gap-2">
                  <form method="post" action="?/openBillingSetup">
                    <input
                      type="hidden"
                      name="tenantId"
                      value={item.tenant.id}
                    />
                    <button class="btn btn-sm w-full">
                      {t("saas.tenantsSection.bindCard")}
                    </button>
                  </form>
                  <form method="post" action="?/openBillingPortal">
                    <input
                      type="hidden"
                      name="tenantId"
                      value={item.tenant.id}
                    />
                    <button class="btn btn-sm w-full">
                      {t("saas.tenantsSection.openPortal")}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {#if tenantLinkChildren(item.tenant.id).length > 0}
              <div class="mt-4 rounded-2xl bg-slate-50 p-3">
                <p class="text-sm font-medium text-slate-700">
                  {t("saas.tenantsSection.agentTreeTitle")}
                </p>
                <div class="mt-2 space-y-2">
                  {#each tenantLinkChildren(item.tenant.id) as link}
                    <div
                      class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <span
                        >{tenantName(link.parentTenantId)} → {tenantName(
                          link.childTenantId,
                        )}</span
                      >
                      <form method="post" action="?/unlinkTenant">
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="linkId" value={link.id} />
                        <button class="btn btn-xs btn-ghost text-rose-600"
                          >{t("saas.tenantsSection.unlink")}</button
                        >
                      </form>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="rounded-2xl bg-slate-50 p-3">
                <div
                  class="flex items-center justify-between gap-3 text-sm font-medium text-slate-700"
                >
                  <span>{t("saas.agentControls.title")}</span>
                  <span class="text-xs text-slate-500">
                    {tenantAgentControls(item.tenant.id).length}
                    {t("saas.agentControls.activeCountSuffix")}
                  </span>
                </div>

                {#if tenantAgentControls(item.tenant.id).length === 0}
                  <p class="mt-2 text-sm text-slate-500">
                    {t("saas.agentControls.empty")}
                  </p>
                {:else}
                  <div class="mt-3 space-y-2">
                    {#each tenantAgentControls(item.tenant.id) as control}
                      <div
                        class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="font-medium text-slate-900"
                              >{control.agentId}</span
                            >
                            <span
                              class={`badge ${
                                control.mode === "blocked"
                                  ? "badge-error badge-outline"
                                  : "badge-warning badge-outline"
                              }`}
                            >
                              {translateEnum(
                                "saas.agentControls.modes",
                                control.mode,
                              )}
                            </span>
                            {#if control.budgetMultiplier !== null}
                              <span class="badge badge-outline">
                                {t("saas.agentControls.budgetMultiplier")}
                                {control.budgetMultiplier}
                              </span>
                            {/if}
                          </div>
                          <p class="mt-1 text-slate-600">{control.reason}</p>
                          <p class="mt-1 text-xs text-slate-400">
                            {t("saas.agentControls.updated")}
                            {formatDate(control.updatedAt)}
                          </p>
                        </div>
                        <form method="post" action="?/deleteAgentControl">
                          <input
                            type="hidden"
                            name="tenantId"
                            value={item.tenant.id}
                          />
                          <input
                            type="hidden"
                            name="controlId"
                            value={control.id}
                          />
                          <button class="btn btn-xs btn-ghost text-rose-600"
                            >{t("saas.agentControls.remove")}</button
                          >
                        </form>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <form
                method="post"
                action="?/saveAgentControl"
                class="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <input type="hidden" name="tenantId" value={item.tenant.id} />
                <p class="text-sm font-medium text-slate-800">
                  {t("saas.agentControls.addTitle")}
                </p>
                <input
                  class="input input-bordered input-sm w-full"
                  name="agentId"
                  placeholder={t("saas.agentControls.agentIdPlaceholder")}
                />
                <select
                  class="select select-bordered select-sm w-full"
                  name="mode"
                >
                  <option value="blocked">
                    {translateEnum("saas.agentControls.modes", "blocked")}
                  </option>
                  <option value="throttled">
                    {translateEnum("saas.agentControls.modes", "throttled")}
                  </option>
                </select>
                <input
                  class="input input-bordered input-sm w-full"
                  name="budgetMultiplier"
                  value="0.25"
                  placeholder={t(
                    "saas.agentControls.budgetMultiplierPlaceholder",
                  )}
                />
                <input
                  class="input input-bordered input-sm w-full"
                  name="reason"
                  placeholder={t("saas.agentControls.reasonPlaceholder")}
                />
                <p class="text-xs leading-5 text-slate-500">
                  {t("saas.agentControls.modeDescription")}
                </p>
                <button class="btn btn-sm btn-secondary">
                  {t("saas.agentControls.save")}
                </button>
              </form>
            </div>

            {#if projectBillingHints(item.tenant.id).length > 0}
              <div class="mt-4 grid gap-2 md:grid-cols-2">
                {#each projectBillingHints(item.tenant.id) as billingRun}
                  <div
                    class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600"
                  >
                    <p class="font-medium text-slate-800">
                      {t("saas.tenantsSection.recentRun")} #{billingRun.id}
                    </p>
                    <p>
                      {humanizeCode(billingRun.status)} ·
                      {t("saas.tenantsSection.total")}
                      {billingRun.totalAmount}
                      {billingRun.currency}
                    </p>
                    {#if billingRun.decisionBreakdown.length > 0}
                      <p class="text-xs text-slate-500">
                        {formatDecisionBreakdown(billingRun.decisionBreakdown)}
                      </p>
                    {/if}
                    <p>
                      {formatDate(billingRun.periodStart)} → {formatDate(
                        billingRun.periodEnd,
                      )}
                    </p>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.prizeForm.title")}</h2>
      <form method="post" action="?/createPrize" class="mt-4 space-y-3">
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="projectId">
          {#each projects as project}
            <option value={project.id}
              >{project.name} · {translateProjectEnvironment(
                project.environment,
              )}</option
            >
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder={t("saas.prizeForm.namePlaceholder")}
        />
        <div class="grid grid-cols-3 gap-3">
          <input class="input input-bordered w-full" name="stock" value="100" />
          <input class="input input-bordered w-full" name="weight" value="1" />
          <input
            class="input input-bordered w-full"
            name="rewardAmount"
            value="10"
          />
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="isActive" checked />
          <span>{t("saas.prizeForm.active")}</span>
        </label>
        <button class="btn btn-secondary w-full">
          {t("saas.prizeForm.submit")}
        </button>
      </form>
    </div>
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold">{t("saas.projectsSection.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("saas.projectsSection.description")}
        </p>
      </div>
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      {#each projects as project}
        {@const observability = projectObservabilityByProjectId.get(project.id)}
        <article class="rounded-2xl border border-slate-200 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-slate-900">{project.name}</h3>
            <span class="badge badge-outline">
              {translateProjectEnvironment(project.environment)}
            </span>
            <span class="badge badge-outline">
              {translateTenantStatus(project.status)}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500">
            {tenantName(project.tenantId)} · {project.slug} ·
            {t("saas.projectsSection.drawCost")}
            {project.drawCost} ·
            {t("saas.projectsSection.pool")}
            {project.prizePoolBalance}
            {project.currency}
          </p>
          <p class="mt-2 text-sm text-slate-600">
            {t("saas.projectsSection.strategy")}
            {humanizeCode(project.strategy)}
            {JSON.stringify(project.strategyParams ?? {})}
          </p>
          <p class="mt-2 text-sm text-slate-600">
            {t("saas.projectsSection.perKeyQuota")}
            {t("saas.projectsSection.burst")}
            {project.apiRateLimitBurst}/min ·
            {t("saas.projectsSection.hourly")}
            {project.apiRateLimitHourly}/h ·
            {t("saas.projectsSection.daily")}
            {project.apiRateLimitDaily}/day
          </p>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">{t("saas.projectsSection.burst")}</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.burst.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.burst.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                {t("saas.projectsSection.reset")}
                {formatDate(project.apiRateLimitUsage?.aggregate.burst.resetAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">{t("saas.projectsSection.hourly")}</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.hourly.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.hourly.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                {t("saas.projectsSection.reset")}
                {formatDate(
                  project.apiRateLimitUsage?.aggregate.hourly.resetAt,
                )}
              </p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">{t("saas.projectsSection.daily")}</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.daily.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.daily.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                {t("saas.projectsSection.activeKeys")}
                {project.apiRateLimitUsage?.activeKeyCount ?? 0}
              </p>
            </div>
          </div>
          {#if observability}
            <div
              class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
            >
              <div
                class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p class="text-sm font-semibold text-slate-900">
                    {t("saas.observabilitySection.title")}
                  </p>
                  <p class="text-xs text-slate-500">
                    {t("saas.observabilitySection.lastDays")}
                    {observability.window.days} ·
                    {t("saas.observabilitySection.baseline")}
                    {observability.window.baseline}
                  </p>
                </div>
                <p class="text-xs text-slate-500">
                  {observability.summary.totalDrawCount}
                  {t("saas.observabilitySection.draws")} ·
                  {observability.summary.uniquePlayerCount}
                  {t("saas.observabilitySection.players")}
                </p>
              </div>

              <div class="mt-3 grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl bg-white/80 p-3 text-sm">
                  <p class="text-slate-500">
                    {t("saas.observabilitySection.hitRate")}
                  </p>
                  <p class="mt-1 font-medium text-slate-900">
                    {formatPercent(observability.summary.hitRate)}
                  </p>
                  <p
                    class={`text-xs ${driftTone(observability.summary.hitRateDrift)}`}
                  >
                    {t("saas.observabilitySection.expected")}
                    {formatPercent(observability.summary.expectedHitRate)}
                    · {formatSignedPercentPoints(
                      observability.summary.hitRateDrift,
                    )}
                  </p>
                </div>
                <div class="rounded-2xl bg-white/80 p-3 text-sm">
                  <p class="text-slate-500">
                    {t("saas.observabilitySection.payoutRate")}
                  </p>
                  <p class="mt-1 font-medium text-slate-900">
                    {formatPercent(observability.summary.actualPayoutRate)}
                  </p>
                  <p
                    class={`text-xs ${driftTone(
                      observability.summary.payoutRateDrift,
                    )}`}
                  >
                    {t("saas.observabilitySection.expected")}
                    {formatPercent(observability.summary.expectedPayoutRate)} ·
                    {formatSignedPercentPoints(
                      observability.summary.payoutRateDrift,
                    )}
                  </p>
                </div>
                <div class="rounded-2xl bg-white/80 p-3 text-sm">
                  <p class="text-slate-500">
                    {t("saas.observabilitySection.rewardCost")}
                  </p>
                  <p class="mt-1 font-medium text-slate-900">
                    {observability.summary.actualRewardAmount} /
                    {observability.summary.actualDrawCostAmount}
                  </p>
                  <p class="text-xs text-slate-500">
                    {t("saas.observabilitySection.expected")}
                    {observability.summary.expectedRewardAmount}
                    {t("saas.observabilitySection.reward")}
                  </p>
                </div>
              </div>

              <div class="mt-4 space-y-2">
                {#each observability.distribution as bucket}
                  <div
                    class="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 text-sm"
                  >
                    <div>
                      <p class="font-medium text-slate-900">{bucket.label}</p>
                      <p class="text-xs text-slate-500">
                        {t("saas.observabilitySection.actual")}
                        {formatPercent(bucket.actualProbability)} ·
                        {t("saas.observabilitySection.expected")}
                        {formatPercent(bucket.expectedProbability)} ·
                        {bucket.actualDrawCount}
                        {t("saas.observabilitySection.draws")}
                      </p>
                    </div>
                    <div class="text-right">
                      <p
                        class={`font-medium ${driftTone(bucket.probabilityDrift)}`}
                      >
                        {formatSignedPercentPoints(bucket.probabilityDrift)}
                      </p>
                      <p class="text-xs text-slate-500">
                        {t("saas.observabilitySection.reward")}
                        {bucket.actualRewardAmount}
                      </p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">
        {t("saas.outboundWebhookForm.title")}
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        {t("saas.outboundWebhookForm.description")}
      </p>
      <form
        method="post"
        action="?/createOutboundWebhook"
        class="mt-4 space-y-3"
        data-testid="saas-outbound-webhook-create-form"
      >
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <select class="select select-bordered w-full" name="projectId">
          {#each projects as project}
            <option value={project.id}>{projectLabel(project.id)}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="url"
          placeholder={t("saas.outboundWebhookForm.urlPlaceholder")}
        />
        <input
          class="input input-bordered w-full"
          name="secret"
          placeholder={t("saas.outboundWebhookForm.secretPlaceholder")}
        />
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="isActive" checked />
          <span>{t("saas.outboundWebhookForm.activeImmediately")}</span>
        </label>
        <button class="btn btn-secondary w-full">
          {t("saas.outboundWebhookForm.submit")}
        </button>
      </form>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">
        {t("saas.outboundWebhooksSection.title")}
      </h2>
      <div class="mt-4 space-y-3">
        {#if outboundWebhooks.length === 0}
          <p class="text-sm text-slate-500">
            {t("saas.outboundWebhooksSection.empty")}
          </p>
        {:else}
          {#each outboundWebhooks as webhook}
            <div
              class="rounded-2xl border border-slate-200 p-4"
              data-testid={`saas-outbound-webhook-${webhook.id}`}
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-medium text-slate-900">
                    {projectLabel(webhook.projectId)}
                  </p>
                  <p class="text-sm text-slate-500">
                    {outboundWebhookUrlHost(webhook.url)}
                  </p>
                  <p class="mt-1 text-xs text-slate-400">
                    {webhook.events.join(", ")} · {webhook.secretPreview}
                  </p>
                  <p class="mt-1 text-xs text-slate-400">
                    {t("saas.outboundWebhooksSection.lastDelivered")}
                    {formatDate(webhook.lastDeliveredAt)}
                  </p>
                </div>
                <span class="badge badge-outline">
                  {webhook.isActive
                    ? t("saas.outboundWebhooksSection.active")
                    : t("saas.outboundWebhooksSection.paused")}
                </span>
              </div>

              <form
                method="post"
                action="?/updateOutboundWebhook"
                class="mt-4 space-y-3"
              >
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input
                  type="hidden"
                  name="projectId"
                  value={webhook.projectId}
                />
                <input type="hidden" name="webhookId" value={webhook.id} />
                <input
                  class="input input-bordered input-sm w-full"
                  name="url"
                  value={webhook.url}
                />
                <input
                  class="input input-bordered input-sm w-full"
                  name="secret"
                  placeholder={t(
                    "saas.outboundWebhooksSection.leaveSecretPlaceholder",
                  )}
                />
                <label class="label cursor-pointer justify-start gap-3">
                  <input
                    class="checkbox checkbox-sm"
                    type="checkbox"
                    name="isActive"
                    checked={webhook.isActive}
                  />
                  <span>{t("saas.outboundWebhooksSection.active")}</span>
                </label>
                <div class="flex items-center justify-between gap-3">
                  <button class="btn btn-sm btn-secondary">
                    {t("saas.outboundWebhooksSection.save")}
                  </button>
                </div>
              </form>

              <form method="post" action="?/deleteOutboundWebhook" class="mt-3">
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input
                  type="hidden"
                  name="projectId"
                  value={webhook.projectId}
                />
                <input type="hidden" name="webhookId" value={webhook.id} />
                <button class="btn btn-sm btn-ghost text-rose-600"
                  >{t("saas.outboundWebhooksSection.delete")}</button
                >
              </form>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.membershipsSection.title")}</h2>
      <div class="mt-4 space-y-2">
        {#each memberships as membership}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-800">
                {membership.adminEmail ?? `admin#${membership.adminId}`}
              </p>
              <p class="text-slate-500">
                {tenantName(membership.tenantId)} · {translateRole(membership.role)}
              </p>
            </div>
            <form method="post" action="?/deleteMembership">
              <input type="hidden" name="totpCode" value={stepUpCode} />
              <input
                type="hidden"
                name="tenantId"
                value={membership.tenantId}
              />
              <input type="hidden" name="membershipId" value={membership.id} />
              <button class="btn btn-xs btn-ghost text-rose-600">
                {t("saas.membershipsSection.remove")}
              </button>
            </form>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.invitesSection.title")}</h2>
      <div class="mt-4 space-y-2">
        {#each invites as invite}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-800">{invite.email}</p>
              <p class="text-slate-500">
                {tenantName(invite.tenantId)} · {translateRole(invite.role)} ·
                {translateInviteStatus(invite.status)}
              </p>
              <p class="text-slate-400">
                {t("saas.invitesSection.expires")} {formatDate(invite.expiresAt)}
              </p>
            </div>
            {#if invite.status === "pending"}
              <form method="post" action="?/revokeInvite">
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input type="hidden" name="tenantId" value={invite.tenantId} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button class="btn btn-xs btn-ghost text-rose-600"
                  >{t("saas.invitesSection.revoke")}</button
                >
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.apiKeysSection.title")}</h2>
      <div class="mt-4 space-y-3">
        {#each apiKeys as apiKey}
          <div class="rounded-2xl border border-slate-200 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-medium text-slate-900">{apiKey.label}</p>
                <p class="mt-1 text-sm text-slate-500">
                  {projectLabel(apiKey.projectId)} · {apiKey.maskedKey}
                </p>
                <p class="mt-1 text-xs text-slate-400">
                  {apiKey.scopes.join(", ")}
                </p>
                <p class="mt-1 text-xs text-slate-400">
                  {t("saas.apiKeysSection.expires")} {formatDate(apiKey.expiresAt)}
                </p>
                {#if apiKey.rotatedToApiKeyId}
                  <p class="mt-1 text-xs text-sky-600">
                    {t("saas.apiKeysSection.rotatedTo")} #{apiKey.rotatedToApiKeyId}
                  </p>
                {/if}
                {#if apiKey.rotatedFromApiKeyId}
                  <p class="mt-1 text-xs text-sky-600">
                    {t("saas.apiKeysSection.rotatedFrom")} #{apiKey.rotatedFromApiKeyId}
                  </p>
                {/if}
                {#if apiKey.lastUsedAt}
                  <p class="mt-1 text-xs text-slate-400">
                    {t("saas.apiKeysSection.lastUsed")} {formatDate(apiKey.lastUsedAt)}
                  </p>
                {/if}
                {#if apiKey.apiRateLimitUsage}
                  <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div
                      class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600"
                    >
                      {t("saas.apiKeysSection.burst")}
                      {apiKey.apiRateLimitUsage.burst.used}/
                      {apiKey.apiRateLimitUsage.burst.limit}
                    </div>
                    <div
                      class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600"
                    >
                      {t("saas.apiKeysSection.hour")}
                      {apiKey.apiRateLimitUsage.hourly.used}/
                      {apiKey.apiRateLimitUsage.hourly.limit}
                    </div>
                    <div
                      class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600"
                    >
                      {t("saas.apiKeysSection.day")}
                      {apiKey.apiRateLimitUsage.daily.used}/
                      {apiKey.apiRateLimitUsage.daily.limit}
                    </div>
                  </div>
                {/if}
              </div>
              {#if !apiKey.revokedAt}
                <div class="space-y-2">
                  <form method="post" action="?/rotateKey" class="space-y-2">
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input
                      type="hidden"
                      name="projectId"
                      value={apiKey.projectId}
                    />
                    <input type="hidden" name="keyId" value={apiKey.id} />
                    {#each apiKey.scopes as scope}
                      <input type="hidden" name="scopes" value={scope} />
                    {/each}
                    <input
                      class="input input-bordered input-xs w-full"
                      name="label"
                      placeholder={apiKey.label}
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      type="datetime-local"
                      name="expiresAt"
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="overlapSeconds"
                      value="3600"
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="reason"
                      placeholder={t("saas.apiKeysSection.rotationReasonPlaceholder")}
                    />
                    <button class="btn btn-xs btn-secondary w-full"
                      >{t("saas.apiKeysSection.rotate")}</button
                    >
                  </form>
                  <form method="post" action="?/revokeKey" class="space-y-2">
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input
                      type="hidden"
                      name="projectId"
                      value={apiKey.projectId}
                    />
                    <input type="hidden" name="keyId" value={apiKey.id} />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="reason"
                      placeholder={t("saas.apiKeysSection.revokeReasonPlaceholder")}
                    />
                    <button class="btn btn-xs btn-ghost text-rose-600 w-full"
                      >{t("saas.apiKeysSection.revoke")}</button
                    >
                  </form>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">
        {t("saas.projectPrizesSection.title")}
      </h2>
      <div class="mt-4 space-y-3">
        {#each projectPrizes as prize}
          <form
            method="post"
            action="?/updatePrize"
            class="rounded-2xl border border-slate-200 p-4"
          >
            <input type="hidden" name="totpCode" value={stepUpCode} />
            <input type="hidden" name="projectId" value={prize.projectId} />
            <input type="hidden" name="prizeId" value={prize.id} />
            <p class="mb-3 text-sm text-slate-500">
              {projectLabel(prize.projectId)}
            </p>
            <div class="grid gap-3">
              <input
                class="input input-bordered w-full"
                name="name"
                value={prize.name}
              />
              <div class="grid grid-cols-3 gap-3">
                <input
                  class="input input-bordered w-full"
                  name="stock"
                  value={prize.stock}
                />
                <input
                  class="input input-bordered w-full"
                  name="weight"
                  value={prize.weight}
                />
                <input
                  class="input input-bordered w-full"
                  name="rewardAmount"
                  value={prize.rewardAmount}
                />
              </div>
              <label class="label cursor-pointer justify-start gap-3">
                <input
                  class="checkbox"
                  type="checkbox"
                  name="isActive"
                  checked={prize.isActive}
                />
                <span>{t("saas.projectPrizesSection.active")}</span>
              </label>
            </div>
            <div class="mt-4 flex gap-3">
              <button class="btn btn-sm btn-secondary">
                {t("saas.projectPrizesSection.save")}
              </button>
              <button
                class="btn btn-sm"
                type="submit"
                formaction="?/deletePrize"
                >{t("saas.projectPrizesSection.delete")}</button
              >
            </div>
          </form>
        {/each}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.billingRunsSection.title")}</h2>
      <div class="mt-4 space-y-3">
        {#each billingRuns as billingRun}
          <div class="rounded-2xl border border-slate-200 p-4">
            <div
              class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <p class="font-medium text-slate-900">
                  #{billingRun.id} · {tenantName(billingRun.tenantId)}
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  {humanizeCode(billingRun.status)} · {billingRun.totalAmount}
                  {billingRun.currency} · {t("saas.billingRunsSection.draws")}
                  {billingRun.drawCount}
                </p>
                {#if billingRun.decisionBreakdown.length > 0}
                  <p class="text-xs text-slate-500">
                    {formatDecisionBreakdown(billingRun.decisionBreakdown)}
                  </p>
                {/if}
                <p class="text-xs text-slate-400">
                  {formatDate(billingRun.periodStart)} → {formatDate(
                    billingRun.periodEnd,
                  )}
                </p>
              </div>
              <div class="grid gap-2">
                <form
                  method="post"
                  action="?/syncBillingRun"
                  class="flex flex-wrap gap-2"
                >
                  <input type="hidden" name="totpCode" value={stepUpCode} />
                  <input
                    type="hidden"
                    name="billingRunId"
                    value={billingRun.id}
                  />
                  <label class="label cursor-pointer gap-2 py-0 text-xs">
                    <input
                      class="checkbox checkbox-xs"
                      type="checkbox"
                      name="finalize"
                      checked
                    />
                    <span>{t("saas.billingRunsSection.finalize")}</span>
                  </label>
                  <label class="label cursor-pointer gap-2 py-0 text-xs">
                    <input
                      class="checkbox checkbox-xs"
                      type="checkbox"
                      name="sendInvoice"
                    />
                    <span>{t("saas.billingRunsSection.send")}</span>
                  </label>
                  <button class="btn btn-xs btn-secondary">
                    {t("saas.billingRunsSection.sync")}
                  </button>
                </form>
                <div class="flex flex-wrap gap-2">
                  <form method="post" action="?/refreshBillingRun">
                    <input
                      type="hidden"
                      name="billingRunId"
                      value={billingRun.id}
                    />
                    <button class="btn btn-xs">
                      {t("saas.billingRunsSection.refresh")}
                    </button>
                  </form>
                  <form
                    method="post"
                    action="?/settleBillingRun"
                    class="flex items-center gap-2"
                  >
                    <input type="hidden" name="totpCode" value={stepUpCode} />
                    <input
                      type="hidden"
                      name="billingRunId"
                      value={billingRun.id}
                    />
                    <label class="label cursor-pointer gap-2 py-0 text-xs">
                      <input
                        class="checkbox checkbox-xs"
                        type="checkbox"
                        name="paidOutOfBand"
                      />
                      <span>{t("saas.billingRunsSection.paidOutOfBand")}</span>
                    </label>
                    <button class="btn btn-xs">
                      {t("saas.billingRunsSection.settle")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">
        {t("saas.webhookQueueSection.title")}
      </h2>
      <div class="mt-4 space-y-3">
        {#each webhookEvents as event}
          <div class="rounded-2xl border border-slate-200 p-4 text-sm">
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium text-slate-900">{event.eventType}</p>
              <span class="badge badge-outline">{humanizeCode(event.status)}</span>
            </div>
            <p class="mt-1 text-slate-500">
              {t("saas.webhookQueueSection.event")} {event.eventId}
            </p>
            <p class="mt-1 text-slate-500">
              {t("saas.webhookQueueSection.tenant")} {event.tenantId ?? "—"} ·
              {t("saas.webhookQueueSection.billingRun")} {event.billingRunId ??
                "—"} · {t("saas.webhookQueueSection.attempts")} {event.attempts}
            </p>
            <p class="mt-1 text-slate-400">
              {t("saas.webhookQueueSection.next")}
              {formatDate(event.nextAttemptAt)} ·
              {t("saas.webhookQueueSection.processed")}
              {formatDate(event.processedAt)}
            </p>
            {#if event.lastError}
              <p class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                {event.lastError}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-lg font-semibold">
      {t("saas.outboundDeliveriesSection.title")}
    </h2>
    <div class="mt-4 grid gap-3 xl:grid-cols-2">
      {#if outboundDeliveries.length === 0}
        <p class="text-sm text-slate-500">
          {t("saas.outboundDeliveriesSection.empty")}
        </p>
      {:else}
        {#each outboundDeliveries as delivery}
          <div
            class="rounded-2xl border border-slate-200 p-4 text-sm"
            data-testid={`saas-outbound-delivery-${delivery.id}`}
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium text-slate-900">
                  {projectLabel(delivery.projectId)}
                </p>
                <p class="text-slate-500">
                  {humanizeCode(delivery.eventType)} ·
                  {t("saas.outboundDeliveriesSection.event")} {delivery.eventId}
                </p>
              </div>
              <span class="badge badge-outline">{humanizeCode(delivery.status)}</span>
            </div>
            <p class="mt-2 text-slate-500">
              {t("saas.outboundDeliveriesSection.webhook")} #{delivery.webhookId}
              · {t("saas.outboundDeliveriesSection.draw")} #{delivery.drawRecordId ??
                "—"} · {t("saas.outboundDeliveriesSection.attempts")}
              {delivery.attempts}
            </p>
            <p class="mt-1 text-slate-400">
              {t("saas.outboundDeliveriesSection.next")}
              {formatDate(delivery.nextAttemptAt)} ·
              {t("saas.outboundDeliveriesSection.delivered")}
              {formatDate(delivery.deliveredAt)}
            </p>
            <p class="mt-1 text-slate-400">
              {t("saas.outboundDeliveriesSection.http")}
              {delivery.lastHttpStatus ?? "—"}
            </p>
            {#if delivery.lastError}
              <p class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                {delivery.lastError}
              </p>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">{t("saas.topUpsSection.title")}</h2>
      <div class="mt-4 space-y-2">
        {#each topUps as topUp}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-900">
                {tenantName(topUp.tenantId)} · {topUp.amount}
                {topUp.currency}
              </p>
              <p class="text-slate-500">
                {humanizeCode(topUp.status)} ·
                {topUp.note ?? t("saas.topUpsSection.noNote")}
              </p>
            </div>
            {#if topUp.status !== "synced"}
              <form method="post" action="?/syncTopUp">
                <input type="hidden" name="totpCode" value={stepUpCode} />
                <input type="hidden" name="topUpId" value={topUp.id} />
                <button class="btn btn-xs btn-secondary">
                  {t("saas.topUpsSection.sync")}
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">
        {t("saas.recentUsageSection.title")}
      </h2>
      <div class="mt-4 space-y-2">
        {#each recentUsage as usage}
          <div class="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
            <p class="font-medium text-slate-900">
              {tenantName(usage.tenantId)} · {projectLabel(usage.projectId)}
            </p>
            <p class="text-slate-500">
              {translateProjectEnvironment(usage.environment)} ·
              {humanizeCode(usage.eventType)}
              {#if usage.decisionType}
                · {humanizeCode(usage.decisionType)}
              {/if}
              · {t("saas.recentUsageSection.units")} {usage.units} ·
              {t("saas.recentUsageSection.amount")} {usage.amount}
              {usage.currency}
            </p>
            <p class="text-slate-400">{formatDate(usage.createdAt)}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>

<ConfirmDialog
  open={activeBreakGlassPolicy !== null}
  title={activeBreakGlassPolicy?.title ?? t("saas.confirmDialog.title")}
  description={activeBreakGlassPolicy?.description ??
    t("saas.confirmDialog.description")}
  bind:breakGlassCode
  breakGlassLabel={t("login.breakGlassCode")}
  breakGlassPlaceholder={t("login.breakGlassPlaceholder")}
  confirmLabel={activeBreakGlassPolicy?.confirmLabel ?? t("saas.confirmDialog.confirm")}
  cancelLabel={t("saas.confirmDialog.cancel")}
  error={breakGlassError}
  stepUpHint={breakGlassStepUpHint}
  on:cancel={closeBreakGlassDialog}
  on:confirm={confirmBreakGlassDialog}
/>
