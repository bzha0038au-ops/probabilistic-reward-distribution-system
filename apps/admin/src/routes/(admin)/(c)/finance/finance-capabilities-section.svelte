<script lang="ts">
  import {
    createFinancePageSupport,
    getProviderConfigIssues,
    readStringArray,
  } from "./page-support"
  import type { PageData } from "./page-support"

  type Translate = (key: string) => string

  let {
    paymentCapabilities,
    t,
  }: {
    paymentCapabilities: PageData["paymentCapabilities"]
    t: Translate
  } = $props()

  const support = $derived(createFinancePageSupport(t))
</script>

{#if paymentCapabilities}
  <section class="mt-6 card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div class="space-y-2">
        <p
          class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
        >
          Routing Status
        </p>
        <h2 class="card-title">{t("finance.capabilities.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.capabilities.description")}
        </p>
      </div>
      <div
        class={`alert text-sm ${paymentCapabilities.automatedExecutionEnabled ? "alert-error" : "alert-warning"}`}
      >
        <span>
          {paymentCapabilities.automatedExecutionEnabled
            ? t("finance.capabilities.automatedRequested")
            : t("finance.capabilities.manualOnly")}
        </span>
      </div>
      <div class="grid gap-4 text-sm md:grid-cols-3">
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
        >
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.mode")}
          </p>
          <p class="mt-1 font-medium">
            {support.paymentOperatingModeLabel(
              paymentCapabilities.operatingMode,
            )}
          </p>
        </div>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
        >
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.activeProviders")}
          </p>
          <p class="mt-1 font-medium">
            {paymentCapabilities.activeProviderCount}
          </p>
        </div>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper-strong)] p-4"
        >
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.configuredAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {support.formatAdapterList(
              paymentCapabilities.configuredProviderAdapters,
            )}
          </p>
        </div>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 md:col-span-3"
        >
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.registeredAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {support.formatAdapterList(
              paymentCapabilities.registeredAdapterKeys,
            )}
          </p>
        </div>
        <div
          class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4 md:col-span-3"
        >
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.implementedAdapters")}
          </p>
          <p class="mt-1 font-medium">
            {support.formatAdapterList(
              paymentCapabilities.implementedAutomatedAdapters,
            )}
          </p>
        </div>
      </div>
      <div
        class="rounded-[0.95rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-4"
      >
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          {t("finance.capabilities.missingCapabilities")}
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {#each readStringArray(paymentCapabilities.missingCapabilities) as gap}
            <li>{support.paymentCapabilityGapLabel(gap)}</li>
          {/each}
        </ul>
      </div>
      <div class="border-t border-base-300 pt-4">
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          >
            {t("finance.capabilities.governanceTitle")}
          </p>
          <p class="mt-1 text-sm text-slate-500">
            {t("finance.capabilities.governanceDescription")}
          </p>
        </div>
        <div class="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
            >
              {t("finance.capabilities.editableFields")}
            </p>
            <p class="mt-1 font-medium">
              {support.formatAdapterList(
                readStringArray(
                  paymentCapabilities.providerConfigGovernance
                    ?.adminEditableFields,
                ).map(support.paymentConfigFieldLabel),
              )}
            </p>
          </div>
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
            >
              {t("finance.capabilities.secretReferenceFields")}
            </p>
            <p class="mt-1 font-medium">
              {support.formatAdapterList(
                readStringArray(
                  paymentCapabilities.providerConfigGovernance
                    ?.secretReferenceFields,
                ).map(support.paymentConfigFieldLabel),
              )}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {t("finance.capabilities.secretReferenceContainer")}:
              {" "}
              {paymentCapabilities.providerConfigGovernance
                ?.secretReferenceContainer ?? "-"}
            </p>
          </div>
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
            >
              {t("finance.capabilities.secretStorage")}
            </p>
            <p class="mt-1 font-medium">
              {support.secretStorageRequirementLabel(
                paymentCapabilities.providerConfigGovernance
                  ?.secretStorageRequirement,
              )}
            </p>
          </div>
        </div>
        {#if getProviderConfigIssues(paymentCapabilities.providerConfigIssues).length > 0}
          <div class="alert alert-error mt-4 text-sm">
            <div class="space-y-2">
              <div>{t("finance.capabilities.configIssueDetected")}</div>
              <ul class="list-disc space-y-1 pl-5">
                {#each getProviderConfigIssues(paymentCapabilities.providerConfigIssues) as issue}
                  <li>
                    <span class="font-medium">{issue.providerName}</span>
                    {#each issue.issues ?? [] as detail}
                      <span>
                        : {detail.path ?? "-"}{#if detail.message}
                          {" - "}{detail.message}
                        {/if}
                      </span>
                    {/each}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {:else}
          <div class="alert alert-success mt-4 text-sm">
            <span>{t("finance.capabilities.noConfigIssues")}</span>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}
