import { sveltekit } from "@sveltejs/kit/vite"
import type { InlineConfig } from "vitest/node"
import type { UserConfig } from "vite"

const config = {
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    globals: true, /// allows to skip import of test functions like `describe`, `it`, `expect`, etc.
  },
} satisfies UserConfig & { test: InlineConfig }

export default config
