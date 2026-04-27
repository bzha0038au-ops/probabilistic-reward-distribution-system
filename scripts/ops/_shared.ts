import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ParsedArgs = {
  flags: Map<string, string | boolean>;
  positionals: string[];
};

export type FetchTextResult = {
  error?: string;
  ok: boolean;
  status: number | null;
  statusText: string;
  text: string;
  url: string;
};

export type HealthCheckResult = {
  error?: string;
  ok: boolean;
  payload: unknown | null;
  readinessStatus: string;
  status: number | null;
  statusText: string;
  url: string;
};

export type CommandResult = {
  code: number;
  command: string;
  stderr: string;
  stdout: string;
};

export type SentryErrorEvent = {
  eventId: string;
  issue: string;
  level: string;
  message: string;
  project: string;
  release: string;
  service: string;
  statusCode: string;
  timestamp: string;
  title: string;
  transaction: string;
};

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(runtimeDir, '../..');
export const deployFrozenPath = path.join(projectRoot, '.deploy-frozen');
export const financeSanitySqlPath = path.join(projectRoot, 'deploy/sql/finance-sanity.sql');

let envPrimed = false;
const loadedEnvFiles = new Set<string>();

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!current.startsWith('--')) {
      positionals.push(current);
      continue;
    }

    if (current.startsWith('--no-')) {
      flags.set(current.slice('--no-'.length), false);
      continue;
    }

    const equalsIndex = current.indexOf('=');
    if (equalsIndex >= 0) {
      flags.set(current.slice(2, equalsIndex), current.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags.set(current.slice(2), next);
      index += 1;
      continue;
    }

    flags.set(current.slice(2), true);
  }

  return { flags, positionals };
}

export function getFlagString(args: ParsedArgs, name: string) {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function getFlagBoolean(args: ParsedArgs, name: string) {
  return args.flags.get(name) === true;
}

export function getFlagInteger(args: ParsedArgs, name: string) {
  const value = getFlagString(args, name);
  if (!value) {
    return undefined;
  }

  const normalized = Number.parseInt(value, 10);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function splitList(value: string | undefined) {
  return (value ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function fatal(message: string): never {
  console.error(message);
  process.exit(1);
}

export function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

export function secretFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  const inlineCommentIndex = trimmed.search(/\s+#/);
  if (inlineCommentIndex >= 0) {
    return trimmed.slice(0, inlineCommentIndex).trim();
  }

  return trimmed;
}

async function loadEnvFile(filePath: string) {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (loadedEnvFiles.has(resolvedPath) || !(await fileExists(resolvedPath))) {
    return;
  }

  const contents = await readFile(resolvedPath, 'utf8');
  loadedEnvFiles.add(resolvedPath);

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

async function resolveSecretRoot() {
  const candidates = unique(
    [
      process.env.OPS_SECRETS_DIR,
      path.join(projectRoot, '.secrets'),
      process.env.DEPLOY_PATH && process.env.DEPLOY_ENVIRONMENT
        ? path.join(process.env.DEPLOY_PATH, 'shared', process.env.DEPLOY_ENVIRONMENT, 'secrets')
        : undefined,
      process.env.DEPLOY_PATH ? path.join(process.env.DEPLOY_PATH, 'current', '.secrets') : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate))
  );

  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return candidate;
    }
  }

  return '';
}

export async function resolveRuntimePath(filePath: string) {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return '';
  }

  if (await fileExists(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/run/secrets/')) {
    const secretRoot = await resolveSecretRoot();
    if (secretRoot) {
      const mapped = path.join(secretRoot, trimmed.slice('/run/secrets/'.length));
      if (await fileExists(mapped)) {
        return mapped;
      }
    }
  }

  const relativeToRoot = path.resolve(projectRoot, trimmed);
  if (await fileExists(relativeToRoot)) {
    return relativeToRoot;
  }

  return trimmed;
}

async function hydrateEnvFromFileRefs() {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.endsWith('_FILE') || !value?.trim()) {
      continue;
    }

    const targetKey = key.slice(0, -'_FILE'.length);
    if (process.env[targetKey]?.trim()) {
      continue;
    }

    const resolvedPath = await resolveRuntimePath(value);
    if (!(await fileExists(resolvedPath))) {
      continue;
    }

    process.env[targetKey] = (await readFile(resolvedPath, 'utf8')).trim();
  }
}

