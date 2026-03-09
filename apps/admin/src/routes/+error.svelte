<script>
  import "../app.css"
  import { page } from "$app/stores"
</script>

<div class="hero min-h-[100vh]">
  <div class="hero-content text-center">
    <div class="max-w-lg">
      <h1 class="text-4xl font-semibold">Something went wrong</h1>
      <p class="py-4 text-base text-slate-600">
        {$page?.error?.message ?? "The admin console hit an unexpected error."}
      </p>
      <div>
        <a href="/admin" class="btn btn-primary btn-wide">Back to console</a>
      </div>
    </div>
  </div>
</div>
