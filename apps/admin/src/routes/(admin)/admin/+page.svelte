<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  interface Prize {
    id: number
    name: string
    stock: number
    weight: number
    poolThreshold: string
    userPoolThreshold: string
    rewardAmount: string
    payoutBudget: string
    payoutPeriodDays: number
    isActive: boolean
  }

  interface AnalyticsSummary {
    totalDrawCount: number
    wonCount: number
    missCount: number
    winRate: number
    systemPoolBalance: string
    topSpenders: { userId: number; spent: number }[]
  }

  interface SystemConfig {
    poolBalance: string
    drawCost: string
    weightJitterEnabled: boolean
    weightJitterPct: string
    bonusAutoReleaseEnabled: boolean
    bonusUnlockWagerRatio: string
    authFailureWindowMinutes: string
    authFailureFreezeThreshold: string
    adminFailureFreezeThreshold: string
  }

  interface PaymentProviderRecord {
    id: number
    name: string
    providerType: string
    priority: number
    isActive: boolean
    isCircuitBroken: boolean
    circuitBrokenAt: string | null
    circuitBreakReason: string | null
    supportedFlows: Array<"deposit" | "withdrawal">
    executionMode: "manual" | "automated"
    adapter: string | null
    configViolations: { code: string; path: string; message: string }[]
  }

  interface ChangeRequestRecord {
    id: number
    changeType: "system_config_update" | "payment_provider_upsert"
    status: "draft" | "pending_approval" | "approved" | "published" | "rejected"
    targetType: string
    targetId: number | null
    reason: string | null
    requiresSecondConfirmation: boolean
    requiresMfa: boolean
    createdByAdminId: number
    submittedByAdminId: number | null
    approvedByAdminId: number | null
    publishedByAdminId: number | null
    rejectedByAdminId: number | null
    createdAt: string
    updatedAt: string
    submittedAt: string | null
    approvedAt: string | null
    publishedAt: string | null
    rejectedAt: string | null
    summary: string
    changePayload: Record<string, unknown>
    confirmationPhrases: {
      submit: string | null
      publish: string | null
    }
  }

  interface CurrentAdmin {
    adminId: number
    userId: number
    email: string
    mfaEnabled: boolean
    mfaRecoveryMode: "none" | "recovery_code" | "break_glass"
  }

  interface MfaEnrollment {
    secret: string
    otpauthUrl: string
    enrollmentToken: string
  }

  interface MfaStatus {
    mfaEnabled: boolean
    recoveryCodesRemaining: number
    recoveryCodesGeneratedAt: string | null
    breakGlassConfigured: boolean
  }

  interface PageData {
    admin?: CurrentAdmin | null
    prizes: Prize[]
    analytics: AnalyticsSummary | null
    config: SystemConfig | null
    providers: PaymentProviderRecord[]
    changeRequests: ChangeRequestRecord[]
    mfaStatus: MfaStatus | null
    error: string | null
  }

  let { data }: { data: PageData } = $props()

  let createForm = $state({
    name: "",
    stock: "0",
    weight: "1",
    poolThreshold: "0",
    userPoolThreshold: "0",
    rewardAmount: "0",
    payoutBudget: "0",
    payoutPeriodDays: "1",
    isActive: true,
  })

  let editForm = $state<(typeof createForm & { id: number }) | null>(null)
  let configForm = $state({
    poolBalance: "0",
    drawCost: "0",
    weightJitterEnabled: false,
    weightJitterPct: "0.05",
    bonusAutoReleaseEnabled: false,
    bonusUnlockWagerRatio: "1",
    authFailureWindowMinutes: "15",
    authFailureFreezeThreshold: "8",
    adminFailureFreezeThreshold: "5",
  })
  let selectedProviderId = $state("new")
  let providerForm = $state({
    providerId: "",
    name: "",
    providerType: "manual",
    priority: "100",
    isActive: true,
    supportedFlows: ["deposit"] as Array<"deposit" | "withdrawal">,
    executionMode: "manual" as "manual" | "automated",
    adapter: "",
    reason: "",
  })

  let bonusReleaseForm = $state({
    userId: "",
    amount: "",
  })
  let stepUpCode = $state("")
  let confirmationText = $state("")
  let rejectReason = $state("")
  let changeReason = $state("")
  let mfaEnrollmentCode = $state("")

  const { t } = getContext("i18n") as { t: (key: string) => string }

  const currentAdmin = $derived(data.admin ?? null)
  const analytics = $derived(data.analytics)
  const config = $derived(data.config)
  const providers = $derived(data.providers ?? [])
  const changeRequests = $derived(data.changeRequests ?? [])
  const prizes = $derived(data.prizes)
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

  const requestStatusLabel = (status: ChangeRequestRecord["status"]) => {
    if (status === "pending_approval") return "待审批"
    if (status === "approved") return "待发布"
    if (status === "published") return "已发布"
    if (status === "rejected") return "已驳回"
    return "草稿"
  }

  const requestStatusClass = (status: ChangeRequestRecord["status"]) => {
    if (status === "pending_approval") return "badge-warning"
    if (status === "approved") return "badge-info"
    if (status === "published") return "badge-success"
    if (status === "rejected") return "badge-error"
    return "badge-ghost"
  }

  const formatDateTime = (value: string | null) =>
    value ? new Date(value).toLocaleString() : "—"

  const providerRuntimeLabel = (provider: PaymentProviderRecord) => {
    if (provider.isCircuitBroken) return "已熔断"
    if (provider.isActive) return "运行中"
    return "已停用"
  }

  const providerRuntimeClass = (provider: PaymentProviderRecord) => {
    if (provider.isCircuitBroken) return "badge-error"
    if (provider.isActive) return "badge-success"
    return "badge-ghost"
  }

  const resetProviderForm = () => {
    providerForm.providerId = ""
    providerForm.name = ""
    providerForm.providerType = "manual"
    providerForm.priority = "100"
    providerForm.isActive = true
    providerForm.supportedFlows = ["deposit"]
    providerForm.executionMode = "manual"
    providerForm.adapter = ""
    providerForm.reason = ""
  }

  const startEdit = (prize: Prize) => {
    editForm = {
      id: prize.id,
      name: prize.name,
      stock: String(prize.stock ?? 0),
      weight: String(prize.weight ?? 0),
      poolThreshold: String(prize.poolThreshold ?? "0"),
      userPoolThreshold: String(prize.userPoolThreshold ?? "0"),
      rewardAmount: String(prize.rewardAmount ?? "0"),
      payoutBudget: String(prize.payoutBudget ?? "0"),
      payoutPeriodDays: String(prize.payoutPeriodDays ?? 1),
      isActive: Boolean(prize.isActive),
    }
  }

  $effect(() => {
    if (!config) return
    configForm.poolBalance = String(config.poolBalance ?? "0")
    configForm.drawCost = String(config.drawCost ?? "0")
    configForm.weightJitterEnabled = Boolean(config.weightJitterEnabled)
    configForm.weightJitterPct = String(config.weightJitterPct ?? "0")
    configForm.bonusAutoReleaseEnabled = Boolean(config.bonusAutoReleaseEnabled)
    configForm.bonusUnlockWagerRatio = String(
      config.bonusUnlockWagerRatio ?? "1",
    )
    configForm.authFailureWindowMinutes = String(
      config.authFailureWindowMinutes ?? "15",
    )
    configForm.authFailureFreezeThreshold = String(
      config.authFailureFreezeThreshold ?? "8",
    )
    configForm.adminFailureFreezeThreshold = String(
      config.adminFailureFreezeThreshold ?? "5",
    )
  })

  $effect(() => {
    const provider = providers.find(
      (item) => String(item.id) === selectedProviderId,
    )

    if (!provider) {
      resetProviderForm()
      return
    }

    providerForm.providerId = String(provider.id)
    providerForm.name = provider.name
    providerForm.providerType = provider.providerType
    providerForm.priority = String(provider.priority ?? 100)
    providerForm.isActive = provider.isActive
    providerForm.supportedFlows = [...(provider.supportedFlows ?? [])]
    providerForm.executionMode = provider.executionMode
    providerForm.adapter = provider.adapter ?? ""
    providerForm.reason = ""
  })

  const confirmDelete = (event: SubmitEvent) => {
    if (!confirm(t("admin.confirmDelete"))) {
      event.preventDefault()
    }
  }
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    {t("admin.eyebrow")}
  </p>
  <h1 class="text-3xl font-semibold">{t("admin.heading")}</h1>
  <p class="text-sm text-slate-600">{t("admin.description")}</p>
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

