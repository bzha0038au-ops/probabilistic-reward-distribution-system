<script lang="ts">
  import {
    createBonusReleaseForm,
    createConfigForm,
    type SystemConfig,
  } from "./page-support"

  type Translate = (key: string) => string

  let {
    config,
    stepUpCode,
    t,
  }: {
    config: SystemConfig | null
    stepUpCode: string
    t: Translate
  } = $props()

  let bonusReleaseForm = $state(createBonusReleaseForm())
  let changeReason = $state("")
  let configForm = $state(createConfigForm())

  $effect(() => {
    if (!config) return
    configForm.poolBalance = String(config.poolBalance ?? "0")
    configForm.drawCost = String(config.drawCost ?? "0")
    configForm.weightJitterEnabled = Boolean(config.weightJitterEnabled)
    configForm.weightJitterPct = String(config.weightJitterPct ?? "0")
    configForm.bonusAutoReleaseEnabled = Boolean(config.bonusAutoReleaseEnabled)
    configForm.bonusUnlockWagerRatio = String(config.bonusUnlockWagerRatio ?? "1")
    configForm.authFailureWindowMinutes = String(config.authFailureWindowMinutes ?? "15")
    configForm.authFailureFreezeThreshold = String(
      config.authFailureFreezeThreshold ?? "8",
    )
    configForm.adminFailureFreezeThreshold = String(
      config.adminFailureFreezeThreshold ?? "5",
    )
    configForm.profileSecurityRewardAmount = String(
      config.profileSecurityRewardAmount ?? "8",
    )
    configForm.firstDrawRewardAmount = String(config.firstDrawRewardAmount ?? "3")
    configForm.drawStreakDailyRewardAmount = String(
      config.drawStreakDailyRewardAmount ?? "5",
    )
    configForm.topUpStarterRewardAmount = String(
      config.topUpStarterRewardAmount ?? "10",
    )
    configForm.blackjackMinStake = String(config.blackjackMinStake ?? "1")
    configForm.blackjackMaxStake = String(config.blackjackMaxStake ?? "100")
    configForm.blackjackWinPayoutMultiplier = String(
      config.blackjackWinPayoutMultiplier ?? "2",
    )
    configForm.blackjackPushPayoutMultiplier = String(
      config.blackjackPushPayoutMultiplier ?? "1",
    )
    configForm.blackjackNaturalPayoutMultiplier = String(
      config.blackjackNaturalPayoutMultiplier ?? "2.5",
    )
    configForm.blackjackDealerHitsSoft17 = Boolean(config.blackjackDealerHitsSoft17)
    configForm.blackjackDoubleDownAllowed = Boolean(config.blackjackDoubleDownAllowed)
    configForm.blackjackSplitAcesAllowed = Boolean(config.blackjackSplitAcesAllowed)
    configForm.blackjackHitSplitAcesAllowed = Boolean(
      config.blackjackHitSplitAcesAllowed,
    )
    configForm.blackjackResplitAllowed = Boolean(config.blackjackResplitAllowed)
    configForm.blackjackMaxSplitHands = String(config.blackjackMaxSplitHands ?? 4)
    configForm.blackjackSplitTenValueCardsAllowed = Boolean(
      config.blackjackSplitTenValueCardsAllowed,
    )
  })
</script>