export async function primeOpsEnvironment() {
  if (envPrimed) {
    return;
  }

  envPrimed = true;

  const envFiles = unique([
    ...splitList(process.env.OPS_ENV_FILES),
    ...(process.env.OPS_ENV_FILE ? [process.env.OPS_ENV_FILE] : []),
    path.join(projectRoot, '.env.d/compose.env'),
    path.join(projectRoot, '.env.d/backend.env'),
    path.join(projectRoot, '.env.d/frontend.env'),
    path.join(projectRoot, '.env.d/admin.env'),
    path.join(projectRoot, 'apps/backend/.env'),
    path.join(projectRoot, 'apps/frontend/.env'),
    path.join(projectRoot, 'apps/admin/.env'),
    path.join(projectRoot, 'apps/mobile/.env'),
  ]);

  for (const envFile of envFiles) {
    await loadEnvFile(envFile);
  }

  await hydrateEnvFromFileRefs();
}

export function resolveBackendBaseUrls() {
  const explicitUrls = splitList(process.env.OPS_HEALTH_URLS);
  if (explicitUrls.length > 0) {
    return explicitUrls.map((url) => url.replace(/\/health\/ready\/?$/, ''));
  }

  const inferred = unique(
    [
      process.env.OPS_BACKEND_BASE_URL,
      process.env.API_BASE_URL,
      process.env.NEXT_PUBLIC_API_BASE_URL,
      process.env.PUBLIC_API_BASE_URL,
      process.env.EXPO_PUBLIC_API_BASE_URL,
    ].filter((value): value is string => Boolean(value?.trim()))
  );

  if (inferred.length > 0) {
    return inferred;
  }

  const backendPort = process.env.PORT?.trim() || '4000';
  return [`http://127.0.0.1:${backendPort}`];
}

export function appendPath(baseUrl: string, pathname: string) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function resolveHealthUrls() {
  const explicitUrls = splitList(process.env.OPS_HEALTH_URLS);
  if (explicitUrls.length > 0) {
    return explicitUrls;
  }

  return unique(resolveBackendBaseUrls().map((baseUrl) => appendPath(baseUrl, '/health/ready')));
}

export function resolveMetricsUrls() {
  const explicitUrls = splitList(process.env.OPS_METRICS_URLS);
  if (explicitUrls.length > 0) {
    return explicitUrls;
  }

  return unique(resolveBackendBaseUrls().map((baseUrl) => appendPath(baseUrl, '/metrics')));
}

export function resolveDatabaseUrl() {
  return (
    process.env.TARGET_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    ''
  );
}

export async function fetchText(url: string, timeoutMs = 5000): Promise<FetchTextResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: await response.text(),
      url,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      status: null,
      statusText: 'fetch_error',
      text: '',
      url,
    };
  }
}

export async function collectHealthChecks(urls: string[], timeoutMs = 5000) {
  const results: HealthCheckResult[] = [];

  for (const url of urls) {
    const response = await fetchText(url, timeoutMs);
    let payload: unknown = null;
    let readinessStatus = '';

    if (response.text) {
      try {
        payload = JSON.parse(response.text) as unknown;
        if (payload && typeof payload === 'object' && 'status' in payload) {
          readinessStatus = String((payload as { status?: unknown }).status ?? '');
        }
      } catch {
        payload = response.text;
      }
    }

    results.push({
      error: response.error,
      ok: response.ok && readinessStatus !== 'not_ready',
      payload,
      readinessStatus,
      status: response.status,
      statusText: response.statusText,
      url,
    });
  }

  return results;
}

export function renderHealthChecks(results: HealthCheckResult[]) {
  return results
    .map((result) => {
      const state = result.ok ? 'OK  ' : 'FAIL';
      const readiness = result.readinessStatus || 'unknown';
      const summary = `${state} ${String(result.status ?? 'ERR').padStart(3, ' ')} ${readiness.padEnd(
        10,
        ' '
      )} ${result.url}`;

      if (!result.payload || typeof result.payload !== 'object' || !('checks' in result.payload)) {
        return result.error ? `${summary}\n  error: ${result.error}` : summary;
      }

      const failingChecks = ((result.payload as { checks?: unknown }).checks ?? [])
        .filter(
          (check): check is { error?: unknown; name?: unknown; required?: unknown; status?: unknown } =>
            Boolean(check && typeof check === 'object')
        )
        .filter((check) => String(check.status ?? '') !== 'up')
        .map((check) => {
          const required = check.required ? 'required' : 'optional';
          const error = typeof check.error === 'string' && check.error ? ` (${check.error})` : '';
          return `  - ${String(check.name ?? 'unknown')}: ${String(check.status ?? 'unknown')} [${required}]${error}`;
        });

      return failingChecks.length > 0 ? `${summary}\n${failingChecks.join('\n')}` : summary;
    })
    .join('\n');
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdin?: string;
  } = {}
): Promise<CommandResult> {
  const renderedCommand = [command, ...args].join(' ');

  return await new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        code: -1,
        command: renderedCommand,
        stderr: error instanceof Error ? error.message : String(error),
        stdout,
      });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        code: code ?? 0,
        command: renderedCommand,
        stderr,
        stdout,
      });
    });

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

