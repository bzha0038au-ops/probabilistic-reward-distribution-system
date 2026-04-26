import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['apps', 'packages'];
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts'];
const generatedExtensions = ['.js', '.js.map'];
const ignoredDirNames = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.svelte-kit',
  '.vite',
  'coverage',
]);
const violations = [];

const normalizePath = (value) => value.split(path.sep).join('/');

const isTsBridgeSource = (absolutePath) => {
  try {
    const content = readFileSync(absolutePath, 'utf8').trim();
    return (
      /^export\s+\*\s+from\s+['"].+\.ts['"];?$/.test(content) ||
      /^export\s+\{[\s\S]+\}\s+from\s+['"].+\.ts['"];?$/.test(content)
    );
  } catch {
    return false;
  }
};

const hasCompiledSourceSibling = (absolutePath) => {
  const base =
    absolutePath.endsWith('.js.map')
      ? absolutePath.slice(0, -'.js.map'.length)
      : absolutePath.slice(0, -'.js'.length);

  return sourceExtensions.some((extension) => {
    try {
      return statSync(`${base}${extension}`).isFile();
    } catch {
      return false;
    }
  });
};

const scanDir = (absoluteDir) => {
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) {
        continue;
      }
      scanDir(absolutePath);
      continue;
    }

    if (!generatedExtensions.some((extension) => absolutePath.endsWith(extension))) {
      continue;
    }

    if (!normalizePath(absolutePath).includes('/src/')) {
      continue;
    }

    if (!hasCompiledSourceSibling(absolutePath)) {
      continue;
    }

    if (isTsBridgeSource(absolutePath)) {
      continue;
    }

    violations.push(normalizePath(path.relative(process.cwd(), absolutePath)));
  }
};

for (const root of roots) {
  const absoluteRoot = path.join(process.cwd(), root);
  try {
    if (!statSync(absoluteRoot).isDirectory()) {
      continue;
    }
  } catch {
    continue;
  }

  scanDir(absoluteRoot);
}

if (violations.length === 0) {
  console.log('No generated JavaScript artifacts found under src/.');
  process.exit(0);
}

console.error(
  [
    'Generated JavaScript artifacts were found under src/. Keep compiled output in dist/ only:',
    ...violations.map((violation) => `- ${violation}`),
  ].join('\n')
);
process.exit(1);
