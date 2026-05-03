import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const distDir = join(appRoot, "dist");
const htmlPath = join(distDir, "index.html");

const html = readFileSync(htmlPath, "utf8");
const entryScriptMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);

if (!entryScriptMatch) {
  throw new Error("Could not find the Vite entry script in dist/index.html.");
}

const entryScriptPath = entryScriptMatch[1].replace(/^\.?\//, "");
const entryScriptCode = readFileSync(join(distDir, entryScriptPath), "utf8");
const inlineScriptTag = `<script type="module">\n${entryScriptCode}\n</script>`;

writeFileSync(htmlPath, html.replace(entryScriptMatch[0], inlineScriptTag), "utf8");