<section class="mt-6 grid gap-6 md:grid-cols-3">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.totalDraws")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.totalDrawCount ?? 0}
      </p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.winRate")}</p>
      <p class="text-2xl font-semibold">{winRateLabel}</p>
    </div>
  </div>
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <p class="text-sm text-slate-500">{t("admin.metrics.poolBalance")}</p>
      <p class="text-2xl font-semibold">
        {analytics?.systemPoolBalance ?? 0}
      </p>
    </div>
  </div>
</section>

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

<section class="mt-6 grid gap-6 lg:grid-cols-2">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="card-title">高风险配置控制面</h2>
          <span class="badge badge-error badge-outline">草稿 / 审批 / 发布</span>
        </div>
        <p class="text-sm text-slate-500">
          系统配置不再直接在线生效。先保存草稿，再提审，审批通过后由具备
          MFA 的管理员发布。
        </p>
      </div>

      <div class="rounded-box border border-error/30 bg-error/5 p-4 text-sm">
        <p class="font-semibold text-error">上线闸门</p>
        <p class="mt-1 text-slate-700">
          敏感字段变更会要求二次确认；发布动作与通道熔断都需要当前
          MFA step-up 码。
        </p>
      </div>

      <form method="post" action="?/configDraft" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="config-pool">
              <span class="label-text">奖池余额</span>
            </label>
            <input
              id="config-pool"
              name="poolBalance"
              type="number"
              class="input input-bordered"
              bind:value={configForm.poolBalance}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-drawcost">
              <span class="label-text">抽奖成本</span>
            </label>
            <input
              id="config-drawcost"
              name="drawCost"
              type="number"
              class="input input-bordered"
              bind:value={configForm.drawCost}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-jitter">
              <span class="label-text">权重抖动百分比</span>
            </label>
            <input
              id="config-jitter"
              name="weightJitterPct"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.weightJitterPct}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-bonus-ratio">
              <span class="label-text">奖励解锁流水倍率</span>
            </label>
            <input
              id="config-bonus-ratio"
              name="bonusUnlockWagerRatio"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.bonusUnlockWagerRatio}
            />
          </div>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="weightJitterEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.weightJitterEnabled}
            />
            <span class="label-text">启用权重抖动</span>
          </label>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="bonusAutoReleaseEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.bonusAutoReleaseEnabled}
            />
            <span class="label-text">启用自动释放奖励余额</span>
          </label>
          <div class="form-control">
            <label class="label" for="config-auth-window">
              <span class="label-text">登录失败窗口（分钟）</span>
            </label>
            <input
              id="config-auth-window"
              name="authFailureWindowMinutes"
              type="number"
              class="input input-bordered"
              bind:value={configForm.authFailureWindowMinutes}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-auth-threshold">
              <span class="label-text">用户失败冻结阈值</span>
            </label>
            <input
              id="config-auth-threshold"
              name="authFailureFreezeThreshold"
              type="number"
              class="input input-bordered"
              bind:value={configForm.authFailureFreezeThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-admin-threshold">
              <span class="label-text">管理员失败冻结阈值</span>
            </label>
            <input
              id="config-admin-threshold"
              name="adminFailureFreezeThreshold"
              type="number"
              class="input input-bordered"
              bind:value={configForm.adminFailureFreezeThreshold}
            />
          </div>
        </div>

        <label class="form-control">
          <span class="label-text mb-2">变更原因</span>
          <textarea
            class="textarea textarea-bordered min-h-24"
            name="changeReason"
            bind:value={changeReason}
            placeholder="说明为什么要调整配置，以及预期影响。"
          ></textarea>
        </label>

        <button class="btn btn-primary" type="submit">保存系统配置草稿</button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.bonus.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.bonus.description")}</p>
      </div>

      <form method="post" action="?/bonusRelease" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="bonus-user-id">
              <span class="label-text">{t("admin.bonus.userId")}</span>
            </label>
            <input
              id="bonus-user-id"
              name="userId"
              type="number"
              class="input input-bordered"
              bind:value={bonusReleaseForm.userId}
              required
            />
          </div>
          <div class="form-control">
            <label class="label" for="bonus-amount">
              <span class="label-text">{t("admin.bonus.amount")}</span>
            </label>
            <input
              id="bonus-amount"
              name="amount"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={bonusReleaseForm.amount}
              placeholder={t("admin.bonus.amountPlaceholder")}
            />
          </div>
        </div>
        <input type="hidden" name="totpCode" value={stepUpCode} />
        <button
          class="btn btn-primary"
          type="submit"
          disabled={configForm.bonusAutoReleaseEnabled}
        >
          {t("admin.bonus.release")}
        </button>
        {#if configForm.bonusAutoReleaseEnabled}
          <p class="text-xs text-slate-500">
            {t("admin.bonus.autoReleaseHint")}
          </p>
        {/if}
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow lg:col-span-2">
    <div class="card-body space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="card-title">支付通道控制</h2>
          <p class="text-sm text-slate-500">
            通道新增、启停、优先级和自动出款模式统一走草稿审批；紧急情况下可直接熔断。
          </p>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="badge badge-outline">审计必留痕</span>
          <span class="badge badge-outline">自动提现发布需 MFA</span>
          <span class="badge badge-outline">熔断可直接执行</span>
        </div>
      </div>

      <form method="post" action="?/providerDraft" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-3">
          <div class="form-control">
            <label class="label" for="provider-select">
              <span class="label-text">编辑目标</span>
            </label>
            <select
              id="provider-select"
              class="select select-bordered"
              bind:value={selectedProviderId}
            >
              <option value="new">新增通道</option>
              {#each providers as provider}
                <option value={String(provider.id)}>
                  #{provider.id} {provider.name}
                </option>
              {/each}
            </select>
          </div>

          <div class="form-control">
            <label class="label" for="provider-name">
              <span class="label-text">通道名称</span>
            </label>
            <input
              id="provider-name"
              name="providerName"
              class="input input-bordered"
              bind:value={providerForm.name}
              required
            />
          </div>

          <div class="form-control">
            <label class="label" for="provider-type">
              <span class="label-text">通道类型</span>
            </label>
            <input
              id="provider-type"
              name="providerType"
              class="input input-bordered"
              bind:value={providerForm.providerType}
              required
            />
          </div>

          <div class="form-control">
            <label class="label" for="provider-priority">
              <span class="label-text">优先级（越小越优先）</span>
            </label>
            <input
              id="provider-priority"
              name="priority"
              type="number"
              class="input input-bordered"
              bind:value={providerForm.priority}
            />
          </div>

          <div class="form-control">
            <label class="label" for="provider-mode">
              <span class="label-text">执行模式</span>
            </label>
            <select
              id="provider-mode"
              name="executionMode"
              class="select select-bordered"
              bind:value={providerForm.executionMode}
            >
              <option value="manual">manual</option>
              <option value="automated">automated</option>
            </select>
          </div>

          <div class="form-control">
            <label class="label" for="provider-adapter">
              <span class="label-text">Adapter</span>
            </label>
            <input
              id="provider-adapter"
              name="adapter"
              class="input input-bordered"
              bind:value={providerForm.adapter}
              placeholder="stripe / bank_proxy / ..."
            />
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-[1fr,1fr,2fr]">
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="providerIsActive"
              class="checkbox checkbox-primary"
              bind:checked={providerForm.isActive}
            />
            <span class="label-text">发布后启用通道</span>
          </label>

          <div class="flex flex-wrap gap-4 rounded-box border border-base-300 p-4">
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="supportedFlows"
                value="deposit"
                class="checkbox checkbox-primary"
                bind:group={providerForm.supportedFlows}
              />
              <span class="label-text">充值</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="supportedFlows"
                value="withdrawal"
                class="checkbox checkbox-primary"
                bind:group={providerForm.supportedFlows}
              />
              <span class="label-text">提现</span>
            </label>
          </div>

          <label class="form-control">
            <span class="label-text mb-2">变更原因</span>
            <textarea
              class="textarea textarea-bordered min-h-24"
              name="providerReason"
              bind:value={providerForm.reason}
              placeholder="说明本次通道调整的业务背景、回滚策略和观察指标。"
            ></textarea>
          </label>
        </div>

        <input type="hidden" name="providerId" value={providerForm.providerId} />
        <button class="btn btn-primary max-w-sm" type="submit">
          保存通道变更草稿
        </button>
      </form>

      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>通道</th>
              <th>状态</th>
              <th>优先级</th>
              <th>流向</th>
              <th>模式</th>
              <th>适配器</th>
              <th>熔断</th>
            </tr>
          </thead>
          <tbody>
            {#if providers.length === 0}
              <tr>
                <td colspan="8" class="text-center text-sm text-slate-500">
                  暂无通道配置。
                </td>
              </tr>
            {:else}
              {#each providers as provider}
                <tr>
                  <td class="font-mono text-xs">#{provider.id}</td>
                  <td>
                    <div class="font-medium">{provider.name}</div>
                    <div class="text-xs text-slate-500">{provider.providerType}</div>
                  </td>
                  <td>
                    <span class={`badge ${providerRuntimeClass(provider)}`}>
                      {providerRuntimeLabel(provider)}
                    </span>
                  </td>
                  <td>{provider.priority}</td>
                  <td>{provider.supportedFlows.join(" / ") || "—"}</td>
                  <td>{provider.executionMode}</td>
                  <td>{provider.adapter ?? "—"}</td>
                  <td class="space-y-2">
                    {#if provider.isCircuitBroken}
                      <div class="text-xs text-slate-500">
                        {formatDateTime(provider.circuitBrokenAt)}
                      </div>
                      <div class="text-xs text-error">
                        {provider.circuitBreakReason ?? "未记录原因"}
                      </div>
                      <form method="post" action="?/resetProviderCircuit">
                        <input type="hidden" name="providerId" value={provider.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          解除熔断
                        </button>
                      </form>
                    {:else}
                      <form method="post" action="?/tripProviderCircuit" class="space-y-2">
                        <input type="hidden" name="providerId" value={provider.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input
                          name="circuitReason"
                          class="input input-bordered input-xs w-full"
                          placeholder="熔断原因"
                        />
                        <button class="btn btn-xs btn-error" type="submit">
                          一键熔断
                        </button>
                      </form>
                    {/if}
                  </td>
                </tr>
                {#if provider.configViolations.length > 0}
                  <tr>
                    <td colspan="8" class="bg-warning/10 text-xs text-warning">
                      {#each provider.configViolations as issue}
                        <div>{issue.path}: {issue.message}</div>
                      {/each}
                    </td>
                  </tr>
                {/if}
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card bg-base-100 shadow lg:col-span-2">
    <div class="card-body space-y-5">
      <div>
        <h2 class="card-title">变更队列</h2>
        <p class="text-sm text-slate-500">
          所有配置和通道修改都必须经过这里的状态流转。敏感请求在提交和发布时需要二次确认。
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-2">二次确认口令</span>
          <input
            class="input input-bordered font-mono"
            bind:value={confirmationText}
            placeholder="例如 SUBMIT 12 / PUBLISH 12"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">驳回原因 / 熔断说明</span>
          <input
            class="input input-bordered"
            bind:value={rejectReason}
            placeholder="写清楚拒绝原因或临时处置说明。"
          />
        </label>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>摘要</th>
              <th>状态</th>
              <th>风险</th>
              <th>创建</th>
              <th>审批</th>
              <th>发布</th>
            </tr>
          </thead>
          <tbody>
            {#if changeRequests.length === 0}
              <tr>
                <td colspan="7" class="text-center text-sm text-slate-500">
                  暂无待处理的配置请求。
                </td>
              </tr>
            {:else}
              {#each changeRequests as request}
                <tr>
                  <td class="font-mono text-xs">#{request.id}</td>
                  <td class="min-w-80">
                    <div class="font-medium">{request.summary}</div>
                    <div class="mt-1 text-xs text-slate-500">
                      原因：{request.reason ?? "未填写"}
                    </div>
                    {#if request.requiresSecondConfirmation}
                      <div class="mt-2 text-xs text-warning">
                        提交口令：{request.confirmationPhrases.submit ?? "—"}；
                        发布口令：{request.confirmationPhrases.publish ?? "—"}
                      </div>
                    {/if}
                  </td>
                  <td>
                    <span class={`badge ${requestStatusClass(request.status)}`}>
                      {requestStatusLabel(request.status)}
                    </span>
                  </td>
                  <td class="space-y-2 text-xs">
                    <div>
                      <span
                        class={`badge ${
                          request.requiresSecondConfirmation
                            ? "badge-warning"
                            : "badge-ghost"
                        }`}
                      >
                        {request.requiresSecondConfirmation ? "二次确认" : "普通"}
                      </span>
                    </div>
                    <div>
                      <span
                        class={`badge ${
                          request.requiresMfa ? "badge-error" : "badge-ghost"
                        }`}
                      >
                        {request.requiresMfa ? "发布需 MFA" : "标准发布"}
                      </span>
                    </div>
                  </td>
                  <td class="text-xs text-slate-500">
                    <div>Admin #{request.createdByAdminId}</div>
                    <div>{formatDateTime(request.createdAt)}</div>
                  </td>
                  <td class="space-y-2">
                    {#if request.status === "draft"}
                      <form method="post" action="?/submitChangeRequest">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input
                          type="hidden"
                          name="confirmationText"
                          value={confirmationText}
                        />
                        <button class="btn btn-xs btn-outline" type="submit">
                          提交审批
                        </button>
                      </form>
                    {:else if request.status === "pending_approval"}
                      <form method="post" action="?/approveChangeRequest">
                        <input type="hidden" name="requestId" value={request.id} />
                        <button class="btn btn-xs btn-info" type="submit">
                          批准
                        </button>
                      </form>
                    {/if}

                    {#if request.status !== "published" && request.status !== "rejected"}
                      <form method="post" action="?/rejectChangeRequest">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="rejectReason" value={rejectReason} />
                        <button class="btn btn-xs btn-ghost text-error" type="submit">
                          驳回
                        </button>
                      </form>
                    {/if}
                  </td>
                  <td class="space-y-2">
                    {#if request.status === "approved"}
                      <form method="post" action="?/publishChangeRequest">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input
                          type="hidden"
                          name="confirmationText"
                          value={confirmationText}
                        />
                        <button
                          class="btn btn-xs btn-primary"
                          type="submit"
                          disabled={!mfaEnabled}
                        >
                          发布到生产
                        </button>
                      </form>
                    {/if}

                    <div class="text-xs text-slate-500">
                      {request.approvedAt
                        ? `审批：${formatDateTime(request.approvedAt)}`
                        : "审批：—"}
                    </div>
                    <div class="text-xs text-slate-500">
                      {request.publishedAt
                        ? `发布：${formatDateTime(request.publishedAt)}`
                        : "发布：—"}
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.create.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.create.description")}</p>
      </div>

      <form method="post" action="?/create" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="create-name">
              <span class="label-text">{t("admin.form.name")}</span>
            </label>
            <input
              id="create-name"
              name="name"
              class="input input-bordered"
              bind:value={createForm.name}
              required
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-stock">
              <span class="label-text">{t("admin.form.stock")}</span>
            </label>
            <input
              id="create-stock"
              name="stock"
              type="number"
              class="input input-bordered"
              bind:value={createForm.stock}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-weight">
              <span class="label-text">{t("admin.form.weight")}</span>
            </label>
            <input
              id="create-weight"
              name="weight"
              type="number"
              class="input input-bordered"
              bind:value={createForm.weight}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-threshold">
              <span class="label-text">{t("admin.form.poolThreshold")}</span>
            </label>
            <input
              id="create-threshold"
              name="poolThreshold"
              type="number"
              class="input input-bordered"
              bind:value={createForm.poolThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-user-threshold">
              <span class="label-text">{t("admin.form.userPoolThreshold")}</span
              >
            </label>
            <input
              id="create-user-threshold"
              name="userPoolThreshold"
              type="number"
              class="input input-bordered"
              bind:value={createForm.userPoolThreshold}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-reward">
              <span class="label-text">{t("admin.form.rewardAmount")}</span>
            </label>
            <input
              id="create-reward"
              name="rewardAmount"
              type="number"
              class="input input-bordered"
              bind:value={createForm.rewardAmount}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-budget">
              <span class="label-text">{t("admin.form.payoutBudget")}</span>
            </label>
            <input
              id="create-budget"
              name="payoutBudget"
              type="number"
              class="input input-bordered"
              bind:value={createForm.payoutBudget}
            />
          </div>
          <div class="form-control">
            <label class="label" for="create-period">
              <span class="label-text">{t("admin.form.payoutPeriodDays")}</span>
            </label>
            <input
              id="create-period"
              name="payoutPeriodDays"
              type="number"
              class="input input-bordered"
              bind:value={createForm.payoutPeriodDays}
            />
          </div>
          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              name="isActive"
              class="checkbox checkbox-primary"
              bind:checked={createForm.isActive}
            />
            <span class="label-text">{t("admin.form.isActive")}</span>
          </label>
        </div>
        <button class="btn btn-primary" type="submit">
          {t("admin.create.submit")}
        </button>
      </form>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-4">
      <div>
        <h2 class="card-title">{t("admin.edit.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.edit.description")}</p>
      </div>

      {#if editForm}
        <form method="post" action="?/update" class="grid gap-4">
          <input type="hidden" name="id" value={editForm.id} />
          <div class="grid gap-4 md:grid-cols-2">
            <div class="form-control">
              <label class="label" for="edit-name">
                <span class="label-text">{t("admin.form.name")}</span>
              </label>
              <input
                id="edit-name"
                name="name"
                class="input input-bordered"
                bind:value={editForm.name}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-stock">
                <span class="label-text">{t("admin.form.stock")}</span>
              </label>
              <input
                id="edit-stock"
                name="stock"
                type="number"
                class="input input-bordered"
                bind:value={editForm.stock}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-weight">
                <span class="label-text">{t("admin.form.weight")}</span>
              </label>
              <input
                id="edit-weight"
                name="weight"
                type="number"
                class="input input-bordered"
                bind:value={editForm.weight}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-threshold">
                <span class="label-text">{t("admin.form.poolThreshold")}</span>
              </label>
              <input
                id="edit-threshold"
                name="poolThreshold"
                type="number"
                class="input input-bordered"
                bind:value={editForm.poolThreshold}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-user-threshold">
                <span class="label-text"
                  >{t("admin.form.userPoolThreshold")}</span
                >
              </label>
              <input
                id="edit-user-threshold"
                name="userPoolThreshold"
                type="number"
                class="input input-bordered"
                bind:value={editForm.userPoolThreshold}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-reward">
                <span class="label-text">{t("admin.form.rewardAmount")}</span>
              </label>
              <input
                id="edit-reward"
                name="rewardAmount"
                type="number"
                class="input input-bordered"
                bind:value={editForm.rewardAmount}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-budget">
                <span class="label-text">{t("admin.form.payoutBudget")}</span>
              </label>
              <input
                id="edit-budget"
                name="payoutBudget"
                type="number"
                class="input input-bordered"
                bind:value={editForm.payoutBudget}
              />
            </div>
            <div class="form-control">
              <label class="label" for="edit-period">
                <span class="label-text"
                  >{t("admin.form.payoutPeriodDays")}</span
                >
              </label>
              <input
                id="edit-period"
                name="payoutPeriodDays"
                type="number"
                class="input input-bordered"
                bind:value={editForm.payoutPeriodDays}
              />
            </div>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary" type="submit">
              {t("admin.edit.save")}
            </button>
            <button
              class="btn btn-outline"
              type="button"
              onclick={() => (editForm = null)}
            >
              {t("admin.edit.cancel")}
            </button>
          </div>
        </form>
      {:else}
        <p class="text-sm text-slate-500">{t("admin.edit.empty")}</p>
      {/if}
    </div>
  </div>
</section>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("admin.table.title")}</h2>
        <p class="text-sm text-slate-500">{t("admin.table.description")}</p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("admin.table.headers.name")}</th>
            <th>{t("admin.table.headers.stock")}</th>
            <th>{t("admin.table.headers.weight")}</th>
            <th>{t("admin.table.headers.threshold")}</th>
            <th>{t("admin.table.headers.userThreshold")}</th>
            <th>{t("admin.table.headers.reward")}</th>
            <th>{t("admin.table.headers.budget")}</th>
            <th>{t("admin.table.headers.period")}</th>
            <th>{t("admin.table.headers.status")}</th>
            <th class="text-right">{t("admin.table.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each prizes as prize}
            <tr>
              <td class="font-medium">{prize.name}</td>
              <td>{prize.stock}</td>
              <td>{prize.weight}</td>
              <td>{prize.poolThreshold}</td>
              <td>{prize.userPoolThreshold}</td>
              <td>{prize.rewardAmount}</td>
              <td>{prize.payoutBudget}</td>
              <td>{prize.payoutPeriodDays}</td>
              <td>
                <span class={prize.isActive ? "badge badge-primary" : "badge"}>
                  {prize.isActive
                    ? t("admin.table.statusActive")
                    : t("admin.table.statusInactive")}
                </span>
              </td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    onclick={() => startEdit(prize)}
                  >
                    {t("admin.table.actionEdit")}
                  </button>
                  <form method="post" action="?/toggle">
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-xs" type="submit">
                      {t("admin.table.actionToggle")}
                    </button>
                  </form>
                  <form
                    method="post"
                    action="?/delete"
                    onsubmit={confirmDelete}
                  >
                    <input type="hidden" name="id" value={prize.id} />
                    <button class="btn btn-error btn-xs" type="submit">
                      {t("admin.table.actionDelete")}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
          {#if prizes.length === 0}
            <tr>
              <td colspan="10" class="text-center text-slate-500">
                {t("admin.table.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>

{#if analytics?.topSpenders?.length}
  <section class="mt-8 card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">{t("admin.topSpenders.title")}</h2>
      <div class="overflow-x-auto mt-4">
        <table class="table">
          <thead>
            <tr>
              <th>{t("admin.topSpenders.userId")}</th>
              <th>{t("admin.topSpenders.spend")}</th>
            </tr>
          </thead>
          <tbody>
            {#each analytics.topSpenders as spender}
              <tr>
                <td>{spender.userId}</td>
                <td>{spender.spent}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
{/if}
