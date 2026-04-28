import { readFile, rm, writeFile } from 'node:fs/promises';

import {
  createAdminEnv,
  createBackendEnv,
  createFrontendEnv,
  findFreePort,
  repoRoot,
  runCommand,
  startBackgroundProcess,
  startService,
  startTestDatabase,
} from '../support/test-harness';

const criticalE2eSpecs = [
  'tests/e2e/critical-failure-flows.spec.ts',
  'tests/e2e/user-auth.spec.ts',
  'tests/e2e/critical-flows.spec.ts',
];

const saasWebhookSpec = 'tests/e2e/saas-webhook.spec.ts';
const fullBackendE2eSpecs = [saasWebhookSpec];

async function main() {
  const cliArgs = process.argv.slice(2);
  const runCriticalOnly = cliArgs.includes('--critical');
  const forwardedArgs = cliArgs.filter(
    (arg) => arg !== '--critical' && arg !== '--',
  );
  const requestedSpecPaths = forwardedArgs.filter((arg) =>
    arg.startsWith('tests/e2e/') && arg.endsWith('.spec.ts'),
  );
  const runsFullSuite = !runCriticalOnly && requestedSpecPaths.length === 0;
  const requiresFullBackend =
    runsFullSuite ||
    requestedSpecPaths.some((specPath) =>
      fullBackendE2eSpecs.includes(specPath),
    );
  const runAdminOnlySaasWebhookSpec =
    !runCriticalOnly &&
    forwardedArgs.length === 1 &&
    requestedSpecPaths.length === 1 &&
    requestedSpecPaths[0] === saasWebhookSpec;
  const useMinimalBackend = !requiresFullBackend;
  const database = await startTestDatabase('e2e');
  const backendPort = await findFreePort();
  const frontendPort = await findFreePort();
  const adminPort = await findFreePort();
  const frontendDistDir = `.next-e2e-${frontendPort}`;
  const frontendTsconfigPath = `${repoRoot}/apps/frontend/tsconfig.json`;

  const backendBaseUrl = `http://localhost:${backendPort}`;
  const frontendBaseUrl = `http://localhost:${frontendPort}`;
  const adminBaseUrl = `http://localhost:${adminPort}`;

  let backend: Awaited<ReturnType<typeof startService>> | null = null;
  let frontend: Awaited<ReturnType<typeof startService>> | null = null;
  let admin: Awaited<ReturnType<typeof startService>> | null = null;
  let saasBillingWorker:
    | Awaited<ReturnType<typeof startBackgroundProcess>>
    | null = null;
  let originalFrontendTsconfig: string | null = null;

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
          PLAYWRIGHT_MINIMAL_BACKEND: useMinimalBackend ? 'true' : 'false',
          DRAW_POOL_CACHE_TTL_SECONDS: '0',
          LOG_LEVEL: 'error',
          RATE_LIMIT_GLOBAL_MAX: '100000',
          RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
          RATE_LIMIT_AUTH_MAX: '100000',
          RATE_LIMIT_AUTH_WINDOW_MS: '60000',
          RATE_LIMIT_ADMIN_AUTH_MAX: '100000',
          RATE_LIMIT_ADMIN_AUTH_WINDOW_MS: '60000',
          RATE_LIMIT_DRAW_MAX: '100000',
          RATE_LIMIT_DRAW_WINDOW_MS: '60000',
          RATE_LIMIT_FINANCE_MAX: '100000',
          RATE_LIMIT_FINANCE_WINDOW_MS: '60000',
          RATE_LIMIT_ADMIN_MAX: '100000',
          RATE_LIMIT_ADMIN_WINDOW_MS: '60000',
        },
        healthUrl: `${backendBaseUrl}/health`,
        startupTimeoutMs: 90_000,
      },
    );

    saasBillingWorker = await startBackgroundProcess(
      'pnpm',
      ['--dir', 'apps/backend', 'exec', 'tsx', 'src/workers/saas-billing-worker.ts'],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: backendPort,
            webBaseUrl: frontendBaseUrl,
            adminBaseUrl,
          }),
          LOG_LEVEL: 'error',
          SAAS_BILLING_WORKER_INTERVAL_MS: '250',
          SAAS_BILLING_AUTOMATION_ENABLED: 'false',
          SAAS_OUTBOUND_WEBHOOK_REQUEST_TIMEOUT_MS: '2000',
        },
      },
    );

    if (!runAdminOnlySaasWebhookSpec) {
      originalFrontendTsconfig = await readFile(frontendTsconfigPath, 'utf8');
      const frontendTsconfig = JSON.parse(originalFrontendTsconfig) as {
        include?: string[];
      };
      const nextTypesInclude = `${frontendDistDir}/types/**/*.ts`;
      const include = frontendTsconfig.include ?? [];
      if (!include.includes(nextTypesInclude)) {
        frontendTsconfig.include = [...include, nextTypesInclude];
        await writeFile(
          frontendTsconfigPath,
          `${JSON.stringify(frontendTsconfig, null, 2)}\n`,
        );
      }

      await rm(`${repoRoot}/apps/frontend/${frontendDistDir}`, {
        recursive: true,
        force: true,
      });

      frontend = await startService(
        'pnpm',
        [
          '--dir',
          'apps/frontend',
          'exec',
          'next',
          'dev',
          '--hostname',
          'localhost',
          '--port',
          String(frontendPort),
        ],
        {
          env: createFrontendEnv({
            port: frontendPort,
            apiBaseUrl: backendBaseUrl,
            appBaseUrl: frontendBaseUrl,
            nextDistDir: frontendDistDir,
          }),
          healthUrl: `${frontendBaseUrl}/login`,
          startupTimeoutMs: 120_000,
        },
      );
    }

    admin = await startService(
      'pnpm',
      [
        '--dir',
        'apps/admin',
        'exec',
        'vite',
        'dev',
        '--host',
        'localhost',
        '--port',
        String(adminPort),
      ],
      {
        env: createAdminEnv({
          apiBaseUrl: backendBaseUrl,
          adminBaseUrl,
        }),
        healthUrl: `${adminBaseUrl}/login`,
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
          PLAYWRIGHT_BASE_URL: runAdminOnlySaasWebhookSpec
            ? adminBaseUrl
            : frontendBaseUrl,
          PLAYWRIGHT_API_BASE_URL: backendBaseUrl,
          PLAYWRIGHT_ADMIN_BASE_URL: adminBaseUrl,
          TEST_DATABASE_URL: database.databaseUrl,
        },
      },
    );
  } finally {
    await admin?.stop().catch(() => undefined);
    await frontend?.stop().catch(() => undefined);
    await saasBillingWorker?.stop().catch(() => undefined);
    await backend?.stop().catch(() => undefined);
    if (originalFrontendTsconfig !== null) {
      await writeFile(frontendTsconfigPath, originalFrontendTsconfig).catch(
        () => undefined,
      );
    }
    await rm(`${repoRoot}/apps/frontend/${frontendDistDir}`, {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    await database.stop();
  }
}

void main();
