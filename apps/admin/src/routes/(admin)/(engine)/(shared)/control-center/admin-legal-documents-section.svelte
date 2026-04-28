<script lang="ts">
  import { formatDateTime, type LegalDocumentRecord } from "./page-support"

  type Translate = (key: string) => string

  let {
    legalDocuments,
    stepUpCode,
    t,
  }: {
    legalDocuments: LegalDocumentRecord[]
    stepUpCode: string
    t: Translate
  } = $props()

  let form = $state({
    slug: "terms-of-service",
    effectiveAt: "",
    html: "",
  })
</script>

<div class="card bg-base-100 shadow">
  <div class="card-body space-y-4">
    <div>
      <h2 class="card-title">{t("admin.legal.title")}</h2>
      <p class="text-sm text-slate-500">{t("admin.legal.description")}</p>
    </div>

    <form method="post" action="?/publishLegalDocument" class="grid gap-4">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-2">{t("admin.legal.slug")}</span>
          <input
            name="slug"
            class="input input-bordered"
            bind:value={form.slug}
            placeholder="terms-of-service"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-2">{t("admin.legal.effectiveAt")}</span>
          <input
            name="effectiveAt"
            type="datetime-local"
            class="input input-bordered"
            bind:value={form.effectiveAt}
          />
        </label>
      </div>

      <label class="form-control">
        <span class="label-text mb-2">{t("admin.legal.html")}</span>
        <textarea
          name="html"
          class="textarea textarea-bordered min-h-48 font-mono text-xs"
          bind:value={form.html}
          placeholder="<h1>Terms of Service</h1>"
        ></textarea>
      </label>

      <input type="hidden" name="totpCode" value={stepUpCode} />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-500">{t("admin.legal.stepUpHint")}</p>
        <button class="btn btn-primary" type="submit">
          {t("admin.legal.publish")}
        </button>
      </div>
    </form>

    <div class="overflow-x-auto">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>{t("admin.legal.slug")}</th>
            <th>{t("admin.legal.version")}</th>
            <th>{t("admin.legal.effectiveAt")}</th>
            <th>{t("admin.legal.status")}</th>
            <th>{t("admin.legal.preview")}</th>
          </tr>
        </thead>
        <tbody>
          {#if legalDocuments.length === 0}
            <tr>
              <td colspan="5" class="text-sm text-slate-500">
                {t("admin.legal.empty")}
              </td>
            </tr>
          {:else}
            {#each legalDocuments as document}
              <tr>
                <td class="font-medium">{document.slug}</td>
                <td>{document.version}</td>
                <td>{formatDateTime(document.effectiveAt)}</td>
                <td>
                  <span
                    class={`badge ${
                      document.isCurrent ? "badge-success" : "badge-ghost"
                    }`}
                  >
                    {document.isCurrent
                      ? t("admin.legal.current")
                      : t("admin.legal.inactive")}
                  </span>
                </td>
                <td class="max-w-md">
                  <details>
                    <summary class="cursor-pointer text-sm text-primary">
                      {t("admin.legal.preview")}
                    </summary>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <iframe
                      class="mt-3 h-56 w-full rounded border border-base-300 bg-white"
                      sandbox=""
                      srcdoc={document.html}
                      title={`${document.slug} preview`}
                    ></iframe>
                  </details>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
