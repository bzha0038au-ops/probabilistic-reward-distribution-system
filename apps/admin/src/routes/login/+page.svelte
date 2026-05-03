<script lang="ts">
  import { page } from "$app/stores"
  import { getContext } from "svelte"

  let email = $state("")
  let password = $state("")
  let totpCode = $state("")
  let breakGlassCode = $state("")

  const errorMessage = $derived($page.form?.error as string | undefined)
  const { t } = getContext("i18n") as { t: (key: string) => string }
</script>

<svelte:head>
  <title>{t("login.title")}</title>
</svelte:head>

<div class="admin-workspace">
  <main
    class="mx-auto flex min-h-screen w-full max-w-[110rem] items-center justify-center px-4 py-6 sm:px-6"
  >
    <section
      class="w-full max-w-[28rem] rounded-[1rem] border border-[var(--admin-border)] bg-[var(--admin-paper)] p-7 shadow-[var(--admin-shadow)] sm:p-8"
    >
      <div class="space-y-2">
        <h1
          class="font-['Newsreader'] text-[2.2rem] leading-[0.98] text-[var(--admin-ink)] sm:text-[2.7rem]"
        >
          {t("login.title")}
        </h1>
      </div>

      {#if errorMessage}
        <div class="alert alert-error mt-5 text-sm">
          <span>{errorMessage}</span>
        </div>
      {/if}

      <form method="post" class="mt-7 space-y-5">
        <div class="form-control">
          <label class="label" for="email">
            <span class="label-text">{t("common.email")}</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder={t("login.emailPlaceholder")}
            class="input input-bordered w-full"
            bind:value={email}
            autocomplete="email"
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
            class="input input-bordered w-full"
            bind:value={password}
            autocomplete="current-password"
            required
          />
        </div>

        <div class="form-control">
          <label class="label" for="totpCode">
            <span class="label-text">{t("common.totpCode")}</span>
          </label>
          <input
            id="totpCode"
            name="totpCode"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            class="input input-bordered w-full"
            bind:value={totpCode}
            placeholder={t("login.totpPlaceholder")}
          />
        </div>

        <div class="form-control">
          <label class="label" for="breakGlassCode">
            <span class="label-text">{t("login.breakGlassCode")}</span>
          </label>
          <input
            id="breakGlassCode"
            name="breakGlassCode"
            type="password"
            class="input input-bordered w-full"
            bind:value={breakGlassCode}
            autocomplete="one-time-code"
            placeholder={t("login.breakGlassPlaceholder")}
          />
        </div>

        <button class="btn btn-primary w-full" type="submit">
          {t("login.submit")}
        </button>
      </form>
    </section>
  </main>
</div>
