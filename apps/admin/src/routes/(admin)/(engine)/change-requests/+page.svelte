<script lang="ts">
  import { page } from "$app/stores"

  import AdminPageHeader from "$lib/components/admin-page-header.svelte"

  import AdminChangeRequestsSection from "../(shared)/control-center/admin-change-requests-section.svelte"
  import type { PageData } from "../(shared)/control-center/page-support"
  import ChangeRequestModuleTabs from "./change-request-module-tabs.svelte"

  let { data }: { data: PageData } = $props()

  let stepUpCode = $state("")

  const changeRequests = $derived(data.changeRequests ?? [])
  const mfaEnabled = $derived(
    Boolean(data.admin?.mfaEnabled ?? data.mfaStatus?.mfaEnabled),
  )
  const actionError = $derived($page.form?.error as string | undefined)
  const draftRequests = $derived(
    changeRequests.filter((request) => request.status === "draft"),
  )
  const reviewRequests = $derived(
    changeRequests.filter((request) => request.status === "pending_approval"),
  )
  const releaseRequests = $derived(
    changeRequests.filter(
      (request) =>
        request.status === "approved" || request.status === "published",
    ),
  )
  const draftCount = $derived(draftRequests.length)
  const approvalCount = $derived(reviewRequests.length)
  const approvedCount = $derived(
    changeRequests.filter((request) => request.status === "approved").length,
  )
  const secondConfirmationCount = $derived(
    changeRequests.filter((request) => request.requiresSecondConfirmation)
      .length,
  )
  const publishedCount = $derived(
    changeRequests.filter((request) => request.status === "published").length,
  )
  const releaseReadyCount = $derived(
    changeRequests.filter((request) => request.status === "approved").length,
  )
  const activeModule = $derived.by(() => {
    if ($page.url.pathname === "/change-requests/drafts") return "drafts"
    if ($page.url.pathname === "/change-requests/review") return "review"
    if ($page.url.pathname === "/change-requests/release") return "release"
    return "hub"
  })
  const isHubModule = $derived(activeModule === "hub")
  const isDraftsModule = $derived(activeModule === "drafts")
  const isReviewModule = $derived(activeModule === "review")
  const isReleaseModule = $derived(activeModule === "release")
  const pageDescription = $derived.by(() => {
    if (activeModule === "drafts") {
      return "草稿请求单独成页，只处理 draft authoring、提交审批和驳回说明。"
    }
    if (activeModule === "review") {
      return "待审批请求拆成单独 review queue，避免和生产发布状态混排。"
    }
    if (activeModule === "release") {
      return "已批准与已发布请求独立成 release 模块，集中处理 MFA step-up 和生产发布。"
    }
    return "共享引擎配置、支付通道与 SaaS 运营兜底都在这里排队流转，确保草稿、审批与生产发布完全解耦。"
  })
  const requestModules = $derived([
    {
      href: "/change-requests/drafts",
      eyebrow: "Authoring Queue",
      title: "Drafts",
      description:
        "草稿 authoring 和 submit queue 分开处理，先校验内容再进入审批流。",
      badge: `${draftCount}`,
    },
    {
      href: "/change-requests/review",
      eyebrow: "Approval Queue",
      title: "Review",
      description:
        "待审批请求单独进入 governance review，不再和已批准或已发布请求混在一起。",
      badge: `${approvalCount}`,
    },
    {
      href: "/change-requests/release",
      eyebrow: "Release Queue",
      title: "Release",
      description:
        "批准后的发布与已发布记录归到 release 阶段，MFA 与二次确认集中在这里。",
      badge: `${approvedCount}`,
    },
  ])
</script>

