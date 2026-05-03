<script lang="ts">
  import { createEventDispatcher } from "svelte"

  let {
    open = false,
    title,
    description,
    breakGlassCode = $bindable(""),
    breakGlassLabel,
    breakGlassPlaceholder = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    error = null,
    stepUpHint = null,
  }: {
    open?: boolean
    title: string
    description: string
    breakGlassCode?: string
    breakGlassLabel: string
    breakGlassPlaceholder?: string
    confirmLabel?: string
    cancelLabel?: string
    error?: string | null
    stepUpHint?: string | null
  } = $props()

  const dispatch = createEventDispatcher<{
    cancel: void
    confirm: void
  }>()

  const canConfirm = $derived(breakGlassCode.trim() !== "")
  const stepUpReady = $derived(stepUpHint === null)
</script>

{#if open}
  <div class="modal modal-open" role="dialog" aria-modal="true">
    <div class="modal-box max-w-lg border-[var(--admin-border-strong)]">
      <div class="space-y-4">
        <div>
          <p
            class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
          >
            Break-Glass Verification
          </p>
          <h3
            class="mt-2 font-['Newsreader'] text-[2rem] leading-none text-[var(--admin-ink)]"
          >
            {title}
          </h3>
          <p class="mt-3 text-sm leading-7 text-[var(--admin-muted)]">
            {description}
          </p>
        </div>

        <div
          class="admin-guarded-action admin-guarded-action--danger space-y-3"
        >
          <div>
            <p
              class="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--admin-primary)]"
            >
              Command Control
            </p>
            <p class="mt-2 text-sm leading-6 text-[var(--admin-muted)]">
              This action is recorded with step-up verification and a
              break-glass code before submission.
            </p>
          </div>
          <div class="space-y-2 text-sm text-[var(--admin-ink)]">
            <div class="flex items-center justify-between gap-3">
              <span>Step-up code</span>
              <span
                class={`badge ${stepUpReady ? "badge-success" : "badge-warning"}`}
              >
                {stepUpReady ? "attached" : "required"}
              </span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Break-glass code</span>
              <span
                class={`badge ${canConfirm ? "badge-success" : "badge-warning"}`}
              >
                {canConfirm ? "present" : "required"}
              </span>
            </div>
          </div>
        </div>

        {#if stepUpHint}
          <div class="alert alert-warning text-sm">
            <span>{stepUpHint}</span>
          </div>
        {/if}

        {#if error}
          <div class="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        {/if}

        <label class="form-control">
          <span class="label-text mb-2">{breakGlassLabel}</span>
          <input
            type="password"
            inputmode="text"
            autocomplete="off"
            class="input input-bordered"
            bind:value={breakGlassCode}
            placeholder={breakGlassPlaceholder}
          />
        </label>
      </div>

      <div
        class="modal-action admin-modal-actions mt-6 border-t border-[var(--admin-border)] pt-5"
      >
        <button
          class="btn btn-ghost"
          type="button"
          onclick={() => {
            dispatch("cancel")
          }}
        >
          {cancelLabel}
        </button>
        <button
          class="btn btn-error"
          type="button"
          disabled={!canConfirm}
          onclick={() => {
            dispatch("confirm")
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>

    <button
      class="modal-backdrop"
      type="button"
      aria-label={cancelLabel}
      onclick={() => {
        dispatch("cancel")
      }}
    ></button>
  </div>
{/if}
