import {
  deployFrozenPath,
  fileExists,
  getFlagBoolean,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  removeManagedSecretFile,
  truncate,
  writeTextFile,
} from './_shared';
import { readFile } from 'node:fs/promises';

function printUsage() {
  console.log(`Usage: pnpm ops:freeze-deploys [--reason "why"] [--status] [--clear]

Create or clear the repo-level deployment freeze marker checked by
.github/workflows/deploy.yml.

Notes:
  - The freeze only affects refs that include the .deploy-frozen file.
  - Commit and push the marker if you need GitHub Actions to reject deploys.
`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  if (getFlagBoolean(args, 'status')) {
    if (!(await fileExists(deployFrozenPath))) {
      console.log('Deployment freeze is not active.');
      process.exit(0);
    }

    console.log(truncate(await readFile(deployFrozenPath, 'utf8'), 4000));
    process.exit(0);
  }

  if (getFlagBoolean(args, 'clear')) {
    await removeManagedSecretFile(deployFrozenPath);
    console.log(`Removed ${deployFrozenPath}. Commit and push the deletion to reopen deploys.`);
    process.exit(0);
  }

  const reason =
    getFlagString(args, 'reason') ||
    args.positionals.join(' ').trim() ||
    'manual freeze requested';
  const lines = [
    '# Deployment freeze marker',
    `frozen_at=${new Date().toISOString()}`,
    `actor=${process.env.USER || 'unknown'}`,
    `reason=${reason}`,
  ];

  await writeTextFile(deployFrozenPath, `${lines.join('\n')}\n`);
  console.log(
    `Created ${deployFrozenPath}. Commit and push this file to block deploys for the target ref.`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
