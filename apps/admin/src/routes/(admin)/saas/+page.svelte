<script lang="ts">
  import { page } from "$app/stores"
  import type { SaasApiKeyIssue, SaasOverview } from "@reward/shared-types/saas"

  interface PageData {
    overview: SaasOverview | null
    error: string | null
    inviteToken: string | null
    billingSetupStatus: string | null
  }

  type InviteResult = {
    invite: {
      id: number
      email: string
      role: string
    }
    inviteUrl: string
  }

  let { data }: { data: PageData } = $props()

  const overview = $derived(data.overview)
  const actionError = $derived($page.form?.error as string | undefined)
  const issuedKey = $derived(
    ($page.form?.issuedKey as SaasApiKeyIssue | undefined) ?? null,
  )
  const rotatedKey = $derived(
    ($page.form?.rotatedKey as
      | {
          previousKey: { label: string; keyPrefix: string; expiresAt: string | Date }
          issuedKey: SaasApiKeyIssue
          overlapEndsAt: string | Date
        }
      | undefined) ?? null,
  )
  const inviteResult = $derived(
    ($page.form?.inviteResult as InviteResult | undefined) ?? null,
  )
  const tenants = $derived(overview?.tenants ?? [])
  const memberships = $derived(overview?.memberships ?? [])
  const projects = $derived(overview?.projects ?? [])
  const projectPrizes = $derived(overview?.projectPrizes ?? [])
  const apiKeys = $derived(overview?.apiKeys ?? [])
  const billingRuns = $derived(overview?.billingRuns ?? [])
  const topUps = $derived(overview?.topUps ?? [])
  const invites = $derived(overview?.invites ?? [])
  const tenantLinks = $derived(overview?.tenantLinks ?? [])
  const webhookEvents = $derived(overview?.webhookEvents ?? [])
  const recentUsage = $derived(overview?.recentUsage ?? [])

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString()
  }

  const tenantName = (tenantId: number) =>
    tenants.find((item) => item.tenant.id === tenantId)?.tenant.name ??
    `#${tenantId}`

  const projectLabel = (projectId: number) => {
    const project = projects.find((item) => item.id === projectId)
    return project
      ? `${project.name} · ${project.environment}`
      : `#${projectId}`
  }

  const tenantLinkChildren = (tenantId: number) =>
    tenantLinks.filter((item) => item.parentTenantId === tenantId)

  const projectBillingHints = (tenantId: number) =>
    billingRuns.filter((item) => item.tenantId === tenantId).slice(0, 2)
</script>

