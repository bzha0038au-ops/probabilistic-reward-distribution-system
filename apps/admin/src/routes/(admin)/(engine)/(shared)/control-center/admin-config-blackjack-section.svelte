<script lang="ts">
  import { createConfigForm, type SystemConfig } from "./page-support"

  let { config }: { config: SystemConfig | null } = $props()

  let changeReason = $state("")
  let configForm = $state(createConfigForm())

  $effect(() => {
    if (!config) return
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
    configForm.blackjackDealerHitsSoft17 = Boolean(
      config.blackjackDealerHitsSoft17,
    )
    configForm.blackjackDoubleDownAllowed = Boolean(
      config.blackjackDoubleDownAllowed,
    )
    configForm.blackjackSplitAcesAllowed = Boolean(
      config.blackjackSplitAcesAllowed,
    )
    configForm.blackjackHitSplitAcesAllowed = Boolean(
      config.blackjackHitSplitAcesAllowed,
    )
    configForm.blackjackResplitAllowed = Boolean(config.blackjackResplitAllowed)
    configForm.blackjackMaxSplitHands = String(
      config.blackjackMaxSplitHands ?? 4,
    )
    configForm.blackjackSplitTenValueCardsAllowed = Boolean(
      config.blackjackSplitTenValueCardsAllowed,
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
            Table Rules
          </p>
          <h2
            class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
          >
            Blackjack 规则
          </h2>
        </div>
        <span class="badge badge-outline">独立草稿面板</span>
      </div>
      <p class="text-sm text-slate-500">
        把下注上下限、赔付倍数和分牌规则单独隔离，避免跟支付和登录风控参数混写。
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm"
      >
        <p class="font-semibold text-[var(--admin-ink)]">结算纪律</p>
        <p class="mt-1 text-slate-700">
          调整赔付倍数前，请先确认当前奖池承受能力和桌面风控阈值。
        </p>
      </div>
      <div
        class="rounded-[0.95rem] border border-warning/30 bg-warning/5 p-4 text-sm"
      >
        <p class="font-semibold text-warning">桌面影响</p>
        <p class="mt-1 text-slate-700">
          规则变更会影响在局结算与投注约束，建议与 tables/on-call 一起复核。
        </p>
      </div>
    </div>

    <form method="post" action="?/configDraftBlackjack" class="grid gap-6">
      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
      >
        <div class="mb-4">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Rule Envelope
          </p>
          <p class="mt-2 text-sm font-semibold">Blackjack 桌规参数</p>
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

        <div class="mt-5 grid gap-3 lg:grid-cols-2">
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
      </div>

      <div class="border-t border-[var(--admin-border)] pt-5">
        <label class="form-control">
          <span class="label-text mb-2">变更原因</span>
          <textarea
            class="textarea textarea-bordered min-h-24"
            name="changeReason"
            bind:value={changeReason}
            placeholder="说明为什么要调整 Blackjack 桌规，以及对结算和风险的预期影响。"
          ></textarea>
        </label>

        <div
          class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="max-w-[32rem] text-xs leading-6 text-slate-500">
            规则草稿不会立即影响线上桌面；后续仍需走 change request 流程。
          </p>
          <button class="btn btn-primary min-w-[12rem]" type="submit">
            保存 Blackjack 规则草稿
          </button>
        </div>
      </div>
    </form>
  </div>
</div>
