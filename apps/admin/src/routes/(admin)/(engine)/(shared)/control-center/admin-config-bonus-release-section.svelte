<script lang="ts">
  import type { SystemConfig } from "./page-support"

  let { config }: { config: SystemConfig | null } = $props()

  const autoReleaseEnabled = $derived(Boolean(config?.bonusAutoReleaseEnabled))
  const unlockRatio = $derived(String(config?.bonusUnlockWagerRatio ?? "1"))
</script>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
  <div class="card bg-base-100 shadow">
    <div class="card-body space-y-5">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Retired Path
            </p>
            <h2
              class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
            >
              Legacy Bonus Release
            </h2>
          </div>
          <span class="badge badge-warning badge-outline">Disabled</span>
        </div>
        <p class="text-sm text-slate-500">
          这个入口保留给历史审计和操作说明。当前 B luck economy
          模型下，不再允许从 CMS 直接释放 legacy bonus。
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm"
        >
          <p class="font-semibold text-[var(--admin-ink)]">当前自动释放状态</p>
          <p class="mt-1 text-slate-700">
            {autoReleaseEnabled
              ? "已启用自动释放奖励余额"
              : "当前未启用自动释放奖励余额"}
          </p>
        </div>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4 text-sm"
        >
          <p class="font-semibold text-[var(--admin-ink)]">解锁流水倍率</p>
          <p class="mt-1 font-mono text-base text-[var(--admin-ink)]">
            {unlockRatio}x
          </p>
        </div>
      </div>

      <div
        class="rounded-[0.95rem] border border-warning/35 bg-warning/5 p-4 text-sm"
      >
        <p class="font-semibold text-warning">为什么被拆出去</p>
        <p class="mt-1 text-slate-700">
          这个流程本身已经退役，不应该继续和实时高风险配置或桌规参数混在同一个操作面板里。
        </p>
      </div>

      <div
        class="grid gap-4 rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <label class="form-control">
            <span class="label-text mb-2">User ID</span>
            <input
              class="input input-bordered"
              type="number"
              disabled
              placeholder="Locked"
            />
          </label>
          <label class="form-control">
            <span class="label-text mb-2">Amount</span>
            <input
              class="input input-bordered"
              type="number"
              step="0.01"
              disabled
              placeholder="Disabled under current economy model"
            />
          </label>
        </div>
        <button class="btn btn-primary" type="button" disabled>
          Legacy Release Disabled
        </button>
      </div>
    </div>
  </div>

  <aside class="space-y-6 xl:sticky xl:top-[5.5rem] xl:self-start">
    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-4">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Redirected Control
          </p>
          <h3
            class="mt-2 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
          >
            Use High-Risk Controls
          </h3>
        </div>
        <p class="text-sm leading-6 text-[var(--admin-muted)]">
          如果要调整奖励自动释放或解锁倍率，请前往高风险配置控制面，不要在遗留流程里做旁路操作。
        </p>
        <a class="btn btn-outline w-full" href="/config/high-risk-controls">
          Open High-Risk Controls
        </a>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body space-y-3 text-sm text-[var(--admin-muted)]">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Audit Note
        </p>
        <p>
          真正的奖励变更请通过系统配置草稿、审批和发布链条完成，避免出现未记录的手工余额调整。
        </p>
      </div>
    </div>
  </aside>
</div>