<div class="space-y-6">
  <AdminPageHeader
    context="Workspace · governanceQueue"
    eyebrow="Engine"
    title="Change Requests"
    description={pageDescription}
  />

  <ChangeRequestModuleTabs />

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

  <section class="admin-summary-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Draft
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {draftCount}
          </p>
          <span class="badge badge-outline">staged</span>
        </div>
        <p class="text-sm text-slate-500">
          Requests still held at draft state before operator submission.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Pending Approval
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {approvalCount}
          </p>
          <span class="badge badge-outline">review</span>
        </div>
        <p class="text-sm text-slate-500">
          Queue items waiting for governance approval before release.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Approved
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {approvedCount}
          </p>
          <span class="badge badge-outline">ready</span>
        </div>
        <p class="text-sm text-slate-500">
          Requests already cleared and waiting only for publish step-up.
        </p>
      </div>
    </article>

    <article class="card bg-base-100 shadow">
      <div class="card-body gap-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Second Confirmation
        </p>
        <div class="flex items-end justify-between gap-4">
          <p class="font-[Newsreader] text-4xl text-[var(--admin-ink)]">
            {secondConfirmationCount}
          </p>
          <span class="badge badge-outline">gated</span>
        </div>
        <p class="text-sm text-slate-500">
          Requests requiring explicit confirmation phrases before submission or
          publish.
        </p>
      </div>
    </article>
  </section>

  {#if isHubModule}
    <section
      class="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]"
    >
      <div class="card bg-base-100 shadow">
        <div class="card-body space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Governance Drawer
              </p>
              <h2
                class="mt-2 font-['Newsreader'] text-[1.95rem] leading-tight text-[var(--admin-ink)]"
              >
                分阶段发布入口
              </h2>
            </div>
          </div>

          <p class="max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
            将草稿、审批和发布拆成独立模块。先进入对应阶段，再处理
            queue、二次确认和生产发布。
          </p>

          <div class="grid gap-4 lg:grid-cols-3">
            {#each requestModules as module}
              <a
                class="rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-5 transition hover:border-[var(--admin-primary)] hover:bg-[var(--admin-paper)]"
                href={module.href}
              >
                <div class="flex items-start justify-between gap-3">
                  <p
                    class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
                  >
                    {module.eyebrow}
                  </p>
                  <span class="badge badge-outline">{module.badge}</span>
                </div>
                <h3
                  class="mt-3 font-['Newsreader'] text-[1.55rem] leading-tight text-[var(--admin-ink)]"
                >
                  {module.title}
                </h3>
                <p class="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  {module.description}
                </p>
                <div
                  class="mt-4 inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-primary)]"
                >
                  <span>Open Module</span>
                  <span class="material-symbols-outlined text-[1rem]"
                    >arrow_forward</span
                  >
                </div>
              </a>
            {/each}
          </div>
        </div>
      </div>

      <aside class="space-y-6">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Lens
              </p>
              <h2 class="card-title mt-2">Governance Protocol</h2>
              <p class="text-sm text-slate-500">
                草稿、审批和发布是分离阶段。发布需要额外的 MFA
                step-up，并且敏感请求必须填写口令。
              </p>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Visible requests</dt>
                <dd class="font-mono text-xs">{changeRequests.length}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Approval backlog</dt>
                <dd class="font-mono text-xs">{approvalCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Publish ready</dt>
                <dd class="font-mono text-xs">{approvedCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Published</dt>
                <dd class="font-mono text-xs">{publishedCount}</dd>
              </div>
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isDraftsModule}
    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
    >
      <div class="min-w-0">
        <AdminChangeRequestsSection
          changeRequests={draftRequests}
          {mfaEnabled}
          {stepUpCode}
        />
      </div>

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Draft Protocol
              </p>
              <h2 class="card-title mt-2">Submission Flow</h2>
              <p class="text-sm text-slate-500">
                草稿阶段先填写二次确认口令和拒绝说明，再进入提交审批动作。
              </p>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Draft backlog</dt>
                <dd class="font-mono text-xs">{draftCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Second confirmation</dt>
                <dd class="font-mono text-xs">{secondConfirmationCount}</dd>
              </div>
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isReviewModule}
    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
    >
      <div class="min-w-0">
        <AdminChangeRequestsSection
          changeRequests={reviewRequests}
          {mfaEnabled}
          {stepUpCode}
        />
      </div>

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Review Lens
              </p>
              <h2 class="card-title mt-2">Approval Backlog</h2>
              <p class="text-sm text-slate-500">
                审批模块只看待批准请求，避免把审批动作和发布动作混在同一个屏幕里。
              </p>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Pending approval</dt>
                <dd class="font-mono text-xs">{approvalCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Second confirmation</dt>
                <dd class="font-mono text-xs">
                  {reviewRequests.filter(
                    (request) => request.requiresSecondConfirmation,
                  ).length}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}

  {#if isReleaseModule}
    <section
      class="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
    >
      <div class="min-w-0">
        <AdminChangeRequestsSection
          changeRequests={releaseRequests}
          {mfaEnabled}
          {stepUpCode}
        />
      </div>

      <aside class="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Publish Step-Up
              </p>
              <h2 class="card-title mt-2">Release Verification</h2>
              <p class="text-sm text-slate-500">
                发布配置或通道变更前，在这里输入管理员 MFA step-up 码。
              </p>
            </div>

            <div
              class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
            >
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm font-medium text-slate-900">
                  Verification State
                </p>
                <span
                  class={`badge ${mfaEnabled ? "badge-success" : "badge-warning"}`}
                >
                  {mfaEnabled ? "MFA Enabled" : "MFA Required"}
                </span>
              </div>

              <label class="form-control mt-4">
                <span class="label-text mb-2">MFA 验证码</span>
                <input
                  name="totpCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  class="input input-bordered"
                  bind:value={stepUpCode}
                  placeholder="发布前输入管理员 MFA 验证码"
                  disabled={!mfaEnabled}
                />
              </label>

              {#if !mfaEnabled}
                <p class="mt-4 text-sm text-warning">
                  请先到 Config 页面启用管理员 MFA，再执行生产发布。
                </p>
              {/if}
            </div>
          </div>
        </section>

        <section class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div>
              <p
                class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
              >
                Queue Lens
              </p>
              <h2 class="card-title mt-2">Release Protocol</h2>
              <p class="text-sm text-slate-500">
                仅在 release 模块里处理发布前 MFA、二次确认和已发布记录复查。
              </p>
            </div>

            <dl class="space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <dt>Release ready</dt>
                <dd class="font-mono text-xs">{releaseReadyCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Published</dt>
                <dd class="font-mono text-xs">{publishedCount}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt>Visible release records</dt>
                <dd class="font-mono text-xs">{releaseRequests.length}</dd>
              </div>
            </dl>
          </div>
        </section>
      </aside>
    </section>
  {/if}
</div>
