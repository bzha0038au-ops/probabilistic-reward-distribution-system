<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"
  import type {
    PredictionMarketAppealQueueItem,
    PredictionMarketSummary,
    PredictionMarketAppealStatus,
    PredictionMarketStatus,
  } from "@reward/shared-types/prediction-market"

  interface PageData {
    markets: PredictionMarketSummary[]
    appeals: PredictionMarketAppealQueueItem[]
    error: string | null
  }

  interface ActionFeedback {
    success?: boolean
    actionType?: "create" | "settle" | "cancel" | "acknowledgeAppeal"
    marketTitle?: string
    marketId?: string
    appealId?: string
    error?: string
  }

  let { data }: { data: PageData } = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }

  let stepUpCode = $state("")

  const markets = $derived(data.markets ?? [])
  const appeals = $derived(data.appeals ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const actionFeedback = $derived(
    ($page.form as ActionFeedback | undefined)?.success
      ? ($page.form as ActionFeedback)
      : null,
  )
  const summary = $derived.by(() => {
    const counts: Record<PredictionMarketStatus, number> = {
      draft: 0,
      open: 0,
      locked: 0,
      resolved: 0,
      cancelled: 0,
    }

    for (const market of markets) {
      counts[market.status] += 1
    }

    return counts
  })
  const appealSummary = $derived.by(() => {
    const counts: Record<PredictionMarketAppealStatus, number> = {
      open: 0,
      acknowledged: 0,
      resolved: 0,
    }

    for (const appeal of appeals) {
      counts[appeal.status] += 1
    }

    return counts
  })
  const activeAppealsByMarketId = $derived.by(() => {
    const next = new Map<number, PredictionMarketAppealQueueItem[]>()
    for (const appeal of appeals) {
      const items = next.get(appeal.market.id) ?? []
      items.push(appeal)
      next.set(appeal.market.id, items)
    }
    return next
  })

  const statusClass = (status: PredictionMarketStatus) => {
    if (status === "resolved") return "badge-success"
    if (status === "cancelled") return "badge-error"
    if (status === "locked") return "badge-warning"
    if (status === "open") return "badge-info"
    return "badge-ghost"
  }
  const appealStatusClass = (status: PredictionMarketAppealStatus) => {
    if (status === "acknowledged") return "badge-info"
    if (status === "resolved") return "badge-success"
    return "badge-warning"
  }

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) return t("markets.labels.none")
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.valueOf())) {
      return String(value)
    }

    return parsed.toLocaleString()
  }

  const formatJson = (value: unknown) =>
    value === null || value === undefined
      ? t("markets.labels.none")
      : JSON.stringify(value, null, 2)

  const formatBps = (value: number) => `${(value / 100).toFixed(2)}%`

  const categoryLabel = (category: PredictionMarketSummary["category"]) =>
    t(`markets.enums.category.${category}`)

  const invalidPolicyLabel = (
    invalidPolicy: PredictionMarketSummary["invalidPolicy"],
  ) =>
    invalidPolicy === "refund_all"
      ? t("markets.enums.invalidPolicy.refundAll")
      : t("markets.enums.invalidPolicy.manualReview")
  const appealReasonLabel = (reason: PredictionMarketAppealQueueItem["reason"]) =>
    t(`markets.enums.appealReason.${reason}`)
  const appealStatusLabel = (status: PredictionMarketAppealStatus) =>
    t(`markets.enums.appealStatus.${status}`)
  const oracleBindingStatusLabel = (status: string) =>
    t(`markets.enums.oracleBindingStatus.${status}`)
  const getActiveAppealsForMarket = (marketId: number) =>
    activeAppealsByMarketId.get(marketId) ?? []
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      {t("markets.title")}
    </p>
    <h1 class="text-3xl font-semibold">{t("markets.title")}</h1>
    <p class="max-w-5xl text-sm text-slate-600">{t("markets.description")}</p>
  </header>

  {#if data.error}
    <div class="alert alert-error text-sm">
      <span>{data.error}</span>
    </div>
  {/if}

  {#if actionError}
    <div class="alert alert-error text-sm">
      <span>{actionError}</span>
    </div>
  {/if}

  {#if actionFeedback?.actionType}
    <div class="alert alert-success text-sm">
      <span>
        {t(`markets.success.${actionFeedback.actionType}`)}
        {#if actionFeedback.marketTitle}
          · {actionFeedback.marketTitle}
        {/if}
      </span>
    </div>
  {/if}

  <section class="grid gap-4 md:grid-cols-5">
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("markets.summary.draft")}</p>
      <p class="mt-3 text-3xl font-semibold">{summary.draft}</p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("markets.summary.open")}</p>
      <p class="mt-3 text-3xl font-semibold">{summary.open}</p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("markets.summary.locked")}</p>
      <p class="mt-3 text-3xl font-semibold">{summary.locked}</p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("markets.summary.resolved")}</p>
      <p class="mt-3 text-3xl font-semibold">{summary.resolved}</p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">{t("markets.summary.cancelled")}</p>
      <p class="mt-3 text-3xl font-semibold">{summary.cancelled}</p>
    </article>
  </section>

  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3">
      <div>
        <h2 class="card-title">{t("markets.stepUp.title")}</h2>
        <p class="text-sm text-slate-500">{t("markets.stepUp.description")}</p>
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
          placeholder={t("markets.stepUp.placeholder")}
        />
      </label>
    </div>
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="space-y-2">
      <h2 class="text-xl font-semibold">{t("markets.create.title")}</h2>
      <p class="text-sm text-slate-500">{t("markets.create.description")}</p>
    </div>

    <form method="post" action="?/create" class="mt-6 space-y-4">
      <input type="hidden" name="totpCode" value={stepUpCode} />

      <div class="grid gap-4 lg:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.slug")}</span>
          <input
            name="slug"
            class="input input-bordered"
            placeholder="btc-above-100k-2026-04-29"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.roundKey")}</span>
          <input
            name="roundKey"
            class="input input-bordered"
            placeholder="btc-2026-04-29-close"
          />
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2">{t("markets.create.marketTitle")}</span>
          <input
            name="title"
            class="input input-bordered"
            placeholder="BTC closes above 100k on 2026-04-29 UTC"
          />
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2"
            >{t("markets.create.descriptionLabel")}</span
          >
          <textarea
            name="description"
            class="textarea textarea-bordered min-h-24"
            placeholder={t("markets.create.descriptionPlaceholder")}
          ></textarea>
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2"
            >{t("markets.create.resolutionRules")}</span
          >
          <textarea
            name="resolutionRules"
            class="textarea textarea-bordered min-h-32"
            placeholder={t("markets.create.resolutionRulesPlaceholder")}
          ></textarea>
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2"
            >{t("markets.create.sourceOfTruth")}</span
          >
          <input
            name="sourceOfTruth"
            class="input input-bordered"
            placeholder="Official exchange daily close reference"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2"
            >{t("markets.create.oracleProvider")}</span
          >
          <select
            name="oracleProvider"
            class="select select-bordered"
            value="api_pull"
          >
            <option value="api_pull">api_pull</option>
            <option value="chainlink">chainlink</option>
            <option value="uma_oracle">uma_oracle</option>
            <option value="manual_admin">manual_admin</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-2"
            >{t("markets.create.oracleBindingName")}</span
          >
          <input
            name="oracleBindingName"
            class="input input-bordered"
            placeholder="BTC daily close feed"
          />
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2"
            >{t("markets.create.oracleBindingConfig")}</span
          >
          <textarea
            name="oracleBindingConfig"
            class="textarea textarea-bordered min-h-32 font-mono text-sm"
            placeholder={t("markets.create.oracleBindingConfigPlaceholder")}
          >{"{\"url\":\"https://api.example.com/btc-close\",\"valuePath\":\"close\",\"comparison\":{\"operator\":\"gte\",\"threshold\":\"100000\",\"outcomeKeyIfTrue\":\"yes\",\"outcomeKeyIfFalse\":\"no\"}}"}</textarea>
          <span class="mt-2 text-xs text-slate-500">
            {t("markets.create.oracleBindingConfigHint")}
          </span>
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.category")}</span>
          <select name="category" class="select select-bordered">
            <option value="crypto">{categoryLabel("crypto")}</option>
            <option value="finance">{categoryLabel("finance")}</option>
            <option value="sports">{categoryLabel("sports")}</option>
            <option value="politics">{categoryLabel("politics")}</option>
            <option value="technology">{categoryLabel("technology")}</option>
            <option value="culture">{categoryLabel("culture")}</option>
            <option value="other">{categoryLabel("other")}</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-2"
            >{t("markets.create.invalidPolicy")}</span
          >
          <select name="invalidPolicy" class="select select-bordered">
            <option value="refund_all"
              >{invalidPolicyLabel("refund_all")}</option
            >
            <option value="manual_review"
              >{invalidPolicyLabel("manual_review")}</option
            >
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.vigPercent")}</span>
          <input
            name="vigPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="input input-bordered"
            placeholder="5.00"
          />
          <span class="mt-2 text-xs text-slate-500">
            {t("markets.create.vigHint")}
          </span>
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2">{t("markets.create.tags")}</span>
          <input
            name="tags"
            class="input input-bordered"
            placeholder={t("markets.create.tagsPlaceholder")}
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.opensAt")}</span>
          <input
            name="opensAt"
            class="input input-bordered"
            placeholder="2026-04-29T00:00:00Z"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("markets.create.locksAt")}</span>
          <input
            name="locksAt"
            class="input input-bordered"
            placeholder="2026-04-29T12:00:00Z"
          />
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2">{t("markets.create.resolvesAt")}</span>
          <input
            name="resolvesAt"
            class="input input-bordered"
            placeholder="2026-04-29T12:30:00Z"
          />
          <span class="mt-2 text-xs text-slate-500">
            {t("markets.create.timestampHint")}
          </span>
        </label>
        <label class="form-control lg:col-span-2">
          <span class="label-text mb-2">{t("markets.create.outcomes")}</span>
          <textarea
            name="outcomes"
            class="textarea textarea-bordered min-h-28 font-mono text-sm"
            placeholder={t("markets.create.outcomesPlaceholder")}
          ></textarea>
          <span class="mt-2 text-xs text-slate-500">
            {t("markets.create.outcomesHint")}
          </span>
        </label>
      </div>

      <button class="btn btn-primary">{t("markets.create.submit")}</button>
    </form>
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="space-y-2">
      <h2 class="text-xl font-semibold">{t("markets.appeals.title")}</h2>
      <p class="text-sm text-slate-500">{t("markets.appeals.description")}</p>
    </div>

    <div class="mt-6 grid gap-4 md:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">{t("markets.appeals.open")}</p>
        <p class="mt-3 text-3xl font-semibold">{appealSummary.open}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">
          {t("markets.appeals.acknowledged")}
        </p>
        <p class="mt-3 text-3xl font-semibold">
          {appealSummary.acknowledged}
        </p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">{t("markets.appeals.totalActive")}</p>
        <p class="mt-3 text-3xl font-semibold">{appeals.length}</p>
      </article>
    </div>

    {#if appeals.length === 0}
      <div
        class="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-sm text-slate-500"
      >
        {t("markets.appeals.empty")}
      </div>
    {:else}
      <div class="mt-6 space-y-4">
        {#each appeals as appeal}
          <article class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div
              class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
            >
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold text-slate-900">
                    {appeal.market.title}
                  </h3>
                  <span class={`badge ${appealStatusClass(appeal.status)}`}>
                    {appealStatusLabel(appeal.status)}
                  </span>
                  <span class="badge badge-outline">
                    {appeal.provider ?? t("markets.labels.none")}
                  </span>
                  <span class="badge badge-outline">
                    {appealReasonLabel(appeal.reason)}
                  </span>
                </div>
                <p class="text-sm text-slate-500">
                  <span class="font-medium">{appeal.market.slug}</span>
                  · {t("markets.labels.roundKey")}: {appeal.market.roundKey}
                </p>
              </div>

              <div class="grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
                <p>
                  {t("markets.appeals.marketStatus")}: {t(
                    `markets.status.${appeal.market.status}`,
                  )}
                </p>
                <p>
                  {t("markets.appeals.firstDetectedAt")}: {formatDateTime(
                    appeal.firstDetectedAt,
                  )}
                </p>
                <p>
                  {t("markets.appeals.lastDetectedAt")}: {formatDateTime(
                    appeal.lastDetectedAt,
                  )}
                </p>
              </div>
            </div>

            <div class="mt-4 grid gap-4 xl:grid-cols-2">
              <section class="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 class="font-semibold text-slate-900">
                  {t("markets.appeals.details")}
                </h4>
                <p class="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                  {appeal.description}
                </p>
                <div class="mt-4 text-sm">
                  <p class="font-medium text-slate-900">
                    {t("markets.appeals.metadata")}
                  </p>
                  <pre
                    class="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{formatJson(
                      appeal.metadata,
                    )}</pre>
                </div>
              </section>

              <section class="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 class="font-semibold text-slate-900">
                  {t("markets.appeals.binding")}
                </h4>
                {#if appeal.market.oracleBinding}
                  <dl class="mt-4 space-y-3 text-sm">
                    <div>
                      <dt class="text-slate-500">
                        {t("markets.create.oracleProvider")}
                      </dt>
                      <dd>{appeal.market.oracleBinding.provider}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">
                        {t("markets.appeals.bindingStatus")}
                      </dt>
                      <dd>
                        {oracleBindingStatusLabel(
                          appeal.market.oracleBinding.status,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">
                        {t("markets.actions.oracleReportedAt")}
                      </dt>
                      <dd>
                        {formatDateTime(
                          appeal.market.oracleBinding.lastReportedAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">
                        {t("markets.appeals.lastResolvedOutcomeKey")}
                      </dt>
                      <dd>
                        {appeal.market.oracleBinding.lastResolvedOutcomeKey ??
                          t("markets.labels.none")}
                      </dd>
                    </div>
                  </dl>
                {:else}
                  <p class="mt-4 text-sm text-slate-500">
                    {t("markets.appeals.noBinding")}
                  </p>
                {/if}
              </section>
            </div>

            {#if appeal.status === "open"}
              <form
                method="post"
                action="?/acknowledgeAppeal"
                class="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <input type="hidden" name="appealId" value={appeal.id} />
                <label class="form-control">
                  <span class="label-text mb-2">
                    {t("markets.appeals.acknowledgeNote")}
                  </span>
                  <textarea
                    name="acknowledgeNote"
                    class="textarea textarea-bordered min-h-24"
                    placeholder={t("markets.appeals.acknowledgeNotePlaceholder")}
                  ></textarea>
                </label>
                <div class="mt-4">
                  <button class="btn btn-primary">
                    {t("markets.appeals.actions.acknowledge")}
                  </button>
                </div>
              </form>
            {:else}
              <p class="mt-4 text-sm text-slate-500">
                {t("markets.appeals.acknowledgedHint")}
              </p>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="space-y-4">
    <div class="space-y-2">
      <h2 class="text-xl font-semibold">{t("markets.list.title")}</h2>
      <p class="text-sm text-slate-500">{t("markets.list.description")}</p>
    </div>

    {#if markets.length === 0}
      <div
        class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-sm text-slate-500"
      >
        {t("markets.list.empty")}
      </div>
    {:else}
      {#each markets as market}
        {@const activeAppeals = getActiveAppealsForMarket(market.id)}
        <article
          class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div
            class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
          >
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-3">
                <h3 class="text-xl font-semibold text-slate-900">
                  {market.title}
                </h3>
                <span class={`badge ${statusClass(market.status)}`}>
                  {t(`markets.status.${market.status}`)}
                </span>
                {#if activeAppeals.length > 0}
                  <span class="badge badge-warning">
                    {t("markets.appeals.activeBadge")} {activeAppeals.length}
                  </span>
                {/if}
              </div>
              <p class="text-sm text-slate-500">
                <span class="font-medium">{market.slug}</span>
                · {t("markets.labels.roundKey")}: {market.roundKey}
              </p>
              {#if market.description}
                <p class="max-w-4xl text-sm text-slate-700">
                  {market.description}
                </p>
              {/if}
            </div>

            <div
              class="grid gap-2 text-sm text-slate-500 sm:grid-cols-2 xl:w-[28rem]"
            >
              <p>
                {t("markets.labels.createdAt")}: {formatDateTime(
                  market.createdAt,
                )}
              </p>
              <p>
                {t("markets.labels.updatedAt")}: {formatDateTime(
                  market.updatedAt,
                )}
              </p>
              <p>
                {t("markets.labels.opensAt")}: {formatDateTime(market.opensAt)}
              </p>
              <p>
                {t("markets.labels.locksAt")}: {formatDateTime(market.locksAt)}
              </p>
              <p>
                {t("markets.labels.resolvesAt")}: {formatDateTime(
                  market.resolvesAt,
                )}
              </p>
              <p>
                {t("markets.labels.resolvedAt")}: {formatDateTime(
                  market.resolvedAt,
                )}
              </p>
            </div>
          </div>

          <div class="mt-6 grid gap-4 xl:grid-cols-3">
            <section
              class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <h4 class="font-semibold text-slate-900">
                {t("markets.labels.rules")}
              </h4>
              <dl class="mt-4 space-y-3 text-sm">
                <div>
                  <dt class="text-slate-500">{t("markets.labels.category")}</dt>
                  <dd>{categoryLabel(market.category)}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">
                    {t("markets.labels.invalidPolicy")}
                  </dt>
                  <dd>{invalidPolicyLabel(market.invalidPolicy)}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">{t("markets.labels.vig")}</dt>
                  <dd>{formatBps(market.vigBps)}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">{t("markets.labels.tags")}</dt>
                  <dd class="mt-1 flex flex-wrap gap-2">
                    {#each market.tags as tag}
                      <span class="badge badge-outline">{tag}</span>
                    {/each}
                  </dd>
                </div>
                <div>
                  <dt class="text-slate-500">
                    {t("markets.labels.sourceOfTruth")}
                  </dt>
                  <dd>{market.sourceOfTruth}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">
                    {t("markets.labels.resolutionRules")}
                  </dt>
                  <dd class="whitespace-pre-wrap text-slate-700">
                    {market.resolutionRules}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <h4 class="font-semibold text-slate-900">
                {t("markets.labels.outcomePools")}
              </h4>
              <div class="mt-4 space-y-3">
                {#each market.outcomePools as pool}
                  <div
                    class="rounded-2xl border border-slate-200 bg-white p-4 text-sm"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="font-semibold text-slate-900">{pool.label}</p>
                        <p class="text-xs text-slate-500">{pool.outcomeKey}</p>
                      </div>
                      {#if market.winningOutcomeKey === pool.outcomeKey}
                        <span class="badge badge-success">
                          {t("markets.labels.winningOutcome")}
                        </span>
                      {/if}
                    </div>
                    <div class="mt-3 grid gap-2 sm:grid-cols-2">
                      <p>
                        {t("markets.labels.totalPool")}: {pool.totalStakeAmount}
                      </p>
                      <p>
                        {t("markets.labels.positionCount")}: {pool.positionCount}
                      </p>
                    </div>
                  </div>
                {/each}
              </div>
            </section>

            <section
              class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <h4 class="font-semibold text-slate-900">
                {t("markets.labels.oracle")}
              </h4>
              {#if market.oracle}
                <dl class="mt-4 space-y-3 text-sm">
                  <div>
                    <dt class="text-slate-500">
                      {t("markets.actions.oracleSource")}
                    </dt>
                    <dd>{market.oracle.source}</dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">
                      {t("markets.actions.oracleExternalRef")}
                    </dt>
                    <dd>
                      {market.oracle.externalRef ?? t("markets.labels.none")}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">
                      {t("markets.actions.oracleReportedAt")}
                    </dt>
                    <dd>{formatDateTime(market.oracle.reportedAt)}</dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">
                      {t("markets.actions.oraclePayloadHash")}
                    </dt>
                    <dd>
                      {market.oracle.payloadHash ?? t("markets.labels.none")}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">
                      {t("markets.actions.oraclePayload")}
                    </dt>
                    <dd>
                      <pre
                        class="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{formatJson(
                          market.oracle.payload,
                        )}</pre>
                    </dd>
                  </div>
                </dl>
              {:else}
                <p class="mt-4 text-sm text-slate-500">
                  {t("markets.labels.noOracle")}
                </p>
              {/if}
            </section>
          </div>

          {#if market.status !== "resolved" && market.status !== "cancelled"}
            <div class="mt-6 grid gap-4 xl:grid-cols-2">
              <section class="rounded-2xl border border-slate-200 p-4">
                <h4 class="font-semibold text-slate-900">
                  {t("markets.actions.settleTitle")}
                </h4>
                <p class="mt-1 text-sm text-slate-500">
                  {activeAppeals.length > 0
                    ? t("markets.actions.settleAppealUnlocked")
                    : market.status === "locked"
                    ? t("markets.actions.settleDescription")
                    : t("markets.actions.settleLockedOnly")}
                </p>

                <form method="post" action="?/settle" class="mt-4 space-y-3">
                  <input type="hidden" name="marketId" value={market.id} />
                  <input type="hidden" name="totpCode" value={stepUpCode} />

                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{t("markets.actions.winningOutcome")}</span
                    >
                    <select
                      name="winningOutcomeKey"
                      class="select select-bordered"
                      disabled={market.status !== "locked"}
                    >
                      {#each market.outcomes as outcome}
                        <option value={outcome.key}
                          >{outcome.label} ({outcome.key})</option
                        >
                      {/each}
                    </select>
                  </label>

                  <div class="grid gap-3 md:grid-cols-2">
                    <label class="form-control">
                      <span class="label-text mb-2"
                        >{t("markets.actions.oracleSource")}</span
                      >
                      <input
                        name="oracleSource"
                        class="input input-bordered"
                        placeholder="manual_oracle"
                        disabled={market.status !== "locked"}
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oracleExternalRef")}
                      </span>
                      <input
                        name="oracleExternalRef"
                        class="input input-bordered"
                        placeholder="oracle-btc-close-001"
                        disabled={market.status !== "locked"}
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oracleReportedAt")}
                      </span>
                      <input
                        name="oracleReportedAt"
                        class="input input-bordered"
                        placeholder="2026-04-29T12:01:00Z"
                        disabled={market.status !== "locked"}
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oraclePayloadHash")}
                      </span>
                      <input
                        name="oraclePayloadHash"
                        class="input input-bordered"
                        placeholder="sha256:..."
                        disabled={market.status !== "locked"}
                      />
                    </label>
                    <label class="form-control md:col-span-2">
                      <span class="label-text mb-2">
                        {t("markets.actions.oraclePayload")}
                      </span>
                      <textarea
                        name="oraclePayload"
                        class="textarea textarea-bordered min-h-24 font-mono text-sm"
                        placeholder={`{"closingPrice":"100123.45","venue":"exchange"}`}
                        disabled={market.status !== "locked"}
                      ></textarea>
                    </label>
                  </div>

                  <button
                    class="btn btn-primary"
                    disabled={market.status !== "locked"}
                  >
                    {t("markets.actions.submitSettle")}
                  </button>
                </form>
              </section>

              <section class="rounded-2xl border border-slate-200 p-4">
                <h4 class="font-semibold text-slate-900">
                  {t("markets.actions.cancelTitle")}
                </h4>
                <p class="mt-1 text-sm text-slate-500">
                  {t("markets.actions.cancelDescription")}
                </p>

                <form method="post" action="?/cancel" class="mt-4 space-y-3">
                  <input type="hidden" name="marketId" value={market.id} />
                  <input type="hidden" name="totpCode" value={stepUpCode} />

                  <label class="form-control">
                    <span class="label-text mb-2"
                      >{t("markets.actions.cancelReason")}</span
                    >
                    <textarea
                      name="reason"
                      class="textarea textarea-bordered min-h-24"
                      placeholder={t("markets.actions.cancelReasonPlaceholder")}
                    ></textarea>
                  </label>

                  <div class="grid gap-3 md:grid-cols-2">
                    <label class="form-control">
                      <span class="label-text mb-2"
                        >{t("markets.actions.oracleSource")}</span
                      >
                      <input
                        name="oracleSource"
                        class="input input-bordered"
                        placeholder="incident_review"
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oracleExternalRef")}
                      </span>
                      <input
                        name="oracleExternalRef"
                        class="input input-bordered"
                        placeholder="cancel-review-001"
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oracleReportedAt")}
                      </span>
                      <input
                        name="oracleReportedAt"
                        class="input input-bordered"
                        placeholder="2026-04-29T12:05:00Z"
                      />
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-2">
                        {t("markets.actions.oraclePayloadHash")}
                      </span>
                      <input
                        name="oraclePayloadHash"
                        class="input input-bordered"
                        placeholder="sha256:..."
                      />
                    </label>
                    <label class="form-control md:col-span-2">
                      <span class="label-text mb-2">
                        {t("markets.actions.oraclePayload")}
                      </span>
                      <textarea
                        name="oraclePayload"
                        class="textarea textarea-bordered min-h-24 font-mono text-sm"
                        placeholder={`{"reason":"market invalidated"}`}
                      ></textarea>
                    </label>
                    <label class="form-control md:col-span-2">
                      <span class="label-text mb-2">
                        {t("markets.actions.cancellationMetadata")}
                      </span>
                      <textarea
                        name="cancellationMetadata"
                        class="textarea textarea-bordered min-h-24 font-mono text-sm"
                        placeholder={`{"operator":"ops","ticket":"INC-2041"}`}
                      ></textarea>
                    </label>
                  </div>

                  <button class="btn btn-error"
                    >{t("markets.actions.submitCancel")}</button
                  >
                </form>
              </section>
            </div>
          {/if}
        </article>
      {/each}
    {/if}
  </section>
</div>
