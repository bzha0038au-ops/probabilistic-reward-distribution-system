import { createBackendEnv, runCommand, startTestDatabase } from '../support/test-harness';

const integrationSpecFiles = [
  'src/integration/backend.draw.classic.integration.test.ts',
  'src/integration/backend.draw.gacha.integration.test.ts',
  'src/integration/backend.blackjack.integration.test.ts',
  'src/integration/backend.quick-eight.integration.test.ts',
  'src/integration/backend.finance.integration.test.ts',
  'src/integration/backend.admin.integration.test.ts',
  'src/integration/backend.auth.integration.test.ts',
];

async function main() {
  const cliArgs = process.argv.slice(2);
  const runCriticalOnly = cliArgs.includes('--critical');
  const forwardedArgs = cliArgs.filter((arg) => arg !== '--critical');
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

    for (const specFile of integrationSpecFiles) {
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
