import {
  fetchSentry5xxEvents,
  getFlagBoolean,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  renderSentryEvents,
} from './_shared';

function printUsage() {
  console.log(`Usage: pnpm ops:tail-errors [--limit 100] [--query "release:2026.04.27"] [--json]

Fetch the latest 5xx error events from the Sentry Discover API.

Required environment:
  SENTRY_ORG
  SENTRY_AUTH_TOKEN

Optional environment:
  SENTRY_PROJECT / SENTRY_PROJECTS
  OPS_SENTRY_ENVIRONMENT
  OPS_SENTRY_QUERY
`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  const limit = getFlagInteger(args, 'limit') ?? 100;
  const query = getFlagString(args, 'query');
  const result = await fetchSentry5xxEvents({ limit, query });

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  if (getFlagBoolean(args, 'json')) {
    console.log(JSON.stringify(result.events, null, 2));
  } else {
    console.log(renderSentryEvents(result.events));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
