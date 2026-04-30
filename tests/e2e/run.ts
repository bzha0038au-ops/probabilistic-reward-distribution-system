import { readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import {
  createAdminEnv,
  createBackendEnv,
  createFrontendEnv,
  createSaasPortalEnv,
  createSaasStatusEnv,
  findFreePort,
  repoRoot,
  runCommand,
  startBackgroundProcess,
  startService,
  startTestDatabase,
  waitForHttp,
} from '../support/test-harness';

const criticalE2eSpecs = [
  'tests/e2e/critical-failure-flows.spec.ts',
  'tests/e2e/user-auth.spec.ts',
  'tests/e2e/critical-flows.spec.ts',
];

const saasWebhookSpec = 'tests/e2e/saas-webhook.spec.ts';
const portalSpec = 'tests/e2e/saas-portal.spec.ts';
const saasStatusSpec = 'tests/e2e/saas-status.spec.ts';
const fullBackendE2eSpecs = [saasWebhookSpec];
const portalE2eSpecs = [portalSpec];
const saasStatusE2eSpecs = [saasStatusSpec];

const warmUpHttp = async (
  url: string,
  options: {
    method?: 'GET' | 'POST';
    body?: BodyInit;
    headers?: HeadersInit;
    allowedStatuses?: readonly number[];
    timeoutMs?: number;
  } = {},
) => {
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        body: options.body,
        headers: options.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });

      if (
        response.ok ||
        (response.status >= 300 && response.status < 400) ||
        options.allowedStatuses?.includes(response.status)
      ) {
        return;
      }

      lastError = new Error(`Received ${response.status} from ${url}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out warming ${url}${lastError ? `: ${String(lastError)}` : '.'}`,
  );
};

