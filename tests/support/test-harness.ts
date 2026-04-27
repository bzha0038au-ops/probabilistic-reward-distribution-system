import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import postgres, { type Sql } from 'postgres';
import { PostgresInstance } from 'pg-embedded';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(currentDir, '../..');

const sharedInstallationDir = path.join(repoRoot, '.tmp', 'pg-embedded');
const sharedArtifactsDir = path.join(repoRoot, '.tmp', 'tests');

const TEST_DATABASE_NAME = 'reward_local';
const TEST_DATABASE_IDENTIFIER_LIMIT = 63;
const EXTERNAL_TEST_DATABASE_MODES = new Set(['external', 'service']);

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe';
};

type ServiceOptions = CommandOptions & {
  healthUrl: string;
  startupTimeoutMs?: number;
};

export type TestDatabase = {
  databaseUrl: string;
  safeDatabaseUrl: string;
  databaseName: string;
  runDir: string;
  stop: () => Promise<void>;
};

export type ServiceHandle = {
  stop: () => Promise<void>;
};

const makeChildEnv = (env?: NodeJS.ProcessEnv) => {
  const childEnv = {
    ...process.env,
    ...env,
  };

  if (childEnv.FORCE_COLOR && childEnv.NO_COLOR) {
    delete childEnv.NO_COLOR;
  }

  return childEnv;
};

const toCommandLabel = (command: string, args: string[]) =>
  [command, ...args].join(' ');

const buildDatabaseUrl = (payload: {
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
}) =>
  `postgresql://${encodeURIComponent(payload.username)}:${encodeURIComponent(
    payload.password,
  )}@${payload.host}:${payload.port}/${payload.databaseName}`;

const sanitizeDatabaseIdentifier = (value: string) => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized === '' ? 'test' : sanitized;
};

const createEphemeralDatabaseName = (profile: string, runId: string) => {
  const name = [
    'reward',
    sanitizeDatabaseIdentifier(profile),
    sanitizeDatabaseIdentifier(runId),
  ].join('_');

  return name.slice(0, TEST_DATABASE_IDENTIFIER_LIMIT).replace(/_+$/g, '');
};

const replaceDatabaseName = (databaseUrl: string, databaseName: string) => {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
};

const redactDatabaseUrl = (databaseUrl: string) => {
  const parsed = new URL(databaseUrl);
  if (parsed.password !== '') {
    parsed.password = '***';
  }
  return parsed.toString();
};

const quoteDatabaseIdentifier = (databaseName: string) =>
  `"${databaseName.replace(/"/g, '""')}"`;

const shouldUseExternalTestDatabase = () => {
  const mode = process.env.TEST_DATABASE_MODE?.trim().toLowerCase();
  return mode ? EXTERNAL_TEST_DATABASE_MODES.has(mode) : false;
};

const resolveExternalAdminDatabaseUrl = () =>
  process.env.TEST_DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  null;

const dropExternalTestDatabase = async (
  adminDatabaseUrl: string,
  databaseName: string,
) => {
  const sql = createSqlClient(adminDatabaseUrl);

  try {
    await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${databaseName}
        and pid <> pg_backend_pid()
    `;
    await sql.unsafe(`drop database if exists ${quoteDatabaseIdentifier(databaseName)}`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
};

export const backendTestSecrets = {
  adminJwtSecret: 'integration-admin-secret-1234567890-abcdefghijklmnopqrstuvwxyz',
  userJwtSecret: 'integration-user-secret-1234567890-abcdefghijklmnopqrstuvwxyz',
  authSecret: 'integration-auth-secret-1234567890-abcdefghijklmnopqrstuvwxyz',
  adminMfaEncryptionSecret:
    'integration-admin-mfa-secret-1234567890-abcdefghijklmnopqrstuvwxyz',
  adminMfaBreakGlassSecret:
    'integration-break-glass-secret-1234567890-abcdefghijklmnopqrstuvwxyz',
};

export const createBackendEnv = (payload: {
  databaseUrl: string;
  port: number;
  webBaseUrl: string;
  adminBaseUrl?: string;
}) => ({
  NODE_ENV: 'test',
  DATABASE_URL: payload.databaseUrl,
  POSTGRES_URL: payload.databaseUrl,
  PORT: String(payload.port),
  WEB_BASE_URL: payload.webBaseUrl,
  ADMIN_BASE_URL: payload.adminBaseUrl ?? 'http://127.0.0.1:5173',
  ADMIN_JWT_SECRET: backendTestSecrets.adminJwtSecret,
  USER_JWT_SECRET: backendTestSecrets.userJwtSecret,
  AUTH_SECRET: backendTestSecrets.authSecret,
  ADMIN_MFA_ENCRYPTION_SECRET: backendTestSecrets.adminMfaEncryptionSecret,
  ADMIN_MFA_BREAK_GLASS_SECRET: backendTestSecrets.adminMfaBreakGlassSecret,
});

export const createFrontendEnv = (payload: {
  port: number;
  apiBaseUrl: string;
  appBaseUrl: string;
}) => ({
  NODE_ENV: 'development',
  PORT: String(payload.port),
  API_BASE_URL: payload.apiBaseUrl,
  NEXT_PUBLIC_API_BASE_URL: payload.apiBaseUrl,
  AUTH_SECRET: backendTestSecrets.authSecret,
  USER_JWT_SECRET: backendTestSecrets.userJwtSecret,
  AUTH_TRUST_HOST: 'true',
  AUTH_URL: payload.appBaseUrl,
  NEXTAUTH_URL: payload.appBaseUrl,
});

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
) {
  const label = toCommandLabel(command, args);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: makeChildEnv(options.env),
      stdio: options.stdio ?? 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${label} exited with ${code ?? 'null'}${signal ? ` (${signal})` : ''}.`,
        ),
      );
    });
  });
}

