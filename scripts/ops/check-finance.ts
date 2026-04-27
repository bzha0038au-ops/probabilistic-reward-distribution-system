import {
  fatal,
  financeSanitySqlPath,
  getFlagBoolean,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  projectRoot,
  resolveDatabaseUrl,
  runPassthroughCommand,
  resolveRuntimePath,
} from './_shared';

function printUsage() {
  console.log(`Usage: pnpm ops:check-finance [--database-url <url>] [--sql <path>]

Run the repo-owned financial sanity SQL from the workspace root so operators do
not have to remember the SQL path or database package directory.
`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  const databaseUrl = getFlagString(args, 'database-url') || resolveDatabaseUrl();
  if (!databaseUrl) {
    fatal(
      'DATABASE_URL, POSTGRES_URL, or TARGET_DATABASE_URL is required. You can also pass --database-url.'
    );
  }

  const sqlPath = await resolveRuntimePath(getFlagString(args, 'sql') || financeSanitySqlPath);
  const exitCode = await runPassthroughCommand(
    'psql',
    [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath],
    { cwd: projectRoot }
  );

  process.exit(exitCode);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