export async function runPassthroughCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
) {
  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

export function resolveComposeFile() {
  const candidates = [
    process.env.OPS_COMPOSE_FILE?.trim(),
    path.join(projectRoot, 'docker-compose.prod.yml'),
    path.join(projectRoot, 'docker-compose.yml'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates[0] ?? path.join(projectRoot, 'docker-compose.prod.yml');
}

export async function collectComposeLogs(options: {
  services: string[];
  since?: string;
  tail: number;
  until?: string;
}) {
  const composeFile = resolveComposeFile();
  if (!(await fileExists(composeFile))) {
    return {
      error: `Compose file not found: ${composeFile}`,
      ok: false,
      text: '',
    };
  }

  const args = ['compose', '-f', composeFile, 'logs', '--timestamps', '--tail', String(options.tail)];
  if (options.since) {
    args.push('--since', options.since);
  }
  if (options.until) {
    args.push('--until', options.until);
  }
  args.push(...options.services);

  const result = await runCommand('docker', args);
  return {
    error: result.code === 0 ? undefined : result.stderr.trim() || `docker compose exited with ${result.code}`,
    ok: result.code === 0,
    text: result.stdout.trim(),
  };
}

function resolveSentryBaseUrl() {
  return (process.env.SENTRY_BASE_URL?.trim() || 'https://sentry.io').replace(/\/+$/, '');
}

export async function fetchSentry5xxEvents(options: {
  limit: number;
  query?: string;
}) {
  const sentryOrg = process.env.SENTRY_ORG?.trim() || process.env.OPS_SENTRY_ORG?.trim() || '';
  const sentryToken =
    process.env.SENTRY_AUTH_TOKEN?.trim() || process.env.OPS_SENTRY_AUTH_TOKEN?.trim() || '';

  if (!sentryOrg || !sentryToken) {
    return {
      error: 'SENTRY_ORG and SENTRY_AUTH_TOKEN are required.',
      events: [] as SentryErrorEvent[],
      ok: false,
    };
  }

  const environment =
    process.env.OPS_SENTRY_ENVIRONMENT?.trim() ||
    process.env.OBSERVABILITY_ENVIRONMENT?.trim() ||
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT?.trim() ||
    process.env.PUBLIC_OBSERVABILITY_ENVIRONMENT?.trim() ||
    '';
  const queryParts = [`http.status_code:[500,599]`];
  if (environment) {
    queryParts.unshift(`environment:${environment}`);
  }
  if (options.query?.trim()) {
    queryParts.push(options.query.trim());
  } else if (process.env.OPS_SENTRY_QUERY?.trim()) {
    queryParts.push(process.env.OPS_SENTRY_QUERY.trim());
  }

  const requestUrl = new URL(`${resolveSentryBaseUrl()}/api/0/organizations/${sentryOrg}/events/`);
  const fields = [
    'id',
    'timestamp',
    'project',
    'title',
    'message',
    'issue',
    'level',
    'transaction',
    'http.status_code',
    'release',
    'tags[service]',
  ];
  for (const field of fields) {
    requestUrl.searchParams.append('field', field);
  }
  for (const project of splitList(process.env.SENTRY_PROJECTS || process.env.SENTRY_PROJECT)) {
    requestUrl.searchParams.append('project', project);
  }
  requestUrl.searchParams.set('dataset', 'errors');
  requestUrl.searchParams.set('per_page', String(options.limit));
  requestUrl.searchParams.set('sort', '-timestamp');
  requestUrl.searchParams.set('query', queryParts.join(' '));

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${sentryToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      events: [] as SentryErrorEvent[],
      ok: false,
    };
  }

  if (!response.ok) {
    return {
      error: `Sentry API returned ${response.status} ${response.statusText}`,
      events: [] as SentryErrorEvent[],
      ok: false,
    };
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    return {
      error: 'Sentry API returned an unexpected payload.',
      events: [] as SentryErrorEvent[],
      ok: false,
    };
  }

  const events = payload
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const event = row as Record<string, unknown>;
      return {
        eventId: String(event.id ?? ''),
        issue: String(event.issue ?? ''),
        level: String(event.level ?? ''),
        message: String(event.message ?? ''),
        project: String(event.project ?? ''),
        release: String(event.release ?? ''),
        service: String(event['tags[service]'] ?? ''),
        statusCode: String(event['http.status_code'] ?? ''),
        timestamp: String(event.timestamp ?? ''),
        title: String(event.title ?? ''),
        transaction: String(event.transaction ?? ''),
      } satisfies SentryErrorEvent;
    })
    .filter((event): event is SentryErrorEvent => Boolean(event));

  return {
    events,
    ok: true,
  };
}

