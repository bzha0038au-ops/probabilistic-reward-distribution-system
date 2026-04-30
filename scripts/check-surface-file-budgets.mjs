import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ignoredDirNames = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.turbo',
  '.svelte-kit',
  '.vite',
  'coverage',
]);

const rules = [
  {
    label: 'SaaS portal module files',
    root: 'apps/saas-portal/modules',
    extensions: new Set(['.ts', '.tsx']),
    maxLines: 1200,
  },
  {
    label: 'Mobile screen files',
    root: 'apps/mobile/src/screens',
    extensions: new Set(['.tsx']),
    maxLines: 1400,
  },
];

const exceptions = new Map([
  [
    'apps/saas-portal/modules/portal/components/portal-dashboard.tsx',
    {
      maxLines: 4000,
      reason: 'Historical portal monolith with an explicit regression cap until further extraction lands.',
    },
  ],
  [
    'apps/mobile/src/screens/holdem-route-screen.tsx',
    {
      maxLines: 2600,
      reason: 'Existing live-table surface is still above the default budget but may not grow further without an explicit split.',
    },
  ],
]);

const normalizePath = (value) => value.split(path.sep).join('/');

const countLines = (absolutePath) =>
  readFileSync(absolutePath, 'utf8').split(/\r?\n/).length;

const collectFiles = (absoluteRoot, extensions) => {
  const files = [];

  const visit = (absoluteDir) => {
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirNames.has(entry.name)) {
          continue;
        }
        visit(absolutePath);
        continue;
      }

      if (!extensions.has(path.extname(entry.name))) {
        continue;
      }

      files.push(absolutePath);
    }
  };

  visit(absoluteRoot);
  return files;
};

const violations = [];

for (const rule of rules) {
  const absoluteRoot = path.join(process.cwd(), rule.root);
  try {
    if (!statSync(absoluteRoot).isDirectory()) {
      continue;
    }
  } catch {
    continue;
  }

  for (const absolutePath of collectFiles(absoluteRoot, rule.extensions)) {
    const relativePath = normalizePath(path.relative(process.cwd(), absolutePath));
    const lineCount = countLines(absolutePath);
    const exception = exceptions.get(relativePath);
    const maxLines = exception?.maxLines ?? rule.maxLines;

    if (lineCount <= maxLines) {
      continue;
    }

    violations.push({
      label: rule.label,
      relativePath,
      lineCount,
      maxLines,
      reason: exception?.reason ?? null,
    });
  }
}

if (violations.length === 0) {
  console.log('Surface file budgets are within the configured limits.');
  process.exit(0);
}

console.error(
  [
    'Surface file budget check failed.',
    ...violations.map((violation) =>
      `- ${violation.relativePath}: ${violation.lineCount} lines (budget ${violation.maxLines})` +
      (violation.reason ? ` — ${violation.reason}` : ` — ${violation.label} must be split before it grows further.`),
    ),
  ].join('\n'),
);
process.exit(1);
