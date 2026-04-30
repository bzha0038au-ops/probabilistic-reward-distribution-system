import { createBackendEnv, runCommand, startTestDatabase } from '../support/test-harness';

const integrationSpecFiles = [
  'src/integration/backend.draw.classic.integration.test.ts',
  'src/integration/backend.draw.gacha.integration.test.ts',
  'src/integration/backend.blackjack.integration.test.ts',
  'src/integration/backend.holdem.integration.test.ts',
  'src/integration/backend.prediction-market.integration.test.ts',
  'src/integration/backend.prediction-market-portfolio.integration.test.ts',
  'src/integration/backend.quick-eight.integration.test.ts',
  'src/integration/backend.top-up.integration.test.ts',
  'src/integration/backend.withdraw.integration.test.ts',
  'src/integration/backend.finance.integration.test.ts',
  'src/integration/backend.finance.drill.integration.test.ts',
  'src/integration/backend.economy.iap.integration.test.ts',
  'src/integration/backend.admin.integration.test.ts',
  'src/integration/backend.auth.integration.test.ts',
  'src/integration/backend.security-events.integration.test.ts',
  'src/integration/backend.prize-engine.integration.test.ts',
  'src/integration/backend.aml.integration.test.ts',
  'src/integration/backend.legal.integration.test.ts',
];

async function main() {
  const cliArgs = process.argv.slice(2);
  const runCriticalOnly = cliArgs.includes('--critical');
  const selectedSpecs: string[] = [];
  const forwardedArgs: string[] = [];

  for (let index = 0; index < cliArgs.length; index += 1) {
    const arg = cliArgs[index];
    if (!arg || arg === '--' || arg === '--critical') {
      continue;
    }

    if (arg === '--spec') {
      const specFile = cliArgs[index + 1];
      if (!specFile) {
        throw new Error('Missing value for --spec.');
      }
      selectedSpecs.push(specFile);
      index += 1;
      continue;
    }

    forwardedArgs.push(arg);
  }

  const specFilesToRun =
    selectedSpecs.length > 0 ? selectedSpecs : integrationSpecFiles;
  const database = await startTestDatabase('integration');

  try {
    const env = {
      ...createBackendEnv({
        databaseUrl: database.databaseUrl,
        port: 4000,
        webBaseUrl: 'http://127.0.0.1:3000',
      }),
      RUN_INTEGRATION_TESTS: 'true',
      ...(runCriticalOnly ? { INTEGRATION_TEST_TAGS: 'critical' } : {}),
    };

    for (const specFile of specFilesToRun) {
      await runCommand(
        'pnpm',
        [
          '--dir',
          'apps/backend',
          'exec',
          'vitest',
          'run',
          '--config',
          'vitest.integration.config.ts',
          specFile,
          ...forwardedArgs,
        ],
        { env },
      );
    }
  } finally {
    await database.stop();
  }
}

void main();
