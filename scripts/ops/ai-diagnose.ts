import {
  collectComposeLogs,
  collectHealthChecks,
  fetchSentry5xxEvents,
  fetchText,
  getFlagBoolean,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  resolveHealthUrls,
  resolveMetricsUrls,
  runAiPrompt,
  splitList,
  truncate,
  unique,
  writeTextFile,
} from './_shared';

function printUsage() {
  console.log(`Usage: pnpm ops:ai-diagnose [--question "what changed?"] [--prompt-only] [--output incident.md]

Collect current readiness, metrics, docker logs, and recent Sentry 5xx samples,
then hand the bundle to an AI model for first-pass diagnosis. If AI credentials
are missing, the command prints the exact prompt instead.
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
  const logTail =
    getFlagInteger(args, 'log-tail') ?? (Number.parseInt(process.env.OPS_LOG_TAIL ?? '', 10) || 200);
  const logsMaxChars =
    getFlagInteger(args, 'logs-max-chars') ??
    (Number.parseInt(process.env.OPS_LOGS_MAX_CHARS ?? '', 10) || 20_000);
  const metricsMaxChars =
    getFlagInteger(args, 'metrics-max-chars') ??
    (Number.parseInt(process.env.OPS_METRICS_MAX_CHARS ?? '', 10) || 12_000);
  const healthUrls = unique(splitList(getFlagString(args, 'health-url')).concat(resolveHealthUrls()));
  const metricsUrls = unique(splitList(getFlagString(args, 'metrics-url')).concat(resolveMetricsUrls()));
  const logServices = unique(
    splitList(getFlagString(args, 'services') || process.env.OPS_LOG_SERVICES).concat([
      'backend',
      'notification-worker',
      'reverse-proxy',
    ])
  );
  const health = await collectHealthChecks(healthUrls, timeoutMs);

  const metrics = [];
  for (const url of metricsUrls) {
    const snapshot = await fetchText(url, timeoutMs);
    metrics.push({
      ok: snapshot.ok,
      status: snapshot.status,
      text: truncate(snapshot.text, metricsMaxChars),
      url: snapshot.url,
    });
  }

  const logs = await collectComposeLogs({
    services: logServices,
    since: getFlagString(args, 'log-since') || process.env.OPS_LOG_SINCE || '',
    tail: logTail,
    until: getFlagString(args, 'log-until') || process.env.OPS_LOG_UNTIL || '',
  });

  const sentry = await fetchSentry5xxEvents({
    limit: getFlagInteger(args, 'sentry-limit') ?? 20,
    query: getFlagString(args, 'sentry-query'),
  });

  const context = {
    checkedAt: new Date().toISOString(),
    environment:
      process.env.OBSERVABILITY_ENVIRONMENT ||
      process.env.NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT ||
      process.env.PUBLIC_OBSERVABILITY_ENVIRONMENT ||
      '',
    health,
    logs: logs.ok ? truncate(logs.text, logsMaxChars) : `Unavailable: ${logs.error}`,
    metrics,
    release:
      process.env.OBSERVABILITY_RELEASE ||
      process.env.NEXT_PUBLIC_OBSERVABILITY_RELEASE ||
      process.env.PUBLIC_OBSERVABILITY_RELEASE ||
      '',
    sentry: sentry.ok ? sentry.events : { error: sentry.error },
  };

  const systemPrompt = `You are the primary on-call engineer for a financial reward system.

Your job is to diagnose likely root cause from live operational evidence. Prioritize:
1. The most plausible fault domain and why.
2. The exact evidence supporting that claim.
3. The fastest safe containment steps.
4. The next 3 checks if confidence is still low.

Do not recite generic runbooks. Separate facts from inference.`;

  const userPrompt = [
    getFlagString(args, 'question')
      ? `Operator focus: ${getFlagString(args, 'question')}`
      : 'Operator focus: identify the most likely root cause behind the current incident state.',
    '',
    'Operational snapshot:',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    'Answer with sections: Assessment, Evidence, Containment, Next Checks.',
  ].join('\n');

  const aiResult = await runAiPrompt({
    maxOutputTokens: getFlagInteger(args, 'max-output-tokens') ?? 1800,
    promptOnly: getFlagBoolean(args, 'prompt-only'),
    systemPrompt,
    userPrompt,
  });

  if (getFlagString(args, 'output')) {
    await writeTextFile(getFlagString(args, 'output')!, `${aiResult.text}\n`);
  }

  if (aiResult.missingConfig) {
    console.error(aiResult.missingConfig);
  }

  console.log(aiResult.text);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
