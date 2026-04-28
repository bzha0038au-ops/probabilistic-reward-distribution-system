<script lang="ts">
  import { page } from "$app/stores";
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
  } from "./page-support";

  let { data }: { data: PageData } = $props();

  let createForm = $state(createMissionForm());
  let editForms = $state<Record<string, MissionForm>>({});

  const missions = $derived(data.missions ?? []);
  const actionError = $derived($page.form?.error as string | undefined);
  const createPreview = $derived(buildMissionPreview(createForm));

  $effect(() => {
    editForms = Object.fromEntries(
      missions.map((mission) => [mission.id, buildMissionForm(mission)]),
    );
  });

  const applyTemplate = (form: MissionForm) => {
    form.params = stringifyMissionTemplate(form.type);
  };
</script>

<header class="space-y-2">
  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
    Consumer Missions
  </p>
  <h1 class="text-3xl font-semibold">Mission CRUD</h1>
  <p class="text-sm text-slate-600">
    让奖励中心任务改成数据驱动：运营可直接新增、修改、停用任务，并实时预览
    reward center 卡片效果。
  </p>
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

<section class="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
  <div class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">新增任务</h2>
        <p class="text-sm text-slate-500">
          任务字段遵循 `id / type / params jsonb / reward / active`。`params`
          会在提交前做 JSON 和 schema 校验。
        </p>
      </div>

      <form method="post" action="?/create" class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-2">
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
          <label class="label cursor-pointer justify-start gap-3 pt-8">
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
                `daily_checkin` 用签到模板；`metric_threshold` 用指标阈值模板。
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
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="card-title">实时预览</h2>
          <p class="text-sm text-slate-500">
            这里模拟 reward center 单张任务卡的最终表现。
          </p>
        </div>
        <span class={`badge ${createPreview.valid ? "badge-success" : "badge-warning"}`}>
          {createPreview.valid ? "Schema OK" : "待修正"}
        </span>
      </div>

      {#if !createPreview.valid}
        <div class="alert alert-warning text-sm">
          <span>{createPreview.error}</span>
        </div>
      {/if}

      <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
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
            <p class="text-sm text-slate-600">{createPreview.description}</p>
          </div>
          <div class="text-right">
            <p class="text-xs uppercase tracking-[0.18em] text-slate-400">BONUS</p>
            <p class="text-lg font-semibold text-slate-950">
              {createPreview.reward}
            </p>
          </div>
        </div>

        <div class="mt-4 space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500">
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
  </div>
</section>

<section class="mt-8 space-y-4">
  <div class="flex items-center justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold">已配置任务</h2>
      <p class="text-sm text-slate-500">
        完成率按当前用户总体样本计算；领取率对 daily 任务按今日口径，对 one-time
        任务按累计口径。
      </p>
    </div>
    <span class="badge badge-outline">{missions.length} missions</span>
  </div>

  {#if missions.length === 0}
    <div class="alert alert-info text-sm">
      <span>当前还没有任务配置。创建第一条 mission 后，reward center 会直接读这里。</span>
    </div>
  {/if}

  {#each missions as mission}
    {@const form = editForms[mission.id] ?? buildMissionForm(mission)}
    {@const preview = buildMissionPreview(form)}
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold">{mission.id}</h3>
              <span class="badge badge-outline">{mission.type}</span>
              <span class={`badge ${mission.isActive ? "badge-success" : "badge-ghost"}`}>
                {mission.isActive ? "active" : "inactive"}
              </span>
              <span class="badge badge-ghost">
                {missionWindowLabel(mission.metrics.window)}
              </span>
            </div>
            <p class="text-xs text-slate-500">
              创建于 {formatDateTime(mission.createdAt)}，最近更新于{" "}
              {formatDateTime(mission.updatedAt)}
            </p>
          </div>

          <form method="post" action="?/delete">
            <input type="hidden" name="id" value={mission.id} />
            <button class="btn btn-outline btn-error btn-sm" type="submit">
              删除
            </button>
          </form>
        </div>

        <div class="grid gap-3 md:grid-cols-5">
          <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">完成率</p>
            <p class="mt-2 text-xl font-semibold">
              {formatPercent(mission.metrics.completionRate)}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {mission.metrics.completedUsers}/{mission.metrics.totalUsers}
            </p>
          </div>
          <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">领取率</p>
            <p class="mt-2 text-xl font-semibold">
              {formatPercent(mission.metrics.claimRate)}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {mission.metrics.claimedUsers}/{mission.metrics.completedUsers}
            </p>
          </div>
          <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">发放总额</p>
            <p class="mt-2 text-xl font-semibold">
              {mission.metrics.grantedAmountTotal}
            </p>
          </div>
          <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">已完成用户</p>
            <p class="mt-2 text-xl font-semibold">{mission.metrics.completedUsers}</p>
          </div>
          <div class="rounded-box border border-base-300 bg-base-200/40 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">已领取用户</p>
            <p class="mt-2 text-xl font-semibold">{mission.metrics.claimedUsers}</p>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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
                  bind:value={form.type}
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
                  bind:value={form.reward}
                />
              </label>
              <label class="label cursor-pointer justify-start gap-3 pt-8">
                <input
                  name="isActive"
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  bind:checked={form.isActive}
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
                bind:value={form.params}
              ></textarea>
            </div>

            <div class="flex justify-end">
              <button class="btn btn-primary" type="submit">保存修改</button>
            </div>
          </form>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="font-semibold">预览</h4>
                <p class="text-sm text-slate-500">
                  当前编辑中的配置会即时映射到右侧卡片。
                </p>
              </div>
              <span class={`badge ${preview.valid ? "badge-success" : "badge-warning"}`}>
                {preview.valid ? "Schema OK" : "待修正"}
              </span>
            </div>

            {#if !preview.valid}
              <div class="alert alert-warning text-sm">
                <span>{preview.error}</span>
              </div>
            {/if}

            <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
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
                  <p class="text-sm text-slate-600">{preview.description}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs uppercase tracking-[0.18em] text-slate-400">BONUS</p>
                  <p class="text-lg font-semibold text-slate-950">
                    {preview.reward}
                  </p>
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-500">
                  <span>{preview.progressLabel}</span>
                  <span>{preview.metricLabel ?? "每日签到"}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-500"
                    style={`width: ${preview.progressPercent}%`}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/each}
</section>