<div class="card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="card-title">高风险配置控制面</h2>
        <span class="badge badge-error badge-outline">草稿 / 审批 / 发布</span>
      </div>
      <p class="text-sm text-slate-500">
        系统配置不再直接在线生效。先保存草稿，再提审，审批通过后由具备 MFA
        的管理员发布。
      </p>
    </div>

    <div class="rounded-box border border-error/30 bg-error/5 p-4 text-sm">
      <p class="font-semibold text-error">上线闸门</p>
      <p class="mt-1 text-slate-700">
        敏感字段变更会要求二次确认；发布动作与通道熔断都需要当前 MFA step-up 码。
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
        <div class="form-control">
          <label class="label" for="config-profile-security-reward">
            <span class="label-text">安全档案奖励金额</span>
          </label>
          <input
            id="config-profile-security-reward"
            name="profileSecurityRewardAmount"
            type="number"
            step="0.01"
            class="input input-bordered"
            bind:value={configForm.profileSecurityRewardAmount}
          />
        </div>
        <div class="form-control">
          <label class="label" for="config-first-draw-reward">
            <span class="label-text">首次抽奖奖励金额</span>
          </label>
          <input
            id="config-first-draw-reward"
            name="firstDrawRewardAmount"
            type="number"
            step="0.01"
            class="input input-bordered"
            bind:value={configForm.firstDrawRewardAmount}
          />
        </div>
        <div class="form-control">
          <label class="label" for="config-draw-streak-reward">
            <span class="label-text">单日 3 抽奖励金额</span>
          </label>
          <input
            id="config-draw-streak-reward"
            name="drawStreakDailyRewardAmount"
            type="number"
            step="0.01"
            class="input input-bordered"
            bind:value={configForm.drawStreakDailyRewardAmount}
          />
        </div>
        <div class="form-control">
          <label class="label" for="config-topup-starter-reward">
            <span class="label-text">首充起步奖励金额</span>
          </label>
          <input
            id="config-topup-starter-reward"
            name="topUpStarterRewardAmount"
            type="number"
            step="0.01"
            class="input input-bordered"
            bind:value={configForm.topUpStarterRewardAmount}
          />
        </div>
      </div>

      <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
        <div class="mb-4">
          <p class="text-sm font-semibold">Blackjack 规则</p>
          <p class="mt-1 text-xs text-slate-500">
            这里控制下注上下限、赔付倍数，以及庄家 soft 17 / 玩家加倍规则。
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="form-control">
            <label class="label" for="config-blackjack-min-stake">
              <span class="label-text">Blackjack 最小下注</span>
            </label>
            <input
              id="config-blackjack-min-stake"
              name="blackjackMinStake"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.blackjackMinStake}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-blackjack-max-stake">
              <span class="label-text">Blackjack 最大下注</span>
            </label>
            <input
              id="config-blackjack-max-stake"
              name="blackjackMaxStake"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.blackjackMaxStake}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-blackjack-win-payout">
              <span class="label-text">普通获胜赔付倍数</span>
            </label>
            <input
              id="config-blackjack-win-payout"
              name="blackjackWinPayoutMultiplier"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.blackjackWinPayoutMultiplier}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-blackjack-push-payout">
              <span class="label-text">平局返还倍数</span>
            </label>
            <input
              id="config-blackjack-push-payout"
              name="blackjackPushPayoutMultiplier"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.blackjackPushPayoutMultiplier}
            />
          </div>
          <div class="form-control">
            <label class="label" for="config-blackjack-natural-payout">
              <span class="label-text">天生二十一点赔付倍数</span>
            </label>
            <input
              id="config-blackjack-natural-payout"
              name="blackjackNaturalPayoutMultiplier"
              type="number"
              step="0.01"
              class="input input-bordered"
              bind:value={configForm.blackjackNaturalPayoutMultiplier}
            />
          </div>
          <div class="flex flex-col gap-3">
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackDealerHitsSoft17"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackDealerHitsSoft17}
              />
              <span class="label-text">庄家 soft 17 继续要牌</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackDoubleDownAllowed"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackDoubleDownAllowed}
              />
              <span class="label-text">允许玩家加倍</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackSplitAcesAllowed"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackSplitAcesAllowed}
              />
              <span class="label-text">允许拆 A</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackHitSplitAcesAllowed"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackHitSplitAcesAllowed}
              />
              <span class="label-text">拆 A 后允许继续要牌</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackResplitAllowed"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackResplitAllowed}
              />
              <span class="label-text">允许 re-split</span>
            </label>
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                name="blackjackSplitTenValueCardsAllowed"
                class="checkbox checkbox-primary"
                bind:checked={configForm.blackjackSplitTenValueCardsAllowed}
              />
              <span class="label-text">允许 10-value 等价拆牌</span>
            </label>
          </div>
          <div class="form-control">
            <label class="label" for="config-blackjack-max-split-hands">
              <span class="label-text">最大分牌手数</span>
            </label>
            <input
              id="config-blackjack-max-split-hands"
              name="blackjackMaxSplitHands"
              type="number"
              min="2"
              max="8"
              step="1"
              class="input input-bordered"
              bind:value={configForm.blackjackMaxSplitHands}
            />
          </div>
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
