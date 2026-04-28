<script lang="ts">
  import {
    createFinancePageSupport,
    formatDate,
    getWithdrawalRiskSignals,
    isCrypto,
    isPendingSecondApproval,
    readString,
    type PageData,
  } from "./page-support"

  type Translate = (key: string) => string

  let {
    confirmations,
    filteredWithdrawals,
    operatorNote,
    processingChannel,
    settlementReference,
    stepUpCode,
    t,
  }: {
    confirmations: string
    filteredWithdrawals: PageData["withdrawals"]
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
        <h2 class="card-title">{t("finance.withdrawals.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.withdrawals.description")}
        </p>
      </div>
    </div>

    <div class="overflow-x-auto mt-4">
      <table class="table">
        <thead>
          <tr>
            <th>{t("finance.withdrawals.headers.id")}</th>
            <th>{t("finance.withdrawals.headers.userId")}</th>
            <th>{t("finance.withdrawals.headers.amount")}</th>
            <th>{t("finance.withdrawals.headers.status")}</th>
            <th>{t("finance.withdrawals.headers.bankCardId")}</th>
            <th>{t("finance.withdrawals.headers.processing")}</th>
            <th>{t("finance.withdrawals.headers.review")}</th>
            <th>{t("finance.withdrawals.headers.createdAt")}</th>
            <th class="text-right">{t("finance.withdrawals.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredWithdrawals as withdrawal}
            <tr>
              <td>{withdrawal.id}</td>
              <td>{withdrawal.userId}</td>
              <td>{withdrawal.amount}</td>
              <td>
                <div class="space-y-1">
                  <div>
                    {support.withdrawalStatusLabel(withdrawal.status, withdrawal.metadata)}
                  </div>
                  {#if isPendingSecondApproval(withdrawal.metadata)}
                    <div class="text-xs text-amber-700">
                      {t("finance.withdrawals.actionSecondApprove")}
                    </div>
                  {/if}
                </div>
              </td>
              <td>{withdrawal.payoutMethodId ?? withdrawal.bankCardId ?? "-"}</td>
              <td>
                <div class="space-y-1 text-xs">
                  <div>{support.processingModeLabel(withdrawal.metadata)}</div>
                  {#if support.financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "userVisibleStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      User: {support.financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "userVisibleStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if support.providerStatusLabel(Reflect.get(withdrawal.metadata ?? {}, "providerStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      Channel: {support.providerStatusLabel(Reflect.get(withdrawal.metadata ?? {}, "providerStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if support.financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "settlementStatus"), "withdrawal")}
                    <div class="text-slate-500">
                      Settlement: {support.financeStateLabel(Reflect.get(withdrawal.metadata ?? {}, "settlementStatus"), "withdrawal")}
                    </div>
                  {/if}
                  {#if support.ledgerStateLabel(Reflect.get(withdrawal.metadata ?? {}, "ledgerState"))}
                    <div class="text-slate-500">
                      {support.ledgerStateLabel(Reflect.get(withdrawal.metadata ?? {}, "ledgerState"))}
                    </div>
                  {/if}
                  {#if readString(Reflect.get(withdrawal.metadata ?? {}, "failureReason"))}
                    <div class="text-slate-500">
                      Failure: {readString(Reflect.get(withdrawal.metadata ?? {}, "failureReason"))}
                    </div>
                  {/if}
                  {#if support.manualFallbackStatusLabel(withdrawal.metadata, "withdrawal")}
                    <div class="text-slate-500">
                      {support.manualFallbackStatusLabel(withdrawal.metadata, "withdrawal")}
                    </div>
                  {/if}
                  {#if support.manualFallbackReasonLabel(withdrawal.metadata)}
                    <div class="text-slate-500">
                      {support.manualFallbackReasonLabel(withdrawal.metadata)}
                    </div>
                  {/if}
                  {#if isCrypto(withdrawal.channelType)}
                    <div class="text-slate-500">
                      {withdrawal.assetCode ?? "-"} · {withdrawal.network ?? "-"}
                    </div>
                    {#if withdrawal.submittedTxHash}
                      <div class="text-slate-500 break-all">
                        Tx: {withdrawal.submittedTxHash}
                      </div>
                    {/if}
                  {/if}
                  {#if getWithdrawalRiskSignals(withdrawal.metadata).length > 0}
                    <div class="pt-1 text-slate-500">
                      {t("finance.withdrawals.riskSignals")}
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each getWithdrawalRiskSignals(withdrawal.metadata) as signal}
                        <span class="badge badge-warning badge-outline badge-xs">
                          {support.withdrawalRiskSignalLabel(signal)}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </td>
              <td>
                {#if support.formatReview(withdrawal.metadata)}
                  <div class="space-y-1 text-xs">
                    <div>{support.formatReview(withdrawal.metadata)?.action ?? "-"}</div>
                    {#if support.formatReview(withdrawal.metadata)?.adminId}
                      <div class="text-slate-500">
                        Admin #{support.formatReview(withdrawal.metadata)?.adminId}
                      </div>
                    {/if}
                    {#if support.formatReview(withdrawal.metadata)?.reviewStage}
                      <div class="text-slate-500">
                        {support.formatReview(withdrawal.metadata)?.reviewStage}
                      </div>
                    {/if}
                    {#if support.formatReview(withdrawal.metadata)?.processingChannel}
                      <div class="text-slate-500">
                        {support.formatReview(withdrawal.metadata)?.processingChannel}
                      </div>
                    {/if}
                    {#if support.formatReview(withdrawal.metadata)?.settlementReference}
                      <div class="text-slate-500">
                        {support.formatReview(withdrawal.metadata)?.settlementReference}
                      </div>
                    {/if}
                    {#if support.formatReview(withdrawal.metadata)?.operatorNote}
                      <div class="text-slate-500">
                        {support.formatReview(withdrawal.metadata)?.operatorNote}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">-</span>
                {/if}
              </td>
              <td>{formatDate(withdrawal.createdAt)}</td>
              <td class="text-right">
                {#if withdrawal.status === "requested" || withdrawal.status === "approved" || withdrawal.status === "provider_submitted" || withdrawal.status === "provider_processing" || withdrawal.status === "provider_failed" || withdrawal.status === "paid"}
                  <div class="flex justify-end gap-2">
                    {#if withdrawal.status === "requested"}
                      <form method="post" action="?/approveWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {support.withdrawalApproveActionLabel(withdrawal.metadata)}
                        </button>
                      </form>
                      <form method="post" action="?/rejectWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReject")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "approved"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/submitCryptoWithdrawal"
                            : "?/markWithdrawalProviderSubmitted"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoSubmit")
                            : t("finance.withdrawals.actionProviderSubmit")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_failed"}
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_submitted"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/confirmCryptoWithdrawal"
                            : "?/markWithdrawalProviderProcessing"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoConfirm")
                            : t("finance.withdrawals.actionProviderProcessing")}
                        </button>
                      </form>
                      <form method="post" action="?/markWithdrawalProviderFailed">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "provider_processing"}
                      <form
                        method="post"
                        action={
                          isCrypto(withdrawal.channelType)
                            ? "?/confirmCryptoWithdrawal"
                            : "?/payWithdrawal"
                        }
                      >
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="confirmations" value={confirmations} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-primary" type="submit">
                          {isCrypto(withdrawal.channelType)
                            ? t("finance.withdrawals.actionCryptoConfirm")
                            : t("finance.withdrawals.actionPay")}
                        </button>
                      </form>
                      <form method="post" action="?/markWithdrawalProviderFailed">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionProviderFail")}
                        </button>
                      </form>
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
                        </button>
                      </form>
                    {/if}
                    {#if withdrawal.status === "paid"}
                      <form method="post" action="?/reverseWithdrawal">
                        <input type="hidden" name="id" value={withdrawal.id} />
                        <input type="hidden" name="totpCode" value={stepUpCode} />
                        <input type="hidden" name="processingChannel" value={processingChannel} />
                        <input type="hidden" name="settlementReference" value={settlementReference} />
                        <input type="hidden" name="operatorNote" value={operatorNote} />
                        <button class="btn btn-xs btn-outline" type="submit">
                          {t("finance.withdrawals.actionReverse")}
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
          {#if filteredWithdrawals.length === 0}
            <tr>
              <td colspan="9" class="text-center text-slate-500">
                {t("finance.withdrawals.empty")}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</section>
