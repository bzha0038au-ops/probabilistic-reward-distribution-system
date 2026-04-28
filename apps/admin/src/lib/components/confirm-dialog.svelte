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
</script>

{#if open}
  <div class="modal modal-open" role="dialog" aria-modal="true">
    <div class="modal-box max-w-lg">
      <div class="space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">{title}</h3>
          <p class="mt-2 text-sm leading-6 text-slate-600">{description}</p>
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

      <div class="modal-action">
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
          class="btn btn-primary"
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
