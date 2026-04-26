import { createBackendEnv, runCommand, startTestDatabase } from '../support/test-harness';

const criticalIntegrationTestNamePattern = [
  'enrolls admin MFA end-to-end and rotates admin sessions',
  'executeDraw returns out_of_stock',
  'executeDraw returns budget_exhausted',
  'executeDraw returns payout_limited',
  'executeDraw keeps prize inventory and draw records consistent under concurrent requests',
  'stores webhook events before asynchronously advancing deposits into provider_succeeded and dedupes duplicate callbacks',
  'admin deposit state routes stay idempotent across duplicate and out-of-order submissions',
  'admin withdrawal routes tolerate duplicate approvals and ignore out-of-order rejects after pay',
  'admin security freeze routes lock and release a user account with step-up MFA',
  'admin control-center system config flow creates, approves, and publishes a config change',
].join('|');

async function main() {
  const cliArgs = process.argv.slice(2);
  const runCriticalOnly = cliArgs.includes('--critical');
  const forwardedArgs = cliArgs.filter((arg) => arg !== '--critical');
  const database = await startTestDatabase('integration');

  try {
    await runCommand(
      'pnpm',
      [
        '--dir',
        'apps/backend',
        'exec',
        'vitest',
        'run',
        'src/integration/backend.integration.test.ts',
        ...(runCriticalOnly
          ? ['-t', criticalIntegrationTestNamePattern]
          : []),
        ...forwardedArgs,
      ],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: 4000,
            webBaseUrl: 'http://127.0.0.1:3000',
          }),
          RUN_INTEGRATION_TESTS: 'true',
        },
      },
    );
  } finally {
    await database.stop();
  }
}

void main();
