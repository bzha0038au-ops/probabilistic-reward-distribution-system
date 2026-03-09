<script lang="ts">
  import "../../app.css"
  import { getContext } from "svelte"
  import LocaleSwitcher from "$lib/components/locale-switcher.svelte"

  interface Props {
    children?: import("svelte").Snippet
    data?: { admin?: { email?: string } | null }
  }

  let { children, data }: Props = $props()

  const { t } = getContext("i18n") as { t: (key: string) => string }
  const adminEmail = $derived(data?.admin?.email ?? t("common.adminLabel"))
</script>

<div class="min-h-screen bg-base-200">
  <nav class="navbar border-b border-base-300 bg-base-100">
    <div class="flex-1">
      <a href="/admin" class="btn btn-ghost text-xl">{t("common.appName")}</a>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm text-slate-600">{adminEmail}</span>
      <LocaleSwitcher />
      <a href="/logout" class="btn btn-outline btn-sm">{t("common.signOut")}</a>
    </div>
  </nav>

  <main class="mx-auto w-full max-w-6xl px-6 py-10">
    {@render children?.()}
  </main>
</div>
