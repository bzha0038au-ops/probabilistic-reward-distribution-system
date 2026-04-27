import {
  collectComposeLogs,
  collectHealthChecks,
  fetchSentry5xxEvents,
  getFlagBoolean,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  resolveHealthUrls,
  runAiPrompt,
  splitList,
  truncate,
  unique,
  writeTextFile,
} from './_shared';

function printUsage() {
  console.log(`Usage: pnpm ops:postmortem --title "Withdraw outage" [--since 4h] [--until 2026-04-28T06:00:00Z]

Pull a bounded incident log window and ask AI to draft a postmortem in Markdown.
When AI credentials are not configured, the full prompt is printed so an operator
can paste it into another agent manually.
`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  const since = getFlagString(args, 'since') || process.env.OPS_POSTMORTEM_SINCE || '4h';
  const until = getFlagString(args, 'until') || process.env.OPS_POSTMORTEM_UNTIL || '';
  const logTail =
    getFlagInteger(args, 'log-tail') ??
    (Number.parseInt(process.env.OPS_POSTMORTEM_LOG_TAIL ?? '', 10) || 500);
  const logsMaxChars =
    getFlagInteger(args, 'logs-max-chars') ??
    (Number.parseInt(process.env.OPS_POSTMORTEM_LOGS_MAX_CHARS ?? '', 10) || 30_000);
  const title = getFlagString(args, 'title') || process.env.OPS_INCIDENT_TITLE || 'Incident draft';
  const health = await collectHealthChecks(
    resolveHealthUrls(),
    getFlagInteger(args, 'timeout-ms') ?? 5000
  );
  const logServices = unique(
    splitList(getFlagString(args, 'services') || process.env.OPS_POSTMORTEM_SERVICES).concat([
      'backend',
      'notification-worker',
      'reverse-proxy',
      'frontend',
      'admin',
    ])
  );
  const logs = await collectComposeLogs({
    services: logServices,
    since,
    tail: logTail,
    until,
  });
  const sentry = await fetchSentry5xxEvents({
    limit: getFlagInteger(args, 'sentry-limit') ?? 40,
    query: getFlagString(args, 'sentry-query'),
  });

  const context = {
    generatedAt: new Date().toISOString(),
    health,
    incidentTitle: title,
    logWindow: {
      since,
      until: until || 'now',
    },
    logs: logs.ok ? truncate(logs.text, logsMaxChars) : `Unavailable: ${logs.error}`,
    sentry: sentry.ok ? sentry.events : { error: sentry.error },
  };

  const systemPrompt = `You are drafting a production incident postmortem for an engineering team.

Rules:
- Write in Markdown.
- Separate confirmed facts from hypotheses.
- Be concrete about customer impact, timeline, root cause, contributing factors, and action items.
- Prefer "unknown" over invented certainty.
- Keep action items specific and assignable.`;

  const userPrompt = [
    `Draft a postmortem for: ${title}`,
    '',
    'Use this incident evidence bundle:',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    'Required sections:',
    '- Summary',
    '- Impact',
    '- Timeline',
    '- Root Cause',
    '- Contributing Factors',
    '- Detection',
    '- Resolution',
    '- What Went Well',
    '- What Went Poorly',
    '- Action Items',
    '- Open Questions',
  ].join('\n');

  const aiResult = await runAiPrompt({
    maxOutputTokens: getFlagInteger(args, 'max-output-tokens') ?? 2200,
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
