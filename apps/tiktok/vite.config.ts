import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "localhost",
    port: 3004,
    proxy: {
      "/api/user": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/user/, ""),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
  },
  build: {
    target: "es2022",
  },
});
