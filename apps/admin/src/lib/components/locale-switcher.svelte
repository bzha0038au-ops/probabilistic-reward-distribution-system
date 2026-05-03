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

<div
  class="inline-flex items-center rounded-md border border-white/10 bg-white/4 p-1"
>
  {#each SUPPORTED_LOCALES as option}
    <button
      class={`rounded px-2.5 py-1 text-xs font-semibold transition ${
        option === locale()
          ? "bg-white/12 text-white"
          : "text-white/60 hover:text-white"
      }`}
      onclick={() => setLocale(option)}
      type="button"
    >
      {labels[option]}
    </button>
  {/each}
</div>
