<script lang="ts">
  import {
    createFinancePageSupport,
    formatDate,
    isCrypto,
    readString,
    type PageData,
  } from "./page-support"

  type Translate = (key: string) => string

  let {
    confirmations,
    filteredDeposits,
    operatorNote,
    processingChannel,
    settlementReference,
    stepUpCode,
    t,
  }: {
    confirmations: string
    filteredDeposits: PageData["deposits"]
    operatorNote: string
    processingChannel: string
    settlementReference: string
    stepUpCode: string
    t: Translate
  } = $props()

  const support = $derived(createFinancePageSupport(t))
</script>

<section class="mt-8 card bg-base-100 shadow">
  <div class="card-body">
    <div
      class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h2 class="card-title">{t("finance.deposits.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.deposits.description")}
        </p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("finance.deposits.headers.id")}</th>
            <th>{t("finance.deposits.headers.userId")}</th>
            <th>{t("finance.deposits.headers.amount")}</th>
            <th>{t("finance.deposits.headers.status")}</th>
            <th>{t("finance.deposits.headers.processing")}</th>
            <th>{t("finance.deposits.headers.review")}</th>
            <th>{t("finance.deposits.headers.createdAt")}</th>
            <th class="text-right">{t("finance.deposits.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredDeposits as deposit}
            <tr>
              <td>{deposit.id}</td>
              <td>{deposit.userId}</td>
              <td>{deposit.amount}</td>
              <td>{support.depositStatusLabel(deposit.status)}</td>
              <td>
                <div class="space-y-1 text-xs">
                  <div>{support.processingModeLabel(deposit.metadata)}</div>
                  {#if support.financeStateLabel(Reflect.get(deposit.metadata ?? {}, "userVisibleStatus"), "deposit")}
                    <div class="text-slate-500">
                      User: {support.financeStateLabel(Reflect.get(deposit.metadata ?? {}, "userVisibleStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if support.providerStatusLabel(Reflect.get(deposit.metadata ?? {}, "providerStatus"), "deposit")}
                    <div class="text-slate-500">
                      Channel: {support.providerStatusLabel(Reflect.get(deposit.metadata ?? {}, "providerStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if support.financeStateLabel(Reflect.get(deposit.metadata ?? {}, "settlementStatus"), "deposit")}
                    <div class="text-slate-500">
                      Settlement: {support.financeStateLabel(Reflect.get(deposit.metadata ?? {}, "settlementStatus"), "deposit")}
                    </div>
                  {/if}
                  {#if support.ledgerStateLabel(Reflect.get(deposit.metadata ?? {}, "ledgerState"))}
                    <div class="text-slate-500">
                      {support.ledgerStateLabel(Reflect.get(deposit.metadata ?? {}, "ledgerState"))}
                    </div>
                  {/if}
                  {#if readString(Reflect.get(deposit.metadata ?? {}, "failureReason"))}
                    <div class="text-slate-500">
                      Failure: {readString(Reflect.get(deposit.metadata ?? {}, "failureReason"))}
                    </div>
                  {/if}
                  {#if support.manualFallbackStatusLabel(deposit.metadata, "deposit")}
                    <div class="text-slate-500">
                      {support.manualFallbackStatusLabel(deposit.metadata, "deposit")}
                    </div>
                  {/if}
                  {#if support.manualFallbackReasonLabel(deposit.metadata)}
                    <div class="text-slate-500">
                      {support.manualFallbackReasonLabel(deposit.metadata)}
                    </div>
                  {/if}
                  {#if isCrypto(deposit.channelType)}
                    <div class="text-slate-500">
                      {deposit.assetCode ?? "-"} · {deposit.network ?? "-"}
                    </div>
                    {#if deposit.submittedTxHash}
                      <div class="text-slate-500 break-all">
                        Tx: {deposit.submittedTxHash}
                      </div>
                    {/if}
                  {/if}
                </div>
              </td>
              <td>
                {#if support.formatReview(deposit.metadata)}
                  <div class="space-y-1 text-xs">
                    <div>{support.formatReview(deposit.metadata)?.action ?? "-"}</div>
                    {#if support.formatReview(deposit.metadata)?.adminId}
                      <div class="text-slate-500">
                        Admin #{support.formatReview(deposit.metadata)?.adminId}
                      </div>
                    {/if}
                    {#if support.formatReview(deposit.metadata)?.reviewStage}
                      <div class="text-slate-500">
                        {support.formatReview(deposit.metadata)?.reviewStage}
                      </div>
                    {/if}
                    {#if support.formatReview(deposit.metadata)?.processingChannel}
                      <div class="text-slate-500">
                        {support.formatReview(deposit.metadata)?.processingChannel}
                      </div>
                    {/if}
                    {#if support.formatReview(deposit.metadata)?.settlementReference}
                      <div class="text-slate-500">
                        {support.formatReview(deposit.metadata)?.settlementReference}
                      </div>
                    {/if}
                    {#if support.formatReview(deposit.metadata)?.operatorNote}
                      <div class="text-slate-500">
                        {support.formatReview(deposit.metadata)?.operatorNote}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
              <td>{formatDate(deposit.createdAt)}</td>
              <td class="text-right">
                {#if isCrypto(deposit.channelType)}
                  <div class="flex justify-end gap-2">
                    {#if deposit.status !== "credited" && deposit.status !== "reversed"}
                      <form method="post" action="?/confirmCryptoDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionCryptoConfirm")}
                        </button>
                      </form>
                      <form method="post" action="?/rejectCryptoDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionCryptoReject")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "credited"}
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                  </div>
                {:else if deposit.status === "requested" || deposit.status === "provider_pending" || deposit.status === "provider_succeeded" || deposit.status === "credited"}
                  <div class="flex justify-end gap-2">
                    {#if deposit.status === "requested"}
                      <form method="post" action="?/markDepositProviderPending">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionProviderPending")}
                        </button>
                      </form>
                      <form method="post" action="?/markDepositProviderFailed">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "provider_pending"}
                      <form method="post" action="?/markDepositProviderSucceeded">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionProviderSucceeded")}
                        </button>
                      </form>
                      <form method="post" action="?/markDepositProviderFailed">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "provider_succeeded"}
                      <form method="post" action="?/creditDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {t("finance.deposits.actionCredit")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if deposit.status === "credited"}
                      <form method="post" action="?/reverseDeposit">
                        <input type="hidden" name="id" value={deposit.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.deposits.actionReverse")}
                        </button>
                      </form>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
          {#if filteredDeposits.length === 0}
            <tr>
              <td colspan="8" class="text-center text-slate-500">
                {t("finance.deposits.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
