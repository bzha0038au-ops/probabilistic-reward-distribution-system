<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  let email = $state("")
  let password = $state("")

  const errorMessage = $derived($page.form?.error as string | undefined)
  const { t } = getContext("i18n") as { t: (key: string) => string }
</script>

<svelte:head>
  <title>{t("login.title")}</title>
</svelte:head>

<div class="min-h-screen bg-base-200 flex items-center justify-center px-6 py-12">
  <div class="w-full max-w-sm space-y-6">
    <div class="space-y-2 text-center">
      <p class="text-xs uppercase tracking-[0.3em] text-primary">
        {t("login.eyebrow")}
      </p>
      <h1 class="text-2xl font-bold">{t("login.heading")}</h1>
      <p class="text-sm text-slate-600">{t("login.description")}</p>
    </div>

    {#if errorMessage}
      <div class="alert alert-error text-sm">
        <span>{errorMessage}</span>
      </div>
    {/if}

    <form method="post" class="space-y-4">
      <div class="form-control">
        <label class="label" for="email">
          <span class="label-text">{t("common.email")}</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder={t("login.emailPlaceholder")}
          class="input input-bordered"
          bind:value={email}
          required
        />
      </div>

      <div class="form-control">
        <label class="label" for="password">
          <span class="label-text">{t("common.password")}</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          class="input input-bordered"
          bind:value={password}
          required
        />
      </div>

      <button class="btn btn-primary w-full" type="submit">
        {t("login.submit")}
      </button>
    </form>
  </div>
</div>
