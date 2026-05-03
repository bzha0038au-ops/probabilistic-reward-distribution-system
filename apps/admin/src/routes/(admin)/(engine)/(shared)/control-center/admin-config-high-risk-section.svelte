<script lang="ts">
  import { createConfigForm, type SystemConfig } from "./page-support"

  let { config }: { config: SystemConfig | null } = $props()

  let changeReason = $state("")
  let configForm = $state(createConfigForm())

  $effect(() => {
    if (!config) return
    configForm.poolBalance = String(config.poolBalance ?? "0")
    configForm.drawCost = String(config.drawCost ?? "0")
    configForm.maintenanceMode = Boolean(config.maintenanceMode)
    configForm.registrationEnabled = Boolean(config.registrationEnabled)
    configForm.loginEnabled = Boolean(config.loginEnabled)
    configForm.drawEnabled = Boolean(config.drawEnabled)
    configForm.paymentDepositEnabled = Boolean(config.paymentDepositEnabled)
    configForm.paymentWithdrawEnabled = Boolean(config.paymentWithdrawEnabled)
    configForm.antiAbuseAutoFreezeEnabled = Boolean(
      config.antiAbuseAutoFreezeEnabled,
    )
    configForm.withdrawRiskNewCardFirstWithdrawalReviewEnabled = Boolean(
      config.withdrawRiskNewCardFirstWithdrawalReviewEnabled,
    )
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
</script>

<div class="card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Configuration Governance
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
          >
            高风险配置控制面
          </h2>
        </div>
        <span class="badge badge-error badge-outline">草稿 / 审批 / 发布</span>
      </div>
      <p class="text-sm text-slate-500">
        只保留系统入口、支付开关、风控冻结和核心数值参数，避免把游戏规则和遗留流程混在同一个面板里。
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div
        class="rounded-[0.95rem] border border-error/30 bg-error/5 p-4 text-sm"
      >
        <p class="font-semibold text-error">上线闸门</p>
        <p class="mt-1 text-slate-700">
          敏感字段变更会要求二次确认；发布动作与通道熔断都需要当前 MFA step-up
          码。
        </p>
      </div>
      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm"
      >
        <p class="font-semibold text-[var(--admin-ink)]">影响面</p>
        <p class="mt-1 text-slate-700">
          这里的改动会直接作用在用户入口、充值提现、抽奖成本和奖励释放阈值。
        </p>
      </div>
    </div>

    <form method="post" action="?/configDraftHighRisk" class="grid gap-6">
      <div class="rounded-[0.95rem] border border-warning/40 bg-warning/5 p-4">
        <div class="mb-4">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-warning"
          >
            Emergency Switches
          </p>
          <p class="mt-2 text-sm font-semibold text-warning">紧急降级开关</p>
          <p class="mt-1 text-xs text-slate-600">
            这些字段会直接影响用户入口、提现、充值和抽奖可用性。保存草稿时必须写明
            review notes。
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="maintenanceMode"
              class="checkbox checkbox-warning"
              bind:checked={configForm.maintenanceMode}
            />
            <span class="label-text flex-1">系统维护模式</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="registrationEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.registrationEnabled}
            />
            <span class="label-text flex-1">允许注册</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="loginEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.loginEnabled}
            />
            <span class="label-text flex-1">允许登录</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="drawEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.drawEnabled}
            />
            <span class="label-text flex-1">允许抽奖</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="paymentDepositEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.paymentDepositEnabled}
            />
            <span class="label-text flex-1">允许充值</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="paymentWithdrawEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.paymentWithdrawEnabled}
            />
            <span class="label-text flex-1">允许提现</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="antiAbuseAutoFreezeEnabled"
              class="checkbox checkbox-primary"
              bind:checked={configForm.antiAbuseAutoFreezeEnabled}
            />
            <span class="label-text flex-1">自动风控冻结</span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-[0.85rem] border border-warning/30 bg-white/70 px-4 py-3"
          >
            <input
              type="checkbox"
              name="withdrawRiskNewCardFirstWithdrawalReviewEnabled"
              class="checkbox checkbox-primary"
              bind:checked={
                configForm.withdrawRiskNewCardFirstWithdrawalReviewEnabled
              }
            />
            <span class="label-text flex-1">新卡首提强审</span>
          </label>
        </div>
      </div>

      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
      >
        <div class="mb-4">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Core Parameters
          </p>
          <p class="mt-2 text-sm text-slate-500">
            奖池、抽奖成本、抖动参数和认证阈值都在这里统一维护。
          </p>
        </div>

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
      </div>

      <div class="border-t border-[var(--admin-border)] pt-5">
        <label class="form-control">
          <span class="label-text mb-2">变更原因</span>
          <textarea
            class="textarea textarea-bordered min-h-24"
            name="changeReason"
            bind:value={changeReason}
            placeholder="说明为什么要调整配置，以及预期影响。"
          ></textarea>
        </label>

        <div
          class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="max-w-[32rem] text-xs leading-6 text-slate-500">
            保存的是草稿，不会直接写生产；但理由、操作者和审批链都会进入审计记录。
          </p>
          <button class="btn btn-primary min-w-[12rem]" type="submit">
            保存高风险配置草稿
          </button>
        </div>
      </div>
    </form>
  </div>
</div>
