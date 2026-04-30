import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "node",
    include: ["test-vitest/**/*.test.ts", "test-vitest/**/*.test.tsx"],
    clearMocks: true,
  },
});
