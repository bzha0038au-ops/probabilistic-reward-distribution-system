<script lang="ts">
  type Translate = (key: string) => string

  let {
    stepUpCode = $bindable(),
    processingChannel = $bindable(),
    settlementReference = $bindable(),
    confirmations = $bindable(),
    operatorNote = $bindable(),
    t,
  }: {
    stepUpCode: string
    processingChannel: string
    settlementReference: string
    confirmations: string
    operatorNote: string
    t: Translate
  } = $props()
</script>

<aside
  class="admin-rail admin-rail--early-xl space-y-6 xl:sticky xl:top-24 xl:self-start"
>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Operational Authorization
        </p>
        <h2 class="card-title mt-2">{t("finance.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("finance.stepUp.description")}</p>
      </div>

      <div class="admin-rail-panel admin-rail-panel--strong">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Approval Key
        </p>
        <label class="form-control mt-3">
          <span class="label-text mb-2">{t("common.totpCode")}</span>
          <input
            name="totpCode"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            class="input input-bordered"
            bind:value={stepUpCode}
            placeholder={t("finance.stepUp.placeholder")}
          />
        </label>
      </div>

      <div class="admin-rail-panel">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Settlement Trail
        </p>

        <div class="mt-4 grid gap-4">
          <label class="form-control">
            <span class="label-text mb-2">
              {t("finance.stepUp.processingChannel")}
            </span>
            <input
              name="processingChannel"
              type="text"
              class="input input-bordered"
              bind:value={processingChannel}
              placeholder={t("finance.stepUp.processingChannelPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">
              {t("finance.stepUp.settlementReference")}
            </span>
            <input
              name="settlementReference"
              type="text"
              class="input input-bordered"
              bind:value={settlementReference}
              placeholder={t("finance.stepUp.settlementReferencePlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">
              {t("finance.stepUp.confirmations")}
            </span>
            <input
              name="confirmations"
              type="number"
              min="0"
              class="input input-bordered"
              bind:value={confirmations}
              placeholder={t("finance.stepUp.confirmationsPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">
              {t("finance.stepUp.operatorNote")}
            </span>
            <textarea
              name="operatorNote"
              class="textarea textarea-bordered min-h-32"
              bind:value={operatorNote}
              placeholder={t("finance.stepUp.operatorNotePlaceholder")}
            ></textarea>
          </label>
        </div>
      </div>

      <div class="admin-rail-note text-sm">
        <p class="font-semibold text-warning">Manual Review Protocol</p>
        <p class="mt-2 leading-6 text-slate-700">
          Every approve, reject, provider-submit, and reversal action reuses
          this rail. Keep the channel, settlement reference, and operator note
          aligned with the real-world payout trail.
        </p>
      </div>
    </div>
  </section>
</aside>