export async function findFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve a free port.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function waitForHttp(
  url: string,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return;
      }

      lastError = new Error(`Received ${response.status} from ${url}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for ${url}${lastError ? `: ${String(lastError)}` : '.'}`,
  );
}

const stopChildProcess = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.once('exit', () => resolve(true));
    }),
    delay(10_000).then(() => false),
  ]);

  if (!exited) {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });
  }
};

export async function startService(
  command: string,
  args: string[],
  options: ServiceOptions,
): Promise<ServiceHandle> {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: makeChildEnv(options.env),
    stdio: options.stdio ?? 'inherit',
  });

  let startupError: unknown = null;
  child.once('error', (error) => {
    startupError = error;
  });

  try {
    await waitForHttp(options.healthUrl, {
      timeoutMs: options.startupTimeoutMs ?? 45_000,
    });
  } catch (error) {
    await stopChildProcess(child);
    if (startupError) {
      throw startupError;
    }
    throw error;
  }

  return {
    stop: async () => {
      await stopChildProcess(child);
    },
  };
}

export async function startTestDatabase(profile: string): Promise<TestDatabase> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = path.join(sharedArtifactsDir, profile, runId);

  await mkdir(runDir, { recursive: true });

  if (shouldUseExternalTestDatabase()) {
    const adminDatabaseUrl = resolveExternalAdminDatabaseUrl();
    if (!adminDatabaseUrl) {
      throw new Error(
        'TEST_DATABASE_MODE requires TEST_DATABASE_ADMIN_URL, DATABASE_URL, or POSTGRES_URL.',
      );
    }

    const databaseName = createEphemeralDatabaseName(profile, runId);
    const databaseUrl = replaceDatabaseName(adminDatabaseUrl, databaseName);
    const safeDatabaseUrl = redactDatabaseUrl(databaseUrl);

    try {
      const adminSql = createSqlClient(adminDatabaseUrl);
      try {
        await adminSql.unsafe(`create database ${quoteDatabaseIdentifier(databaseName)}`);
      } finally {
        await adminSql.end({ timeout: 5 }).catch(() => undefined);
      }

      await runCommand(
        'pnpm',
        ['--dir', 'apps/database', 'exec', 'drizzle-kit', 'migrate'],
        {
          env: {
            DATABASE_URL: databaseUrl,
            POSTGRES_URL: databaseUrl,
          },
        },
      );
    } catch (error) {
      await dropExternalTestDatabase(adminDatabaseUrl, databaseName).catch(() => undefined);
      await rm(runDir, { recursive: true, force: true });
      throw error;
    }

    return {
      databaseUrl,
      safeDatabaseUrl,
      databaseName,
      runDir,
      stop: async () => {
        await dropExternalTestDatabase(adminDatabaseUrl, databaseName).catch(() => undefined);
        await rm(runDir, { recursive: true, force: true });
      },
    };
  }

  const dataDir = path.join(runDir, 'pgdata');

  await mkdir(dataDir, { recursive: true });
  await mkdir(sharedInstallationDir, { recursive: true });

  const instance = new PostgresInstance({
    port: 0,
    username: 'postgres',
    password: 'postgres',
    dataDir,
    installationDir: sharedInstallationDir,
    databaseName: 'postgres',
    timeout: 60,
    setupTimeout: 120,
    persistent: false,
  });

  await instance.start();
  await instance.createDatabase(TEST_DATABASE_NAME);

  const { host, port, username, password } = instance.connectionInfo;
  const databaseUrl = buildDatabaseUrl({
    host,
    port,
    username,
    password,
    databaseName: TEST_DATABASE_NAME,
  });
  const safeDatabaseUrl = `postgresql://${username}:***@${host}:${port}/${TEST_DATABASE_NAME}`;

  try {
    await runCommand(
      'pnpm',
      ['--dir', 'apps/database', 'exec', 'drizzle-kit', 'migrate'],
      {
        env: {
          DATABASE_URL: databaseUrl,
          POSTGRES_URL: databaseUrl,
        },
      },
    );
  } catch (error) {
    await instance.stop().catch(() => undefined);
    await instance.cleanup().catch(() => undefined);
    await rm(runDir, { recursive: true, force: true });
    throw error;
  }

  return {
    databaseUrl,
    safeDatabaseUrl,
    databaseName: TEST_DATABASE_NAME,
    runDir,
    stop: async () => {
      await instance.stop().catch(() => undefined);
      await instance.cleanup().catch(() => undefined);
      await rm(runDir, { recursive: true, force: true });
    },
  };
}

export function createSqlClient(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });
}

export async function waitForNotificationPayload(
  databaseUrl: string,
  payload: {
    kind: string;
    recipient: string;
    timeoutMs?: number;
  },
) {
  const sql = createSqlClient(databaseUrl);
  const deadline = Date.now() + (payload.timeoutMs ?? 10_000);

  try {
    while (Date.now() < deadline) {
      const rows = await sql<Array<{ payload: Record<string, unknown> }>>`
        select payload
        from notification_deliveries
        where kind = ${payload.kind}
          and recipient = ${payload.recipient}
        order by id desc
        limit 1
      `;

      const value = rows[0]?.payload;
      if (typeof value === 'string') {
        return JSON.parse(value) as Record<string, unknown>;
      }

      if (value && typeof value === 'object') {
        return value;
      }

      await delay(200);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  throw new Error(
    `Timed out waiting for ${payload.kind} notification for ${payload.recipient}.`,
  );
}