const warmUpFrontend = async (baseUrl: string) => {
  await waitForHttp(`${baseUrl}/login`, {
    timeoutMs: 120_000,
    requestTimeoutMs: 15_000,
  });

  for (const path of [
    '/register',
    '/verify-email?token=warmup',
    '/app',
    '/app/wallet',
    '/app/payments',
    '/app/security',
    '/app/slot',
    '/app/quick-eight',
    '/app/holdem',
    '/app/markets',
  ]) {
    await warmUpHttp(`${baseUrl}${path}`);
  }

  await warmUpHttp(`${baseUrl}/api/backend/auth/user/session`, {
    allowedStatuses: [401],
  });
  await warmUpHttp(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: new URLSearchParams({
      email: '',
      password: '',
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    allowedStatuses: [400],
  });
};

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
      fullBackendE2eSpecs.includes(specPath) || portalE2eSpecs.includes(specPath),
    );
  const requiresPortal =
    runsFullSuite ||
    requestedSpecPaths.some((specPath) => portalE2eSpecs.includes(specPath));
  const runAdminOnlySaasWebhookSpec =
    !runCriticalOnly &&
    forwardedArgs.length === 1 &&
    requestedSpecPaths.length === 1 &&
    requestedSpecPaths[0] === saasWebhookSpec;
  const runPortalOnlySpec =
    !runCriticalOnly &&
    requestedSpecPaths.length > 0 &&
    requestedSpecPaths.every((specPath) => portalE2eSpecs.includes(specPath));
  const requiresSaasStatus =
    runsFullSuite ||
    requestedSpecPaths.some((specPath) => saasStatusE2eSpecs.includes(specPath));
  const runSaasStatusOnlySpec =
    !runCriticalOnly &&
    requestedSpecPaths.length > 0 &&
    requestedSpecPaths.every((specPath) => saasStatusE2eSpecs.includes(specPath));
  const useMinimalBackend = !requiresFullBackend;
  const database = await startTestDatabase('e2e');
  const backendPort = await findFreePort();
  const frontendPort = await findFreePort();
  const portalPort = await findFreePort();
  const saasStatusPort = await findFreePort();
  const adminPort = await findFreePort();
  const frontendDistDir = `.next-e2e-${frontendPort}`;
  const frontendTsconfigPath = `${repoRoot}/apps/frontend/tsconfig.json`;

  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const portalBaseUrl = `http://127.0.0.1:${portalPort}`;
  const saasStatusBaseUrl = `http://127.0.0.1:${saasStatusPort}`;
  const adminBaseUrl = `http://127.0.0.1:${adminPort}`;

  let backend: Awaited<ReturnType<typeof startService>> | null = null;
  let frontend: Awaited<ReturnType<typeof startService>> | null = null;
  let portal: Awaited<ReturnType<typeof startService>> | null = null;
  let saasStatus: Awaited<ReturnType<typeof startService>> | null = null;
  let admin: Awaited<ReturnType<typeof startService>> | null = null;
  let saasBillingWorker:
    | Awaited<ReturnType<typeof startBackgroundProcess>>
    | null = null;
  let holdemTimeoutWorker:
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
        startupTimeoutMs: 180_000,
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

    holdemTimeoutWorker = await startBackgroundProcess(
      'pnpm',
      ['--dir', 'apps/backend', 'exec', 'tsx', 'src/workers/holdem-timeout-worker.ts'],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: backendPort,
            webBaseUrl: frontendBaseUrl,
            adminBaseUrl,
          }),
          LOG_LEVEL: 'error',
          HOLDEM_TIMEOUT_WORKER_ENABLED: 'true',
          HOLDEM_TIMEOUT_WORKER_INTERVAL_MS: '100',
          HOLDEM_TIMEOUT_WORKER_BATCH_SIZE: '25',
        },
      },
    );

    if (
      !runAdminOnlySaasWebhookSpec &&
      !runPortalOnlySpec &&
      !runSaasStatusOnlySpec
    ) {
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
          '127.0.0.1',
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
          startupTimeoutMs: 240_000,
        },
      );

      await warmUpFrontend(frontendBaseUrl);
    }

    if (requiresPortal) {
      portal = await startService(
        'pnpm',
        [
          '--dir',
          'apps/saas-portal',
          'exec',
          'next',
          'dev',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(portalPort),
        ],
        {
          env: createSaasPortalEnv({
            port: portalPort,
            apiBaseUrl: backendBaseUrl,
            appBaseUrl: portalBaseUrl,
          }),
          healthUrl: `${portalBaseUrl}/login`,
          startupTimeoutMs: 240_000,
        },
      );
    }

    if (requiresSaasStatus) {
      saasStatus = await startService(
        'pnpm',
        [
          '--dir',
          'apps/saas-status',
          'exec',
          'next',
          'dev',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(saasStatusPort),
        ],
        {
          env: createSaasStatusEnv({
            port: saasStatusPort,
            apiBaseUrl: backendBaseUrl,
          }),
          healthUrl: `${saasStatusBaseUrl}/`,
          startupTimeoutMs: 240_000,
        },
      );

      await warmUpHttp(`${saasStatusBaseUrl}/`);
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
        '127.0.0.1',
        '--port',
        String(adminPort),
      ],
      {
        env: createAdminEnv({
          apiBaseUrl: backendBaseUrl,
          adminBaseUrl,
        }),
        healthUrl: `${adminBaseUrl}/login`,
        startupTimeoutMs: 90_000,
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
            : runPortalOnlySpec
              ? portalBaseUrl
              : runSaasStatusOnlySpec
                ? saasStatusBaseUrl
              : frontendBaseUrl,
          PLAYWRIGHT_API_BASE_URL: backendBaseUrl,
          PLAYWRIGHT_ADMIN_BASE_URL: adminBaseUrl,
          PLAYWRIGHT_PORTAL_BASE_URL: portalBaseUrl,
          PLAYWRIGHT_SAAS_STATUS_BASE_URL: saasStatusBaseUrl,
          TEST_DATABASE_URL: database.databaseUrl,
        },
      },
    );
  } finally {
    await admin?.stop().catch(() => undefined);
    await saasStatus?.stop().catch(() => undefined);
    await portal?.stop().catch(() => undefined);
    await frontend?.stop().catch(() => undefined);
    await holdemTimeoutWorker?.stop().catch(() => undefined);
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
