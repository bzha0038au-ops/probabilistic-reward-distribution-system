import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const migrationDir = path.join(process.cwd(), 'apps/database/drizzle');
const journalPath = path.join(migrationDir, 'meta/_journal.json');
const rollbackHeaderRequiredFrom = 101;
const requiredHeaders = [
  'deploy-plan',
  'rollback-plan',
  'blast-radius',
];

const normalizePath = (value) => value.split(path.sep).join('/');

const parseMigrationNumber = (filename) => {
  const match = /^(\d{4})_.+\.sql$/.exec(filename);
  return match ? Number(match[1]) : null;
};

const readMigrationFiles = () =>
  readdirSync(migrationDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

const readJournalTags = () => {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  return new Set(
    entries
      .map((entry) => (typeof entry?.tag === 'string' ? `${entry.tag}.sql` : null))
      .filter(Boolean),
  );
};

const hasRequiredRollbackHeaders = (absolutePath) => {
  const topSection = readFileSync(absolutePath, 'utf8')
    .split(/\r?\n/)
    .slice(0, 12)
    .join('\n');

  return requiredHeaders.every((header) =>
    new RegExp(`^--\\s*${header}:\\s*\\S.+$`, 'm').test(topSection),
  );
};

try {
  if (!statSync(migrationDir).isDirectory()) {
    throw new Error(`Migration directory is missing: ${normalizePath(migrationDir)}`);
  }
} catch (error) {
  console.error(String(error));
  process.exit(1);
}

const migrationFiles = readMigrationFiles();
const journalTags = readJournalTags();
const fileSet = new Set(migrationFiles);
const violations = [];

for (const migrationFile of migrationFiles) {
  if (!journalTags.has(migrationFile)) {
    violations.push(
      `Journal missing migration entry for ${normalizePath(path.join('apps/database/drizzle', migrationFile))}.`,
    );
  }

  const migrationNumber = parseMigrationNumber(migrationFile);
  if (migrationNumber === null || migrationNumber < rollbackHeaderRequiredFrom) {
    continue;
  }

  const absolutePath = path.join(migrationDir, migrationFile);
  if (!hasRequiredRollbackHeaders(absolutePath)) {
    violations.push(
      `${normalizePath(path.join('apps/database/drizzle', migrationFile))} must start with rollback headers: ${requiredHeaders
        .map((header) => `-- ${header}: ...`)
        .join(', ')}.`,
    );
  }
}

for (const journalTag of journalTags) {
  if (!fileSet.has(journalTag)) {
    violations.push(
      `Journal references missing migration file ${normalizePath(path.join('apps/database/drizzle', journalTag))}.`,
    );
  }
}

if (violations.length === 0) {
  console.log(
    `Migration journal is in sync and rollback headers are present for ${rollbackHeaderRequiredFrom.toString().padStart(4, '0')}+ migrations.`,
  );
  process.exit(0);
}

console.error(
  [
    'Migration discipline check failed.',
    ...violations.map((violation) => `- ${violation}`),
    '',
    'Template for new migrations:',
    '-- deploy-plan: expand|backfill|contract',
    '-- rollback-plan: reversible_sql|forward_fix|restore_from_snapshot_or_pitr',
    '-- blast-radius: low|medium|high',
  ].join('\n'),
);
process.exit(1);
