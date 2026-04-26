import {
  createBackendEnv,
  createFrontendEnv,
  findFreePort,
  runCommand,
  startService,
  startTestDatabase,
} from '../support/test-harness';

const criticalE2eSpecs = [
  'tests/e2e/user-auth.spec.ts',
  'tests/e2e/critical-flows.spec.ts',
];

async function main() {
  const cliArgs = process.argv.slice(2);
  const runCriticalOnly = cliArgs.includes('--critical');
  const forwardedArgs = cliArgs.filter((arg) => arg !== '--critical');
  const database = await startTestDatabase('e2e');
  const backendPort = await findFreePort();
  const frontendPort = await findFreePort();

  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const adminBaseUrl = 'http://127.0.0.1:5173';

  let backend: Awaited<ReturnType<typeof startService>> | null = null;
  let frontend: Awaited<ReturnType<typeof startService>> | null = null;

  try {
    backend = await startService(
      'pnpm',
      ['--dir', 'apps/backend', 'exec', 'tsx', 'src/server.ts'],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: backendPort,
            webBaseUrl: frontendBaseUrl,
            adminBaseUrl,
          }),
          NODE_OPTIONS: '--experimental-specifier-resolution=node',
          DRAW_POOL_CACHE_TTL_SECONDS: '0',
          LOG_LEVEL: 'error',
          RATE_LIMIT_GLOBAL_MAX: '100000',
          RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
          RATE_LIMIT_DRAW_MAX: '100000',
          RATE_LIMIT_DRAW_WINDOW_MS: '60000',
          RATE_LIMIT_FINANCE_MAX: '100000',
          RATE_LIMIT_FINANCE_WINDOW_MS: '60000',
          RATE_LIMIT_ADMIN_MAX: '100000',
          RATE_LIMIT_ADMIN_WINDOW_MS: '60000',
        },
        healthUrl: `${backendBaseUrl}/health`,
      },
    );

    frontend = await startService(
      'pnpm',
      [
        '--dir',
        'apps/frontend',
        'exec',
        'next',
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(frontendPort),
      ],
      {
        env: createFrontendEnv({
          port: frontendPort,
          apiBaseUrl: backendBaseUrl,
          appBaseUrl: frontendBaseUrl,
        }),
        healthUrl: `${frontendBaseUrl}/login`,
        startupTimeoutMs: 60_000,
      },
    );

    await runCommand(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        ...forwardedArgs,
        ...(runCriticalOnly ? criticalE2eSpecs : []),
      ],
      {
        env: {
          PLAYWRIGHT_BASE_URL: frontendBaseUrl,
          PLAYWRIGHT_API_BASE_URL: backendBaseUrl,
          PLAYWRIGHT_ADMIN_BASE_URL: adminBaseUrl,
          TEST_DATABASE_URL: database.databaseUrl,
        },
      },
    );
  } finally {
    await frontend?.stop().catch(() => undefined);
    await backend?.stop().catch(() => undefined);
    await database.stop();
  }
}

void main();
