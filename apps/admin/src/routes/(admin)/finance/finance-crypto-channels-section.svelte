<script lang="ts">
  import { formatDate, type PageData } from "./page-support"

  type Translate = (key: string) => string

  let {
    cryptoDepositChannels,
    t,
  }: {
    cryptoDepositChannels: PageData["cryptoDepositChannels"]
    t: Translate
  } = $props()

  let cryptoProviderId = $state("")
  let cryptoChain = $state("")
  let cryptoNetwork = $state("")
  let cryptoToken = $state("")
  let cryptoReceiveAddress = $state("")
  let cryptoQrCodeUrl = $state("")
  let cryptoMemoRequired = $state(false)
  let cryptoMemoValue = $state("")
  let cryptoMinConfirmations = $state("1")
  let cryptoIsActive = $state(true)
</script>

<section class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <div>
        <h2 class="card-title">{t("finance.cryptoChannels.title")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.cryptoChannels.description")}
        </p>
      </div>

      <div class="overflow-x-auto mt-4">
        <table class="table">
          <thead>
            <tr>
              <th>{t("finance.cryptoChannels.headers.id")}</th>
              <th>{t("finance.cryptoChannels.headers.providerId")}</th>
              <th>{t("finance.cryptoChannels.headers.asset")}</th>
              <th>{t("finance.cryptoChannels.headers.receiveAddress")}</th>
              <th>{t("finance.cryptoChannels.headers.memo")}</th>
              <th>{t("finance.cryptoChannels.headers.confirmations")}</th>
              <th>{t("finance.cryptoChannels.headers.status")}</th>
              <th>{t("finance.cryptoChannels.headers.updatedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {#each cryptoDepositChannels as channel}
              <tr>
                <td>{channel.id}</td>
                <td>{channel.providerId ?? "-"}</td>
                <td>
                  <div class="space-y-1 text-xs">
                    <div class="font-medium">{channel.token}</div>
                    <div class="text-slate-500">
                      {channel.chain} · {channel.network}
                    </div>
                  </div>
                </td>
                <td class="max-w-sm">
                  <div class="space-y-1 text-xs">
                    <div class="break-all">{channel.receiveAddress}</div>
                    {#if channel.qrCodeUrl}
                      <a
                        class="link link-primary"
                        href={channel.qrCodeUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        QR
                      </a>
                    {/if}
                  </div>
                </td>
                <td>
                  <div class="space-y-1 text-xs">
                    <div>
                      {channel.memoRequired
                        ? channel.memoValue ?? t("finance.cryptoChannels.memoRequiredOnly")
                        : channel.memoValue ?? "-"}
                    </div>
                  </div>
                </td>
                <td>{channel.minConfirmations}</td>
                <td>
                  {channel.isActive
                    ? t("finance.cryptoChannels.statusActive")
                    : t("finance.cryptoChannels.statusInactive")}
                </td>
                <td>{formatDate(channel.updatedAt ?? channel.createdAt)}</td>
              </tr>
            {/each}
            {#if cryptoDepositChannels.length === 0}
              <tr>
                <td colspan="8" class="text-center text-slate-500">
                  {t("finance.cryptoChannels.empty")}
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <div>
        <h2 class="card-title">{t("finance.cryptoChannels.createTitle")}</h2>
        <p class="text-sm text-slate-500">
          {t("finance.cryptoChannels.createDescription")}
        </p>
      </div>

      <form method="post" action="?/createCryptoDepositChannel" class="space-y-4">
        <div class="grid gap-4">
          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.providerId")}</span>
            <input
              name="providerId"
              type="number"
              min="1"
              class="input input-bordered"
              bind:value={cryptoProviderId}
              placeholder={t("finance.cryptoChannels.providerIdPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.chain")}</span>
            <input
              name="chain"
              type="text"
              class="input input-bordered"
              bind:value={cryptoChain}
              placeholder={t("finance.cryptoChannels.chainPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.network")}</span>
            <input
              name="network"
              type="text"
              class="input input-bordered"
              bind:value={cryptoNetwork}
              placeholder={t("finance.cryptoChannels.networkPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.token")}</span>
            <input
              name="token"
              type="text"
              class="input input-bordered"
              bind:value={cryptoToken}
              placeholder={t("finance.cryptoChannels.tokenPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.receiveAddress")}</span>
            <textarea
              name="receiveAddress"
              class="textarea textarea-bordered min-h-24"
              bind:value={cryptoReceiveAddress}
              placeholder={t("finance.cryptoChannels.receiveAddressPlaceholder")}
            ></textarea>
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.qrCodeUrl")}</span>
            <input
              name="qrCodeUrl"
              type="url"
              class="input input-bordered"
              bind:value={cryptoQrCodeUrl}
              placeholder={t("finance.cryptoChannels.qrCodeUrlPlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">{t("finance.cryptoChannels.memoValue")}</span>
            <input
              name="memoValue"
              type="text"
              class="input input-bordered"
              bind:value={cryptoMemoValue}
              placeholder={t("finance.cryptoChannels.memoValuePlaceholder")}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-2">
              {t("finance.cryptoChannels.minConfirmations")}
            </span>
            <input
              name="minConfirmations"
              type="number"
              min="0"
              class="input input-bordered"
              bind:value={cryptoMinConfirmations}
            />
          </label>

          <label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-4 py-3">
            <input
              name="memoRequired"
              type="checkbox"
              class="checkbox"
              bind:checked={cryptoMemoRequired}
            />
            <span class="label-text">{t("finance.cryptoChannels.memoRequired")}</span>
          </label>

          <label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-4 py-3">
            <input
              name="isActive"
              type="checkbox"
              class="checkbox"
              bind:checked={cryptoIsActive}
            />
            <span class="label-text">{t("finance.cryptoChannels.isActive")}</span>
          </label>
        </div>

        <button class="btn btn-primary w-full" type="submit">
          {t("finance.cryptoChannels.submit")}
        </button>
      </form>
    </div>
  </div>
</section>
