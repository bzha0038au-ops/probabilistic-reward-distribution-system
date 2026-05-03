<script lang="ts">
  import { page } from "$app/stores"
  import AdminPageHeader from "$lib/components/admin-page-header.svelte"
  import {
    buildMissionForm,
    buildMissionPreview,
    createMissionForm,
    formatDateTime,
    formatPercent,
    missionCadenceLabel,
    missionTypeOptions,
    missionWindowLabel,
    stringifyMissionTemplate,
    type MissionForm,
    type PageData,
  } from "./page-support"
  import MissionsModuleTabs from "./missions-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  let createForm = $state(createMissionForm())
  let editForms = $state<Record<string, MissionForm>>({})

  const missions = $derived(data.missions ?? [])
  const actionError = $derived($page.form?.error as string | undefined)
  const createPreview = $derived(buildMissionPreview(createForm))
  const activeMissionCount = $derived(
    missions.filter((mission) => mission.isActive).length,
  )
  const dailyMissionCount = $derived(
    missions.filter((mission) => mission.type === "daily_checkin").length,
  )
  const autoGrantCount = $derived(
    missions.filter(
      (mission) => buildMissionPreview(buildMissionForm(mission)).autoAwarded,
    ).length,
  )
  const grantedAmountTotal = $derived(
    missions.reduce(
      (total, mission) =>
        total + parseAmount(mission.metrics.grantedAmountTotal),
      0,
    ),
  )
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/missions/registry") return "registry"
    if ($page.url.pathname === "/missions/management") return "management"
    if ($page.url.pathname === "/missions/authoring") return "authoring"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isRegistryModule = $derived(activeModule === "registry")
  const isManagementModule = $derived(activeModule === "management")
  const pageDescription = $derived.by(() => {
    if (activeModule === "registry") {
      return "Mission registry 独立成页，只看任务定义、完成率和领取率，不再和编辑表单混排。"
    }
    if (activeModule === "management") {
      return "已配置任务的编辑、删除和逐条实时预览集中到单独管理台。"
    }
    if (activeModule === "authoring") {
      return "新建任务、schema preview 和 cadence notes 进入单独 authoring workspace。"
    }
    return "Missions Hub 只保留摘要和模块入口，把 registry、management 和 authoring 拆到独立工作台。"
  })
  const missionModules = $derived([
    {
      href: "/missions/registry",
      eyebrow: "Mission Registry",
      title: "Registry",
      description:
        "任务定义、窗口口径和运营表现单独进入 registry 视图，只看当前配置与统计。",
      badge: `${missions.length}`,
    },
    {
      href: "/missions/management",
      eyebrow: "Management Desk",
      title: "Management",
      description:
        "任务编辑、删除和逐条预览集中处理，不再和新建表单混在同一屏。",
      badge: `${activeMissionCount}`,
    },
    {
      href: "/missions/authoring",
      eyebrow: "Authoring Desk",
      title: "Authoring",
      description:
        "新建 mission、schema preview 和 cadence lens 单独成页，避免主工作区信息堆叠。",
      badge: `${autoGrantCount}`,
    },
  ])

  $effect(() => {
    editForms = Object.fromEntries(
      missions.map((mission) => [mission.id, buildMissionForm(mission)]),
    )
  })

  const applyTemplate = (form: MissionForm) => {
    form.params = stringifyMissionTemplate(form.type)
  }

  const updateEditForm = <Key extends keyof MissionForm>(
    missionId: string,
    key: Key,
    value: MissionForm[Key],
  ) => {
    const form = editForms[missionId]
    if (!form) return
    form[key] = value
  }

  const formatAmount = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  function parseAmount(value: string | number | null | undefined) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (value === null || value === undefined) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · missionOps"
    eyebrow="Consumer"
    title="Missions"
    description={pageDescription}
  />

  <MissionsModuleTabs />

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

  {#if isHubModule}
    <section
      class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4"
    >
      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Registry
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {missions.length}
            </p>
            <span class="badge badge-outline">missions</span>
          </div>
          <p class="text-sm text-slate-500">
            Total configured mission definitions currently visible to reward
            center.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Active
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {activeMissionCount}
            </p>
            <span class="badge badge-outline">live</span>
          </div>
          <p class="text-sm text-slate-500">
            Missions currently enabled for user-facing progression and reward
            issuance.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Daily
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {dailyMissionCount}
            </p>
            <span class="badge badge-outline">cadence</span>
          </div>
          <p class="text-sm text-slate-500">
            Daily check-in style missions currently active in the registry.
          </p>
        </div>
      </article>

      <article class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Granted
          </p>
          <div class="flex items-end justify-between gap-4">
            <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
              {formatAmount(grantedAmountTotal)}
            </p>
            <span class="badge badge-outline">bonus</span>
          </div>
          <p class="text-sm text-slate-500">
            {autoGrantCount} missions currently auto-award without an explicit claim
            step.
          </p>
        </div>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      {#each missionModules as module}
        <article class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  {module.eyebrow}
                </p>
                <h2
                  class="mt-2 font-['Newsreader'] text-3xl text-[var(--admin-ink)]"
                >
                  {module.title}
                </h2>
              </div>
              <span class="badge badge-outline">{module.badge}</span>
            </div>
            <p class="text-sm leading-6 text-[var(--admin-muted)]">
              {module.description}
            </p>
            <div class="pt-2">
              <a class="btn btn-outline" href={module.href}>Open Module</a>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {:else if isRegistryModule}
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Mission Registry
            </p>
            <h2 class="card-title mt-2">Configured Missions</h2>
            <p class="text-sm text-slate-500">
              完成率按当前用户总体样本计算；领取率对 daily 任务按今日口径，对
              one-time 任务按累计口径。
            </p>
          </div>
          <span class="badge badge-outline">{missions.length} missions</span>
        </div>

        {#if missions.length === 0}
          <div
            class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
          >
            当前还没有任务配置。创建第一条 mission 后，reward center
            会直接读这里。
          </div>
        {:else}
          <div class="space-y-5">
            {#each missions as mission}
              <article
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-5"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-lg font-semibold text-[var(--admin-ink)]">
                        {mission.id}
                      </h3>
                      <span class="badge badge-outline">{mission.type}</span>
                      <span
                        class={`badge ${mission.isActive ? "badge-success" : "badge-ghost"}`}
                      >
                        {mission.isActive ? "active" : "inactive"}
                      </span>
                      <span class="badge badge-ghost">
                        {missionWindowLabel(mission.metrics.window)}
                      </span>
                    </div>
                    <p class="text-xs text-slate-500">
                      创建于 {formatDateTime(mission.createdAt)}，最近更新于 {formatDateTime(
                        mission.updatedAt,
                      )}
                    </p>
                  </div>
                </div>

                <div class="mt-5 grid gap-3 md:grid-cols-5">
                  <div
                    class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                      完成率
                    </p>
                    <p class="mt-2 text-xl font-semibold">
                      {formatPercent(mission.metrics.completionRate)}
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      {mission.metrics.completedUsers}/{mission.metrics
                        .totalUsers}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                      领取率
                    </p>
                    <p class="mt-2 text-xl font-semibold">
                      {formatPercent(mission.metrics.claimRate)}
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      {mission.metrics.claimedUsers}/{mission.metrics
                        .completedUsers}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                      发放总额
                    </p>
                    <p class="mt-2 text-xl font-semibold">
                      {mission.metrics.grantedAmountTotal}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                      已完成用户
                    </p>
                    <p class="mt-2 text-xl font-semibold">
                      {mission.metrics.completedUsers}
                    </p>
                  </div>
                  <div
                    class="rounded-[0.9rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
                  >
                    <p
                      class="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                      已领取用户
                    </p>
                    <p class="mt-2 text-xl font-semibold">
                      {mission.metrics.claimedUsers}
                    </p>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else if isManagementModule}
    <section class="card bg-base-100 shadow">
      <div class="card-body gap-5">
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Management Desk
            </p>
            <h2 class="card-title mt-2">Edit Configured Missions</h2>
            <p class="text-sm text-slate-500">
              现有任务的编辑、启停和删除都集中在这一页，右侧预览随表单即时变化。
            </p>
          </div>
          <span class="badge badge-outline">{missions.length} editable</span>
        </div>

        {#if missions.length === 0}
          <div
            class="rounded-[1rem] border border-dashed border-[var(--admin-border)] bg-[var(--admin-paper)] p-10 text-center text-slate-500"
          >
            当前还没有任务配置可供编辑。
          </div>
        {:else}
          <div class="space-y-5">
            {#each missions as mission}
              {@const form = editForms[mission.id] ?? buildMissionForm(mission)}
              {@const preview = buildMissionPreview(form)}
              <article
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-5"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-lg font-semibold text-[var(--admin-ink)]">
                        {mission.id}
                      </h3>
                      <span class="badge badge-outline">{mission.type}</span>
                      <span
                        class={`badge ${mission.isActive ? "badge-success" : "badge-ghost"}`}
                      >
                        {mission.isActive ? "active" : "inactive"}
                      </span>
                    </div>
                    <p class="text-xs text-slate-500">
                      创建于 {formatDateTime(mission.createdAt)}，最近更新于 {formatDateTime(
                        mission.updatedAt,
                      )}
                    </p>
                  </div>

                  <form method="post" action="?/delete">
                    <input type="hidden" name="id" value={mission.id} />
                    <button
                      class="btn btn-outline btn-error btn-sm"
                      type="submit"
                    >
                      删除
                    </button>
                  </form>
                </div>

                <div class="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                  <form method="post" action="?/update" class="grid gap-4">
                    <div class="grid gap-4 md:grid-cols-2">
                      <label class="form-control">
                        <span class="label-text mb-2">任务 ID</span>
                        <input
                          class="input input-bordered"
                          readonly
                          value={form.id}
                        />
                        <input type="hidden" name="id" value={form.id} />
                      </label>
                      <label class="form-control">
                        <span class="label-text mb-2">Type</span>
                        <select
                          name="type"
                          class="select select-bordered"
                          value={form.type}
                          onchange={(event) =>
                            updateEditForm(
                              form.id,
                              "type",
                              (event.currentTarget as HTMLSelectElement)
                                .value as MissionForm["type"],
                            )}
                        >
                          {#each missionTypeOptions as option}
                            <option value={option.value}>{option.label}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="form-control">
                        <span class="label-text mb-2">奖励金额</span>
                        <input
                          name="reward"
                          type="number"
                          step="0.01"
                          class="input input-bordered"
                          value={form.reward}
                          oninput={(event) =>
                            updateEditForm(
                              form.id,
                              "reward",
                              (event.currentTarget as HTMLInputElement).value,
                            )}
                        />
                      </label>
                      <label
                        class="label cursor-pointer justify-start gap-3 pt-8"
                      >
                        <input
                          name="isActive"
                          type="checkbox"
                          class="checkbox checkbox-primary"
                          checked={form.isActive}
                          onchange={(event) =>
                            updateEditForm(
                              form.id,
                              "isActive",
                              (event.currentTarget as HTMLInputElement).checked,
                            )}
                        />
                        <span class="label-text">启用任务</span>
                      </label>
                    </div>

                    <div class="space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <p class="text-sm font-semibold">Params JSON</p>
                          <p class="text-xs text-slate-500">
                            改 type 后可一键覆盖成该类型模板，再微调字段。
                          </p>
                        </div>
                        <button
                          type="button"
                          class="btn btn-outline btn-sm"
                          onclick={() => applyTemplate(form)}
                        >
                          载入模板
                        </button>
                      </div>
                      <textarea
                        name="params"
                        class="textarea textarea-bordered min-h-64 font-mono text-xs"
                        value={form.params}
                        oninput={(event) =>
                          updateEditForm(
                            form.id,
                            "params",
                            (event.currentTarget as HTMLTextAreaElement).value,
                          )}
                      ></textarea>
                    </div>

                    <div class="flex justify-end">
                      <button class="btn btn-primary" type="submit">
                        保存修改
                      </button>
                    </div>
                  </form>

                  <section class="space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <p
                          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                        >
                          Preview Rail
                        </p>
                        <h4 class="mt-2 font-semibold">实时预览</h4>
                        <p class="text-sm text-slate-500">
                          当前编辑中的配置会即时映射到右侧卡片。
                        </p>
                      </div>
                      <span
                        class={`badge ${preview.valid ? "badge-success" : "badge-warning"}`}
                      >
                        {preview.valid ? "Schema OK" : "待修正"}
                      </span>
                    </div>

                    {#if !preview.valid}
                      <div class="alert alert-warning text-sm">
                        <span>{preview.error}</span>
                      </div>
                    {/if}

                    <div
                      class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="space-y-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <h4 class="text-base font-semibold text-slate-950">
                              {preview.title}
                            </h4>
                            <span class="badge badge-outline">
                              {preview.autoAwarded ? "自动发放" : "待领取"}
                            </span>
                            <span class="badge badge-ghost">
                              {missionCadenceLabel(preview.cadence)}
                            </span>
                          </div>
                          <p class="text-sm text-slate-600">
                            {preview.description}
                          </p>
                        </div>
                        <div class="text-right">
                          <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400"
                          >
                            BONUS
                          </p>
                          <p class="text-lg font-semibold text-slate-950">
                            {preview.reward}
                          </p>
                        </div>
                      </div>

                      <div class="mt-4 space-y-2">
                        <div
                          class="flex items-center justify-between text-xs text-slate-500"
                        >
                          <span>{preview.progressLabel}</span>
                          <span>{preview.metricLabel ?? "每日签到"}</span>
                        </div>
                        <div
                          class="h-2 overflow-hidden rounded-full bg-slate-100"
                        >
                          <div
                            class="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-500"
                            style={`width: ${preview.progressPercent}%`}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]"
    >
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Authoring Desk
            </p>
            <h2 class="card-title mt-2">新增任务</h2>
            <p class="text-sm text-slate-500">
              任务字段遵循 `id / type / params jsonb / reward /
              active`。`params` 会在提交前做 JSON 和 schema 校验。
            </p>
          </div>

          <form method="post" action="?/create" class="grid gap-4">
            <div class="grid gap-4">
              <label class="form-control">
                <span class="label-text mb-2">任务 ID</span>
                <input
                  name="id"
                  class="input input-bordered"
                  bind:value={createForm.id}
                  placeholder="draw_streak_daily"
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-2">Type</span>
                <select
                  name="type"
                  class="select select-bordered"
                  bind:value={createForm.type}
                >
                  {#each missionTypeOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="form-control">
                <span class="label-text mb-2">奖励金额</span>
                <input
                  name="reward"
                  type="number"
                  step="0.01"
                  class="input input-bordered"
                  bind:value={createForm.reward}
                />
              </label>
              <label class="label cursor-pointer justify-start gap-3">
                <input
                  name="isActive"
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  bind:checked={createForm.isActive}
                />
                <span class="label-text">启用任务</span>
              </label>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold">Params JSON</p>
                  <p class="text-xs text-slate-500">
                    `daily_checkin` 用签到模板；`metric_threshold`
                    用指标阈值模板。
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  onclick={() => applyTemplate(createForm)}
                >
                  载入模板
                </button>
              </div>
              <textarea
                name="params"
                class="textarea textarea-bordered min-h-72 font-mono text-xs"
                bind:value={createForm.params}
              ></textarea>
            </div>

            <div class="flex justify-end">
              <button class="btn btn-primary" type="submit">创建任务</button>
            </div>
          </form>
        </div>
      </section>

      <aside class="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p
                  class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                >
                  Preview Rail
                </p>
                <h2 class="card-title mt-2">实时预览</h2>
                <p class="text-sm text-slate-500">
                  这里模拟 reward center 单张任务卡的最终表现。
                </p>
              </div>
              <span
                class={`badge ${createPreview.valid ? "badge-success" : "badge-warning"}`}
              >
                {createPreview.valid ? "Schema OK" : "待修正"}
              </span>
            </div>

            {#if !createPreview.valid}
              <div class="alert alert-warning text-sm">
                <span>{createPreview.error}</span>
              </div>
            {/if}

            <div
              class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-semibold text-slate-950">
                      {createPreview.title}
                    </h3>
                    <span class="badge badge-outline">
                      {createPreview.autoAwarded ? "自动发放" : "待领取"}
                    </span>
                    <span class="badge badge-ghost">
                      {missionCadenceLabel(createPreview.cadence)}
                    </span>
                  </div>
                  <p class="text-sm text-slate-600">
                    {createPreview.description}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                    BONUS
                  </p>
                  <p class="text-lg font-semibold text-slate-950">
                    {createPreview.reward}
                  </p>
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div
                  class="flex items-center justify-between text-xs text-slate-500"
                >
                  <span>{createPreview.progressLabel}</span>
                  <span>{createPreview.metricLabel ?? "每日签到"}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-500"
                    style={`width: ${createPreview.progressPercent}%`}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Mission Notes
              </p>
              <h2 class="card-title mt-2">Cadence Lens</h2>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Daily check-in</dt>
                <dd class="font-mono text-xs">{dailyMissionCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Auto grant</dt>
                <dd class="font-mono text-xs">{autoGrantCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Active missions</dt>
                <dd class="font-mono text-xs">{activeMissionCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Granted total</dt>
                <dd class="font-mono text-xs">
                  {formatAmount(grantedAmountTotal)}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
