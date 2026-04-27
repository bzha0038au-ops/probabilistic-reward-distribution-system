import {
  collectHealthChecks,
  fatal,
  getFlagBoolean,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  renderHealthChecks,
  resolveHealthUrls,
  splitList,
  unique,
} from './_shared';

function printUsage() {
  console.log(`Usage: pnpm ops:health [--url <url1,url2>] [--timeout-ms 5000] [--json]

Probe every configured /health/ready endpoint and fail fast when any endpoint is
not ready.

Environment:
  OPS_HEALTH_URLS       Comma-separated readiness URLs
  OPS_BACKEND_BASE_URL  Base URL used when OPS_HEALTH_URLS is unset
`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  const timeoutMs = getFlagInteger(args, 'timeout-ms') ?? 5000;
  const explicitUrls = splitList(getFlagString(args, 'url'));
  const urls = unique(explicitUrls.length > 0 ? explicitUrls : resolveHealthUrls());

  if (urls.length === 0) {
    fatal('No health endpoints resolved. Set OPS_HEALTH_URLS or pass --url.');
  }

  const results = await collectHealthChecks(urls, timeoutMs);

  if (getFlagBoolean(args, 'json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(renderHealthChecks(results));
  }

  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
