<script lang="ts">
  interface Props {
    eyebrow?: string
    title: string
    description?: string
    context?: string
    tone?: "default" | "threat"
    actions?: import("svelte").Snippet
  }

  let {
    eyebrow,
    title,
    description = "",
    context,
    tone = "default",
    actions,
  }: Props = $props()
</script>

<header
  class={`admin-page-header ${tone === "threat" ? "admin-page-header--threat" : ""}`}
>
  {#if context}
    <p class="admin-page-context">{context}</p>
  {/if}

  <div class="admin-page-header-row">
    <div>
      {#if eyebrow}
        <p class="admin-page-kicker">{eyebrow}</p>
      {/if}
      <h1 class="admin-page-title">{title}</h1>
      {#if description}
        <p class="admin-page-description">{description}</p>
      {/if}
    </div>

    {#if actions}
      <div class="admin-page-actions">
        {@render actions()}
      </div>
    {/if}
  </div>
</header>