export function renderSentryEvents(events: SentryErrorEvent[]) {
  if (events.length === 0) {
    return 'No matching Sentry 5xx events found.';
  }

  return events
    .map((event) => {
      const summary = [
        event.timestamp || 'unknown-time',
        event.project || 'unknown-project',
        event.statusCode || 'unknown-status',
        event.title || event.message || 'untitled-error',
      ].join(' | ');
      const details = [
        event.transaction ? `txn=${event.transaction}` : '',
        event.service ? `service=${event.service}` : '',
        event.release ? `release=${event.release}` : '',
        event.issue ? `issue=${event.issue}` : '',
        event.eventId ? `event=${event.eventId}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      return details ? `${summary}\n  ${details}` : summary;
    })
    .join('\n');
}

export async function readManagedSecretFile(options: {
  envFileKey: string;
  fallbackName: string;
}) {
  const configuredPath = process.env[options.envFileKey]?.trim() || '';
  const secretRoot = await resolveSecretRoot();
  const fallbackPath = secretRoot ? path.join(secretRoot, options.fallbackName) : '';
  const resolvedPath = configuredPath ? await resolveRuntimePath(configuredPath) : fallbackPath;

  if (!resolvedPath || !(await fileExists(resolvedPath))) {
    return {
      filePath: resolvedPath,
      value: process.env[options.envFileKey.replace(/_FILE$/, '')]?.trim() || '',
    };
  }

  return {
    filePath: resolvedPath,
    value: (await readFile(resolvedPath, 'utf8')).trim(),
  };
}

export async function writeManagedSecretFile(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${value.trim()}\n`, 'utf8');
}

export async function removeManagedSecretFile(filePath: string) {
  await rm(filePath, { force: true });
}

export async function writeTextFile(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

function extractOutputText(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'output_text' in payload) {
    const outputText = (payload as { output_text?: unknown }).output_text;
    if (typeof outputText === 'string' && outputText.trim()) {
      return outputText.trim();
    }
  }

  const segments: string[] = [];

  const visit = (value: unknown) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      if (value.trim()) {
        segments.push(value.trim());
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    if (record.type === 'output_text' || record.type === 'text') {
      visit(record.text);
    }
    if (record.content) {
      visit(record.content);
    }
    if (record.output) {
      visit(record.output);
    }
  };

  visit(payload);
  return segments.join('\n').trim();
}

export async function runAiPrompt(options: {
  maxOutputTokens?: number;
  promptOnly?: boolean;
  systemPrompt: string;
  userPrompt: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || '';
  const model =
    process.env.OPS_AI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    process.env.OPENAI_DEFAULT_MODEL?.trim() ||
    '';

  const renderedPrompt = [
    '=== SYSTEM ===',
    options.systemPrompt,
    '',
    '=== USER ===',
    options.userPrompt,
  ].join('\n');

  if (options.promptOnly || !apiKey || !model) {
    return {
      missingConfig:
        options.promptOnly || (apiKey && model)
          ? ''
          : 'OPENAI_API_KEY and OPS_AI_MODEL (or OPENAI_MODEL) are required for live AI output.',
      mode: 'prompt_only' as const,
      text: renderedPrompt,
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: options.userPrompt,
      instructions: options.systemPrompt,
      max_output_tokens: options.maxOutputTokens,
      model,
      store: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    return {
      missingConfig: '',
      mode: 'error' as const,
      text: `OpenAI API returned ${response.status} ${response.statusText}\n${JSON.stringify(payload, null, 2)}`,
    };
  }

  const outputText = extractOutputText(payload);
  return {
    missingConfig: '',
    mode: 'response' as const,
    text: outputText || JSON.stringify(payload, null, 2),
  };
}
