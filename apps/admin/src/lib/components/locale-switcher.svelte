<script lang="ts">
  import { getContext } from "svelte"
  import { SUPPORTED_LOCALES, type Locale } from "$lib/i18n"

  const { locale } = getContext("i18n") as { locale: () => Locale }

  const labels: Record<Locale, string> = {
    en: "EN",
    "zh-CN": "中文",
  }

  const setLocale = async (nextLocale: Locale) => {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
    })
    window.location.reload()
  }
</script>

<div class="flex items-center gap-2">
  {#each SUPPORTED_LOCALES as option}
    <button
      class={option === locale() ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
      onclick={() => setLocale(option)}
      type="button"
    >
      {labels[option]}
    </button>
  {/each}
</div>