<div class="space-y-8">
  <section class="space-y-3">
    <div>
      <p class="text-sm uppercase tracking-[0.2em] text-slate-500">
        B2B Prize Engine
      </p>
      <h1 class="text-3xl font-semibold text-slate-900">SaaS 控制面</h1>
      <p class="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
        自动月结、Stripe webhook 队列补偿、客户自助绑卡与 Portal、membership
        邀请和代理客户树都只走 独立 `saas_*` 数据面，不影响 ToC
        用户、奖池和支付主链路。
      </p>
    </div>

    {#if data.error}
      <div class="alert alert-error text-sm">{data.error}</div>
    {/if}

    {#if actionError}
      <div class="alert alert-error text-sm">{actionError}</div>
    {/if}

    {#if data.billingSetupStatus === "success"}
      <div class="alert alert-success text-sm">
        Stripe 绑卡流程已完成，自动扣款会使用客户默认付款方式。
      </div>
    {:else if data.billingSetupStatus === "cancelled"}
      <div class="alert text-sm">Stripe 绑卡流程已取消。</div>
    {/if}

    {#if data.inviteToken}
      <form
        method="post"
        action="?/acceptInvite"
        class="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm"
      >
        <input type="hidden" name="token" value={data.inviteToken} />
        <div
          class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p class="text-sm font-semibold text-amber-900">待接受的租户邀请</p>
            <p class="mt-1 text-sm text-amber-800">
              当前页面检测到 invitation token。登录对应 admin 账号后可直接接受。
            </p>
          </div>
          <button class="btn btn-primary">Accept Invite</button>
        </div>
      </form>
    {/if}

    {#if issuedKey}
      <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
        <p class="text-sm font-semibold text-emerald-900">新 API Key 已签发</p>
        <p class="mt-1 text-sm text-emerald-800">
          {issuedKey.label} · {issuedKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-emerald-700">
          expires {formatDate(issuedKey.expiresAt)}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-emerald-200"
        >
          {issuedKey.apiKey}
        </code>
      </div>
    {/if}

    {#if rotatedKey}
      <div class="rounded-2xl border border-sky-300 bg-sky-50 p-4">
        <p class="text-sm font-semibold text-sky-900">API Key 已轮换</p>
        <p class="mt-1 text-sm text-sky-800">
          {rotatedKey.previousKey.label} · {rotatedKey.previousKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-sky-700">
          old key valid until {formatDate(rotatedKey.overlapEndsAt)}
        </p>
        <p class="mt-3 text-sm text-sky-800">
          new key: {rotatedKey.issuedKey.label} · {rotatedKey.issuedKey.keyPrefix}
        </p>
        <p class="mt-1 text-xs text-sky-700">
          expires {formatDate(rotatedKey.issuedKey.expiresAt)}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-sky-200"
        >
          {rotatedKey.issuedKey.apiKey}
        </code>
      </div>
    {/if}

    {#if inviteResult}
      <div class="rounded-2xl border border-sky-300 bg-sky-50 p-4">
        <p class="text-sm font-semibold text-sky-900">邀请已创建</p>
        <p class="mt-1 text-sm text-sky-800">
          {inviteResult.invite.email} · {inviteResult.invite.role}
        </p>
        <code
          class="mt-3 block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-sky-200"
        >
          {inviteResult.inviteUrl}
        </code>
      </div>
    {/if}
  </section>

  <section class="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Tenants</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.tenantCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Projects</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.projectCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Keys</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.apiKeyCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Players</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.playerCount ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Draws 30d</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.drawCount30d ?? 0}
      </p>
    </article>
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-slate-500">Billable</p>
      <p class="mt-3 text-3xl font-semibold">
        {overview?.summary.billableTenantCount ?? 0}
      </p>
    </article>
  </section>

  <section class="grid gap-6 xl:grid-cols-3">
    <form
      method="post"
      action="?/createTenant"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 class="text-lg font-semibold">Create Tenant</h2>
      <div class="mt-4 space-y-3">
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder="Acme Rewards"
        />
        <input
          class="input input-bordered w-full"
          name="slug"
          placeholder="acme-rewards"
        />
        <input
          class="input input-bordered w-full"
          name="billingEmail"
          placeholder="billing@acme.com"
        />
        <select class="select select-bordered w-full" name="status">
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="archived">archived</option>
        </select>
      </div>
      <button class="btn btn-primary mt-5 w-full">Create Tenant</button>
    </form>

    <form
      method="post"
      action="?/createProject"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 class="text-lg font-semibold">Create Project</h2>
      <div class="mt-4 grid gap-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder="Spring Launch"
        />
        <input
          class="input input-bordered w-full"
          name="slug"
          placeholder="spring-launch"
        />
        <div class="grid grid-cols-2 gap-3">
          <select class="select select-bordered w-full" name="environment">
            <option value="sandbox">sandbox</option>
            <option value="live">live</option>
          </select>
          <select class="select select-bordered w-full" name="status">
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="archived">archived</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="currency"
            value="USD"
          />
          <input
            class="input input-bordered w-full"
            name="drawCost"
            value="0"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="prizePoolBalance"
            value="0"
          />
          <input
            class="input input-bordered w-full"
            name="missWeight"
            value="0"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="fairnessEpochSeconds"
            value="3600"
          />
          <input
            class="input input-bordered w-full"
            name="maxDrawCount"
            value="1"
          />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <input
            class="input input-bordered w-full"
            name="apiRateLimitBurst"
            value="120"
          />
          <input
            class="input input-bordered w-full"
            name="apiRateLimitHourly"
            value="3600"
          />
          <input
            class="input input-bordered w-full"
            name="apiRateLimitDaily"
            value="86400"
          />
        </div>
        <p class="text-xs text-slate-500">
          API quota per key: burst/minute, hourly/hour, daily/day
        </p>
      </div>
      <button class="btn btn-primary mt-5 w-full">Create Project</button>
    </form>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Members & Invites</h2>
      <form method="post" action="?/assignMembership" class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="adminEmail"
          placeholder="operator@client.com"
        />
        <select class="select select-bordered w-full" name="role">
          <option value="tenant_owner">tenant_owner</option>
          <option value="tenant_operator">tenant_operator</option>
          <option value="agent_manager">agent_manager</option>
          <option value="agent_viewer">agent_viewer</option>
        </select>
        <button class="btn btn-secondary w-full">Save Membership</button>
      </form>

      <div class="my-5 border-t border-slate-200"></div>

      <form method="post" action="?/createInvite" class="space-y-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="email"
          placeholder="new-owner@client.com"
        />
        <select class="select select-bordered w-full" name="role">
          <option value="tenant_owner">tenant_owner</option>
          <option value="tenant_operator">tenant_operator</option>
          <option value="agent_manager">agent_manager</option>
          <option value="agent_viewer">agent_viewer</option>
        </select>
        <button class="btn btn-primary w-full">Create Invite</button>
      </form>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-3">
    <form
      method="post"
      action="?/linkTenant"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 class="text-lg font-semibold">Agent Client Tree</h2>
      <p class="mt-2 text-sm text-slate-500">
        把代理租户挂到客户租户上，形成代理客户树。
      </p>
      <div class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="parentTenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name} · parent</option>
          {/each}
        </select>
        <select class="select select-bordered w-full" name="childTenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name} · child</option>
          {/each}
        </select>
        <select class="select select-bordered w-full" name="linkType">
          <option value="agent_client">agent_client</option>
        </select>
      </div>
      <button class="btn btn-primary mt-5 w-full">Link Tenants</button>
    </form>

    <form
      method="post"
      action="?/issueKey"
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 class="text-lg font-semibold">Issue API Key</h2>
      <div class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="projectId">
          {#each projects as project}
            <option value={project.id}
              >{project.name} · {project.environment}</option
            >
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="label"
          placeholder="Production server key"
        />
        <input
          class="input input-bordered w-full"
          type="datetime-local"
          name="expiresAt"
        />
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="catalog:read"
            checked
          />
          <span>catalog:read</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="fairness:read"
            checked
          />
          <span>fairness:read</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="draw:write"
            checked
          />
          <span>draw:write</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            class="checkbox"
            type="checkbox"
            name="scopes"
            value="ledger:read"
            checked
          />
          <span>ledger:read</span>
        </label>
      </div>
      <button class="btn btn-primary mt-5 w-full">Issue Key</button>
    </form>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Billing Ops</h2>
      <form method="post" action="?/createBillingRun" class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            type="datetime-local"
            name="periodStart"
          />
          <input
            class="input input-bordered w-full"
            type="datetime-local"
            name="periodEnd"
          />
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="finalize" checked />
          <span>Finalize invoice</span>
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="sendInvoice" />
          <span>Send invoice</span>
        </label>
        <button class="btn btn-secondary w-full">Create Billing Run</button>
      </form>

      <div class="my-5 border-t border-slate-200"></div>

      <form method="post" action="?/createTopUp" class="space-y-3">
        <select class="select select-bordered w-full" name="tenantId">
          {#each tenants as item}
            <option value={item.tenant.id}>{item.tenant.name}</option>
          {/each}
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            class="input input-bordered w-full"
            name="amount"
            value="100"
          />
          <input
            class="input input-bordered w-full"
            name="currency"
            value="USD"
          />
        </div>
        <input
          class="input input-bordered w-full"
          name="note"
          placeholder="Manual customer balance credit"
        />
        <button class="btn btn-secondary w-full">Create Manual Top-up</button>
      </form>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-3">
    <div
      class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2"
    >
      <h2 class="text-lg font-semibold">Tenants</h2>
      <div class="mt-4 space-y-4">
        {#each tenants as item}
          <article class="rounded-2xl border border-slate-200 p-4">
            <div
              class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold">{item.tenant.name}</h3>
                  <span class="badge badge-outline">{item.tenant.status}</span>
                  <span class="badge badge-outline"
                    >{item.billing?.planCode ?? "unbilled"}</span
                  >
                </div>
                <p class="mt-1 text-sm text-slate-500">
                  {item.tenant.slug} · {item.tenant.billingEmail ??
                    "no billing email"} · projects {item.projectCount} · draws 30d
                  {item.drawCount30d}
                </p>
                {#if item.billing}
                  <p class="mt-2 text-sm text-slate-600">
                    {item.billing.currency} · base {item.billing.baseMonthlyFee} ·
                    draw {item.billing.drawFee} · {item.billing
                      .collectionMethod} · auto {item.billing.autoBillingEnabled
                      ? "on"
                      : "off"}
                  </p>
                {/if}
              </div>
              <div class="flex flex-col gap-2 lg:min-w-[18rem]">
                <form
                  method="post"
                  action="?/saveBilling"
                  class="grid gap-2 rounded-2xl bg-slate-50 p-3"
                >
                  <input type="hidden" name="tenantId" value={item.tenant.id} />
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      class="select select-bordered select-sm w-full"
                      name="planCode"
                    >
                      <option
                        selected={item.billing?.planCode === "starter"}
                        value="starter">starter</option
                      >
                      <option
                        selected={item.billing?.planCode === "growth"}
                        value="growth">growth</option
                      >
                      <option
                        selected={item.billing?.planCode === "enterprise"}
                        value="enterprise">enterprise</option
                      >
                    </select>
                    <input
                      class="input input-bordered input-sm w-full"
                      name="currency"
                      value={item.billing?.currency ?? "USD"}
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      class="input input-bordered input-sm w-full"
                      name="baseMonthlyFee"
                      value={item.billing?.baseMonthlyFee ?? "0"}
                    />
                    <input
                      class="input input-bordered input-sm w-full"
                      name="drawFee"
                      value={item.billing?.drawFee ?? "0.0000"}
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      class="select select-bordered select-sm w-full"
                      name="collectionMethod"
                    >
                      <option
                        selected={item.billing?.collectionMethod ===
                          "send_invoice"}
                        value="send_invoice">send_invoice</option
                      >
                      <option
                        selected={item.billing?.collectionMethod ===
                          "charge_automatically"}
                        value="charge_automatically"
                        >charge_automatically</option
                      >
                    </select>
                    <input
                      class="input input-bordered input-sm w-full"
                      name="portalConfigurationId"
                      value={item.billing?.portalConfigurationId ?? ""}
                      placeholder="bpc_..."
                    />
                  </div>
                  <input
                    class="input input-bordered input-sm w-full"
                    name="stripeCustomerId"
                    value={item.billing?.stripeCustomerId ?? ""}
                    placeholder="cus_..."
                  />
                  <label class="label cursor-pointer justify-start gap-3 py-0">
                    <input
                      class="checkbox checkbox-sm"
                      type="checkbox"
                      name="autoBillingEnabled"
                      checked={item.billing?.autoBillingEnabled ?? false}
                    />
                    <span>Auto month close</span>
                  </label>
                  <label class="label cursor-pointer justify-start gap-3 py-0">
                    <input
                      class="checkbox checkbox-sm"
                      type="checkbox"
                      name="isBillable"
                      checked={item.billing?.isBillable ?? true}
                    />
                    <span>Billable</span>
                  </label>
                  <button class="btn btn-sm btn-secondary">Save Billing</button>
                </form>
                <div class="grid grid-cols-2 gap-2">
                  <form method="post" action="?/openBillingSetup">
                    <input
                      type="hidden"
                      name="tenantId"
                      value={item.tenant.id}
                    />
                    <button class="btn btn-sm w-full">Bind Card</button>
                  </form>
                  <form method="post" action="?/openBillingPortal">
                    <input
                      type="hidden"
                      name="tenantId"
                      value={item.tenant.id}
                    />
                    <button class="btn btn-sm w-full">Open Portal</button>
                  </form>
                </div>
              </div>
            </div>

            {#if tenantLinkChildren(item.tenant.id).length > 0}
              <div class="mt-4 rounded-2xl bg-slate-50 p-3">
                <p class="text-sm font-medium text-slate-700">
                  Agent Client Tree
                </p>
                <div class="mt-2 space-y-2">
                  {#each tenantLinkChildren(item.tenant.id) as link}
                    <div
                      class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <span
                        >{tenantName(link.parentTenantId)} → {tenantName(
                          link.childTenantId,
                        )}</span
                      >
                      <form method="post" action="?/unlinkTenant">
                        <input type="hidden" name="linkId" value={link.id} />
                        <button class="btn btn-xs btn-ghost text-rose-600"
                          >unlink</button
                        >
                      </form>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if projectBillingHints(item.tenant.id).length > 0}
              <div class="mt-4 grid gap-2 md:grid-cols-2">
                {#each projectBillingHints(item.tenant.id) as billingRun}
                  <div
                    class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600"
                  >
                    <p class="font-medium text-slate-800">
                      Recent run #{billingRun.id}
                    </p>
                    <p>
                      {billingRun.status} · total {billingRun.totalAmount}
                      {billingRun.currency}
                    </p>
                    <p>
                      {formatDate(billingRun.periodStart)} → {formatDate(
                        billingRun.periodEnd,
                      )}
                    </p>
                  </div>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Create Prize</h2>
      <form method="post" action="?/createPrize" class="mt-4 space-y-3">
        <select class="select select-bordered w-full" name="projectId">
          {#each projects as project}
            <option value={project.id}
              >{project.name} · {project.environment}</option
            >
          {/each}
        </select>
        <input
          class="input input-bordered w-full"
          name="name"
          placeholder="10 USD coupon"
        />
        <div class="grid grid-cols-3 gap-3">
          <input class="input input-bordered w-full" name="stock" value="100" />
          <input class="input input-bordered w-full" name="weight" value="1" />
          <input
            class="input input-bordered w-full"
            name="rewardAmount"
            value="10"
          />
        </div>
        <label class="label cursor-pointer justify-start gap-3">
          <input class="checkbox" type="checkbox" name="isActive" checked />
          <span>Active</span>
        </label>
        <button class="btn btn-secondary w-full">Create Prize</button>
      </form>
    </div>
  </section>

  <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 class="text-lg font-semibold">Projects</h2>
        <p class="text-sm text-slate-500">
          当前窗口消耗按活跃 API key 聚合展示，实际 throttling 仍按 key 独立执行。
        </p>
      </div>
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      {#each projects as project}
        <article class="rounded-2xl border border-slate-200 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-slate-900">{project.name}</h3>
            <span class="badge badge-outline">{project.environment}</span>
            <span class="badge badge-outline">{project.status}</span>
          </div>
          <p class="mt-1 text-sm text-slate-500">
            {tenantName(project.tenantId)} · {project.slug} · draw cost
            {project.drawCost} · pool {project.prizePoolBalance}
            {project.currency}
          </p>
          <p class="mt-2 text-sm text-slate-600">
            Per-key quota: burst {project.apiRateLimitBurst}/min · hourly
            {project.apiRateLimitHourly}/h · daily {project.apiRateLimitDaily}/day
          </p>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">Burst</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.burst.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.burst.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                reset {formatDate(project.apiRateLimitUsage?.aggregate.burst.resetAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">Hourly</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.hourly.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.hourly.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                reset
                {formatDate(project.apiRateLimitUsage?.aggregate.hourly.resetAt)}
              </p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-3 text-sm">
              <p class="text-slate-500">Daily</p>
              <p class="mt-1 font-medium text-slate-900">
                {project.apiRateLimitUsage?.aggregate.daily.used ?? 0} /
                {project.apiRateLimitUsage?.aggregate.daily.limit ?? 0}
              </p>
              <p class="text-xs text-slate-400">
                keys {project.apiRateLimitUsage?.activeKeyCount ?? 0}
              </p>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Memberships</h2>
      <div class="mt-4 space-y-2">
        {#each memberships as membership}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-800">
                {membership.adminEmail ?? `admin#${membership.adminId}`}
              </p>
              <p class="text-slate-500">
                {tenantName(membership.tenantId)} · {membership.role}
              </p>
            </div>
            <form method="post" action="?/deleteMembership">
              <input
                type="hidden"
                name="tenantId"
                value={membership.tenantId}
              />
              <input type="hidden" name="membershipId" value={membership.id} />
              <button class="btn btn-xs btn-ghost text-rose-600">remove</button>
            </form>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Invites</h2>
      <div class="mt-4 space-y-2">
        {#each invites as invite}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-800">{invite.email}</p>
              <p class="text-slate-500">
                {tenantName(invite.tenantId)} · {invite.role} · {invite.status}
              </p>
              <p class="text-slate-400">
                expires {formatDate(invite.expiresAt)}
              </p>
            </div>
            {#if invite.status === "pending"}
              <form method="post" action="?/revokeInvite">
                <input type="hidden" name="tenantId" value={invite.tenantId} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button class="btn btn-xs btn-ghost text-rose-600"
                  >revoke</button
                >
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">API Keys</h2>
      <div class="mt-4 space-y-3">
        {#each apiKeys as apiKey}
          <div class="rounded-2xl border border-slate-200 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-medium text-slate-900">{apiKey.label}</p>
                <p class="mt-1 text-sm text-slate-500">
                  {projectLabel(apiKey.projectId)} · {apiKey.maskedKey}
                </p>
                <p class="mt-1 text-xs text-slate-400">
                  {apiKey.scopes.join(", ")}
                </p>
                <p class="mt-1 text-xs text-slate-400">
                  expires {formatDate(apiKey.expiresAt)}
                </p>
                {#if apiKey.rotatedToApiKeyId}
                  <p class="mt-1 text-xs text-sky-600">
                    rotated to key #{apiKey.rotatedToApiKeyId}
                  </p>
                {/if}
                {#if apiKey.rotatedFromApiKeyId}
                  <p class="mt-1 text-xs text-sky-600">
                    rotated from key #{apiKey.rotatedFromApiKeyId}
                  </p>
                {/if}
                {#if apiKey.lastUsedAt}
                  <p class="mt-1 text-xs text-slate-400">
                    last used {formatDate(apiKey.lastUsedAt)}
                  </p>
                {/if}
                {#if apiKey.apiRateLimitUsage}
                  <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                      burst {apiKey.apiRateLimitUsage.burst.used}/
                      {apiKey.apiRateLimitUsage.burst.limit}
                    </div>
                    <div class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                      hour {apiKey.apiRateLimitUsage.hourly.used}/
                      {apiKey.apiRateLimitUsage.hourly.limit}
                    </div>
                    <div class="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                      day {apiKey.apiRateLimitUsage.daily.used}/
                      {apiKey.apiRateLimitUsage.daily.limit}
                    </div>
                  </div>
                {/if}
              </div>
              {#if !apiKey.revokedAt}
                <div class="space-y-2">
                  <form method="post" action="?/rotateKey" class="space-y-2">
                    <input
                      type="hidden"
                      name="projectId"
                      value={apiKey.projectId}
                    />
                    <input type="hidden" name="keyId" value={apiKey.id} />
                    {#each apiKey.scopes as scope}
                      <input type="hidden" name="scopes" value={scope} />
                    {/each}
                    <input
                      class="input input-bordered input-xs w-full"
                      name="label"
                      placeholder={apiKey.label}
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      type="datetime-local"
                      name="expiresAt"
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="overlapSeconds"
                      value="3600"
                    />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="reason"
                      placeholder="scheduled rotation"
                    />
                    <button class="btn btn-xs btn-secondary w-full">rotate</button>
                  </form>
                  <form method="post" action="?/revokeKey" class="space-y-2">
                    <input
                      type="hidden"
                      name="projectId"
                      value={apiKey.projectId}
                    />
                    <input type="hidden" name="keyId" value={apiKey.id} />
                    <input
                      class="input input-bordered input-xs w-full"
                      name="reason"
                      placeholder="revoke reason"
                    />
                    <button class="btn btn-xs btn-ghost text-rose-600 w-full"
                      >revoke</button
                    >
                  </form>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Project Prizes</h2>
      <div class="mt-4 space-y-3">
        {#each projectPrizes as prize}
          <form
            method="post"
            action="?/updatePrize"
            class="rounded-2xl border border-slate-200 p-4"
          >
            <input type="hidden" name="projectId" value={prize.projectId} />
            <input type="hidden" name="prizeId" value={prize.id} />
            <p class="mb-3 text-sm text-slate-500">
              {projectLabel(prize.projectId)}
            </p>
            <div class="grid gap-3">
              <input
                class="input input-bordered w-full"
                name="name"
                value={prize.name}
              />
              <div class="grid grid-cols-3 gap-3">
                <input
                  class="input input-bordered w-full"
                  name="stock"
                  value={prize.stock}
                />
                <input
                  class="input input-bordered w-full"
                  name="weight"
                  value={prize.weight}
                />
                <input
                  class="input input-bordered w-full"
                  name="rewardAmount"
                  value={prize.rewardAmount}
                />
              </div>
              <label class="label cursor-pointer justify-start gap-3">
                <input
                  class="checkbox"
                  type="checkbox"
                  name="isActive"
                  checked={prize.isActive}
                />
                <span>Active</span>
              </label>
            </div>
            <div class="mt-4 flex gap-3">
              <button class="btn btn-sm btn-secondary">Save</button>
              <button
                class="btn btn-sm"
                type="submit"
                formaction="?/deletePrize">Delete</button
              >
            </div>
          </form>
        {/each}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Billing Runs</h2>
      <div class="mt-4 space-y-3">
        {#each billingRuns as billingRun}
          <div class="rounded-2xl border border-slate-200 p-4">
            <div
              class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <p class="font-medium text-slate-900">
                  #{billingRun.id} · {tenantName(billingRun.tenantId)}
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  {billingRun.status} · {billingRun.totalAmount}
                  {billingRun.currency} · draws {billingRun.drawCount}
                </p>
                <p class="text-xs text-slate-400">
                  {formatDate(billingRun.periodStart)} → {formatDate(
                    billingRun.periodEnd,
                  )}
                </p>
              </div>
              <div class="grid gap-2">
                <form
                  method="post"
                  action="?/syncBillingRun"
                  class="flex flex-wrap gap-2"
                >
                  <input
                    type="hidden"
                    name="billingRunId"
                    value={billingRun.id}
                  />
                  <label class="label cursor-pointer gap-2 py-0 text-xs">
                    <input
                      class="checkbox checkbox-xs"
                      type="checkbox"
                      name="finalize"
                      checked
                    />
                    <span>finalize</span>
                  </label>
                  <label class="label cursor-pointer gap-2 py-0 text-xs">
                    <input
                      class="checkbox checkbox-xs"
                      type="checkbox"
                      name="sendInvoice"
                    />
                    <span>send</span>
                  </label>
                  <button class="btn btn-xs btn-secondary">sync</button>
                </form>
                <div class="flex flex-wrap gap-2">
                  <form method="post" action="?/refreshBillingRun">
                    <input
                      type="hidden"
                      name="billingRunId"
                      value={billingRun.id}
                    />
                    <button class="btn btn-xs">refresh</button>
                  </form>
                  <form
                    method="post"
                    action="?/settleBillingRun"
                    class="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="billingRunId"
                      value={billingRun.id}
                    />
                    <label class="label cursor-pointer gap-2 py-0 text-xs">
                      <input
                        class="checkbox checkbox-xs"
                        type="checkbox"
                        name="paidOutOfBand"
                      />
                      <span>OOB</span>
                    </label>
                    <button class="btn btn-xs">settle</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Webhook Queue</h2>
      <div class="mt-4 space-y-3">
        {#each webhookEvents as event}
          <div class="rounded-2xl border border-slate-200 p-4 text-sm">
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium text-slate-900">{event.eventType}</p>
              <span class="badge badge-outline">{event.status}</span>
            </div>
            <p class="mt-1 text-slate-500">event {event.eventId}</p>
            <p class="mt-1 text-slate-500">
              tenant {event.tenantId ?? "—"} · billing run {event.billingRunId ??
                "—"} · attempts {event.attempts}
            </p>
            <p class="mt-1 text-slate-400">
              next {formatDate(event.nextAttemptAt)} · processed {formatDate(
                event.processedAt,
              )}
            </p>
            {#if event.lastError}
              <p class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                {event.lastError}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-2">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Manual Top-ups</h2>
      <div class="mt-4 space-y-2">
        {#each topUps as topUp}
          <div
            class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          >
            <div>
              <p class="font-medium text-slate-900">
                {tenantName(topUp.tenantId)} · {topUp.amount}
                {topUp.currency}
              </p>
              <p class="text-slate-500">
                {topUp.status} · {topUp.note ?? "no note"}
              </p>
            </div>
            {#if topUp.status !== "synced"}
              <form method="post" action="?/syncTopUp">
                <input type="hidden" name="topUpId" value={topUp.id} />
                <button class="btn btn-xs btn-secondary">sync</button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold">Recent Usage</h2>
      <div class="mt-4 space-y-2">
        {#each recentUsage as usage}
          <div class="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
            <p class="font-medium text-slate-900">
              {tenantName(usage.tenantId)} · {projectLabel(usage.projectId)}
            </p>
            <p class="text-slate-500">
              {usage.eventType} · units {usage.units} · amount {usage.amount}
              {usage.currency}
            </p>
            <p class="text-slate-400">{formatDate(usage.createdAt)}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>
