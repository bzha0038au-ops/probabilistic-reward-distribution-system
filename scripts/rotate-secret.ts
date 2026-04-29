import { readFile } from 'node:fs/promises';

import { SignJWT } from 'jose';
import { saasApiKeys, saasProjects, saasTenants } from '@reward/database';
import { and, desc, eq, gt, isNull } from '@reward/database/orm';

import { resetDb, db } from '../apps/backend/src/db';
import {
  authenticateProjectApiKey,
  rotateProjectApiKey,
} from '../apps/backend/src/modules/saas/service';
import {
  fatal,
  getFlagBoolean,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  readManagedSecretFile,
  secretFingerprint,
} from './ops/_shared';
import { runRotateJwtCli } from './ops/rotate-jwt';

type JwtTarget = 'admin' | 'user';

type JwtTargetConfig = {
  currentEnvFileKey: string;
  previousEnvFileKey: string;
};

type ApiKeyRow = typeof saasApiKeys.$inferSelect;

const JWT_TARGETS: Record<JwtTarget, JwtTargetConfig> = {
  admin: {
    currentEnvFileKey: 'ADMIN_JWT_SECRET_FILE',
    previousEnvFileKey: 'ADMIN_JWT_SECRET_PREVIOUS_FILE',
  },
  user: {
    currentEnvFileKey: 'USER_JWT_SECRET_FILE',
    previousEnvFileKey: 'USER_JWT_SECRET_PREVIOUS_FILE',
  },
};

function printUsage() {
  console.log(`Usage:
  pnpm ops:rotate-secret jwt status [--target admin|user]
  pnpm ops:rotate-secret jwt stage --target admin|user --generate [--apply]
  pnpm ops:rotate-secret jwt finalize --target admin|user [--apply]
  pnpm ops:rotate-secret jwt smoke --target admin|user [--require-previous]

  pnpm ops:rotate-secret saas status --project-id <id> [--key-id <id>] [--limit 10]
  pnpm ops:rotate-secret saas rotate --project-id <id> [--key-id <id>] [--admin-id <id>] [--label <label>] [--expires-at <iso>] [--overlap-seconds <seconds>] [--reason <text>]
  pnpm ops:rotate-secret saas drill --project-id <id> [--key-id <id>] --current-key <plain>|--current-key-file <path> [--admin-id <id>] [--overlap-seconds 300] [--reason <text>]

Notes:
  - JWT stage/finalize reuse the existing *_PREVIOUS file workflow.
  - JWT smoke signs synthetic tokens and runs the real verifier code paths.
  - SaaS drill is intended for a dedicated canary project because it performs a
    real key rotation and returns a fresh plaintext key once.
`);
}

function resolveJwtTarget(rawTarget: string | undefined): JwtTarget {
  if (rawTarget === 'admin' || rawTarget === 'user') {
    return rawTarget;
  }

  fatal('JWT target must be admin or user.');
}

async function readJwtState(target: JwtTarget) {
  const config = JWT_TARGETS[target];
  const current = await readManagedSecretFile({
    envFileKey: config.currentEnvFileKey,
    fallbackName: `${target}_jwt_secret`,
  });
  const previous = await readManagedSecretFile({
    envFileKey: config.previousEnvFileKey,
    fallbackName: `${target}_jwt_secret_previous`,
  });

  return {
    current,
    previous,
    target,
  };
}

async function signJwtToken(target: JwtTarget, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const baseToken = new SignJWT(
    target === 'admin'
      ? {
          adminId: 7,
          userId: 7,
          email: 'rotation-admin@example.com',
          role: 'admin',
          mfaEnabled: true,
          mfaRecoveryMode: 'none',
        }
      : {
          userId: 42,
          email: 'rotation-user@example.com',
          role: 'user',
        },
  )
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(`rotation-smoke-${target}-${now}`);

  if (target === 'admin') {
    baseToken.setSubject('7');
  } else {
    baseToken.setSubject('42');
  }

  return await baseToken.sign(new TextEncoder().encode(secret));
}

async function smokeUserJwtVerification(
  secretLabel: 'current' | 'previous',
  token: string,
) {
  const backendModule = await import('../apps/backend/src/shared/session-secret');
  const frontendModule = await import('../apps/frontend/lib/auth/backend-session');
  const portalModule = await import('../apps/saas-portal/lib/auth/backend-session');

  const backendResult = await backendModule.verifySessionJwt(token, 'user');
  const frontendResult = await frontendModule.verifyBackendAccessToken(token);
  const portalResult = await portalModule.verifyBackendAccessToken(token);

  if (!backendResult.payload.sub || !frontendResult || !portalResult) {
    fatal(`User JWT ${secretLabel} smoke failed.`);
  }

  console.log(`user ${secretLabel}: backend/frontend/portal accepted`);
}

async function smokeAdminJwtVerification(
  secretLabel: 'current' | 'previous',
  token: string,
) {
  const backendModule = await import('../apps/backend/src/shared/session-secret');
  const adminModule = await import('../apps/admin/src/lib/server/admin-session-core');

  const backendResult = await backendModule.verifySessionJwt(token, 'admin');
  const adminResult = await adminModule.verifyAdminSessionTokenWithEnv(token, process.env);

  if (!backendResult.payload.sub || !adminResult) {
    fatal(`Admin JWT ${secretLabel} smoke failed.`);
  }

  console.log(`admin ${secretLabel}: backend/admin accepted`);
}

async function runJwtSmoke(argv: string[]) {
  const args = parseArgs(argv);
  const target = resolveJwtTarget(getFlagString(args, 'target'));
  const state = await readJwtState(target);
  const requirePrevious = getFlagBoolean(args, 'require-previous');

  if (!state.current.value) {
    fatal(`${target.toUpperCase()} current secret is missing.`);
  }

  console.log(`${target.toUpperCase()} JWT smoke`);
  console.log(
    `  current : ${secretFingerprint(state.current.value)} (${state.current.filePath || 'env'})`,
  );
  console.log(
    `  previous: ${state.previous.value ? secretFingerprint(state.previous.value) : 'missing'} (${state.previous.filePath || 'env'})`,
  );

  const currentToken = await signJwtToken(target, state.current.value);
  if (target === 'admin') {
    await smokeAdminJwtVerification('current', currentToken);
  } else {
    await smokeUserJwtVerification('current', currentToken);
  }

  const previousValue =
    state.previous.value && state.previous.value !== state.current.value
      ? state.previous.value
      : '';

  if (requirePrevious && !previousValue) {
    fatal(`${target.toUpperCase()} previous secret is not active.`);
  }

  if (previousValue) {
    const previousToken = await signJwtToken(target, previousValue);
    if (target === 'admin') {
      await smokeAdminJwtVerification('previous', previousToken);
    } else {
      await smokeUserJwtVerification('previous', previousToken);
    }
  } else {
    console.log('previous: skipped (no distinct *_PREVIOUS secret active)');
  }
}

async function resolveProjectState(projectId: number) {
  const [project] = await db
    .select({
      id: saasProjects.id,
      slug: saasProjects.slug,
      name: saasProjects.name,
      environment: saasProjects.environment,
      status: saasProjects.status,
      tenantId: saasTenants.id,
      tenantName: saasTenants.name,
    })
    .from(saasProjects)
    .innerJoin(saasTenants, eq(saasProjects.tenantId, saasTenants.id))
    .where(eq(saasProjects.id, projectId))
    .limit(1);

  if (!project) {
    fatal(`Project ${projectId} not found.`);
  }

  return project;
}

async function resolveTargetApiKey(projectId: number, keyId: number | undefined) {
  if (keyId) {
    const [row] = await db
      .select()
      .from(saasApiKeys)
      .where(and(eq(saasApiKeys.id, keyId), eq(saasApiKeys.projectId, projectId)))
      .limit(1);

    if (!row) {
      fatal(`API key ${keyId} not found for project ${projectId}.`);
    }

    return row;
  }

  const now = new Date();
  const [active] = await db
    .select()
    .from(saasApiKeys)
    .where(
      and(
        eq(saasApiKeys.projectId, projectId),
        isNull(saasApiKeys.revokedAt),
        isNull(saasApiKeys.rotatedToApiKeyId),
        gt(saasApiKeys.expiresAt, now),
      ),
    )
    .orderBy(desc(saasApiKeys.createdAt))
    .limit(1);

  if (active) {
    return active;
  }

  const [fallback] = await db
    .select()
    .from(saasApiKeys)
    .where(eq(saasApiKeys.projectId, projectId))
    .orderBy(desc(saasApiKeys.createdAt))
    .limit(1);

  if (!fallback) {
    fatal(`Project ${projectId} has no API keys.`);
  }

  return fallback;
}

function formatApiKeyMode(row: ApiKeyRow) {
  const now = Date.now();

  if (row.revokedAt) {
    return 'revoked';
  }
  if (row.expiresAt.getTime() <= now) {
    return 'expired';
  }
  if (row.rotatedToApiKeyId) {
    return 'rotation_overlap';
  }
  return 'active';
}

async function runSaasStatus(argv: string[]) {
  const args = parseArgs(argv);
  const projectId = getFlagInteger(args, 'project-id');
  if (!projectId) {
    fatal('Provide --project-id <id>.');
  }

  const keyId = getFlagInteger(args, 'key-id');
  const limit = getFlagInteger(args, 'limit') ?? 10;
  const project = await resolveProjectState(projectId);
  const selectedKey = await resolveTargetApiKey(projectId, keyId);
  const rows = await db
    .select()
    .from(saasApiKeys)
    .where(eq(saasApiKeys.projectId, projectId))
    .orderBy(desc(saasApiKeys.createdAt))
    .limit(limit);

  console.log(`Project ${project.id} (${project.environment})`);
  console.log(`  tenant : ${project.tenantName} (#${project.tenantId})`);
  console.log(`  project: ${project.name} [${project.slug}] status=${project.status}`);
  console.log(`  target : key#${selectedKey.id} ${selectedKey.keyPrefix} mode=${formatApiKeyMode(selectedKey)}`);
  console.log('');
  console.log('Recent API keys');

  for (const row of rows) {
    const marker = row.id === selectedKey.id ? '*' : ' ';
    console.log(
      `${marker} id=${row.id} prefix=${row.keyPrefix} mode=${formatApiKeyMode(row)} expires=${row.expiresAt.toISOString()} rotated_to=${row.rotatedToApiKeyId ?? '-'} rotated_from=${row.rotatedFromApiKeyId ?? '-'} last_used=${row.lastUsedAt?.toISOString() ?? '-'}`,
    );
  }
}

function resolveScopes(args: ReturnType<typeof parseArgs>) {
  const raw = getFlagString(args, 'scopes')?.trim() ?? '';
  if (!raw) {
    return undefined;
  }

  const scopes = raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes.length > 0 ? scopes : undefined;
}

async function runSaasRotate(argv: string[]) {
  const args = parseArgs(argv);
  const projectId = getFlagInteger(args, 'project-id');
  if (!projectId) {
    fatal('Provide --project-id <id>.');
  }

  const keyId = getFlagInteger(args, 'key-id');
  const adminId = getFlagInteger(args, 'admin-id') ?? null;
  const targetKey = await resolveTargetApiKey(projectId, keyId);
  const overlapSeconds = getFlagInteger(args, 'overlap-seconds');
  const label = getFlagString(args, 'label')?.trim();
  const expiresAt = getFlagString(args, 'expires-at')?.trim();
  const reason = getFlagString(args, 'reason')?.trim() ?? null;
  const scopes = resolveScopes(args);

  const rotation = await rotateProjectApiKey(
    projectId,
    targetKey.id,
    {
      ...(label ? { label } : {}),
      ...(typeof overlapSeconds === 'number' ? { overlapSeconds } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(reason ? { reason } : {}),
      ...(scopes ? { scopes } : {}),
    },
    adminId,
  );

  console.log('SaaS API key rotated.');
  console.log(`  project        : ${projectId}`);
  console.log(`  previous key   : #${rotation.previousKey.id} ${rotation.previousKey.keyPrefix}`);
  console.log(`  new key        : #${rotation.issuedKey.id} ${rotation.issuedKey.keyPrefix}`);
  console.log(`  overlap ends   : ${new Date(rotation.overlapEndsAt).toISOString()}`);
  console.log(`  reason         : ${rotation.reason ?? '-'}`);
  console.log('');
  console.log('Copy the fresh secret now. It will not be shown again by the system.');
  console.log(rotation.issuedKey.apiKey);
}

async function resolvePlainCurrentKey(args: ReturnType<typeof parseArgs>) {
  const inlineValue = getFlagString(args, 'current-key')?.trim();
  if (inlineValue) {
    return inlineValue;
  }

  const filePath = getFlagString(args, 'current-key-file')?.trim();
  if (filePath) {
    return (await readFile(filePath, 'utf8')).trim();
  }

  fatal('Provide --current-key or --current-key-file for SaaS drill verification.');
}

async function probeApiKey(apiKey: string) {
  try {
    const auth = await authenticateProjectApiKey(apiKey);
    return {
      ok: true,
      projectId: auth.projectId,
      keyId: auth.apiKeyId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runSaasDrill(argv: string[]) {
  const args = parseArgs(argv);
  const projectId = getFlagInteger(args, 'project-id');
  if (!projectId) {
    fatal('Provide --project-id <id>.');
  }

  const overlapSeconds = getFlagInteger(args, 'overlap-seconds') ?? 300;
  const keyId = getFlagInteger(args, 'key-id');
  const adminId = getFlagInteger(args, 'admin-id') ?? null;
  const currentPlainKey = await resolvePlainCurrentKey(args);
  const targetKey = await resolveTargetApiKey(projectId, keyId);
  const reason =
    getFlagString(args, 'reason')?.trim() || 'quarterly-secret-rotation-drill';

  const rotation = await rotateProjectApiKey(
    projectId,
    targetKey.id,
    {
      overlapSeconds,
      reason,
    },
    adminId,
  );

  console.log('SaaS drill started.');
  console.log(`  project        : ${projectId}`);
  console.log(`  previous key   : #${rotation.previousKey.id} ${rotation.previousKey.keyPrefix}`);
  console.log(`  new key        : #${rotation.issuedKey.id} ${rotation.issuedKey.keyPrefix}`);
  console.log(`  overlap ends   : ${new Date(rotation.overlapEndsAt).toISOString()}`);
  console.log(`  current fp     : ${secretFingerprint(currentPlainKey)}`);
  console.log(`  fresh key fp   : ${secretFingerprint(rotation.issuedKey.apiKey)}`);
  console.log('');
  console.log('Fresh key (store it in the canary secret manager now):');
  console.log(rotation.issuedKey.apiKey);
  console.log('');

  const oldBefore = await probeApiKey(currentPlainKey);
  const newBefore = await probeApiKey(rotation.issuedKey.apiKey);
  if (!oldBefore.ok || !newBefore.ok) {
    fatal(
      `Overlap verification failed before expiry. old=${oldBefore.ok ? 'ok' : oldBefore.error} new=${newBefore.ok ? 'ok' : newBefore.error}`,
    );
  }

  console.log('overlap: old key accepted');
  console.log('overlap: new key accepted');

  const waitMs = Math.max(
    new Date(rotation.overlapEndsAt).getTime() - Date.now() + 1_000,
    1_000,
  );
  console.log(`waiting ${waitMs}ms for predecessor expiry...`);
  await sleep(waitMs);

  const oldAfter = await probeApiKey(currentPlainKey);
  const newAfter = await probeApiKey(rotation.issuedKey.apiKey);
  if (oldAfter.ok) {
    fatal('Old SaaS key still authenticates after overlap expiry.');
  }
  if (!newAfter.ok) {
    fatal(`New SaaS key failed after overlap expiry: ${newAfter.error}`);
  }

  console.log('post-overlap: old key rejected');
  console.log('post-overlap: new key accepted');
}

async function runSaasCli(argv: string[]) {
  const args = parseArgs(argv);
  const command = (args.positionals[0] || 'status').trim();

  if (command === 'status') {
    await runSaasStatus(argv);
    return;
  }

  if (command === 'rotate') {
    await runSaasRotate(argv);
    return;
  }

  if (command === 'drill') {
    await runSaasDrill(argv);
    return;
  }

  fatal(`Unknown saas command: ${command}`);
}

async function main() {
  await primeOpsEnvironment();

  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const [domain, ...rest] = args.positionals;

  if (getFlagBoolean(args, 'help') || !domain || domain === 'help') {
    printUsage();
    return;
  }

  if (domain === 'jwt') {
    const jwtCommand = (rest[0] || 'status').trim();
    if (jwtCommand === 'smoke') {
      await runJwtSmoke(argv.slice(1));
      return;
    }

    await runRotateJwtCli(argv.slice(1));
    return;
  }

  if (domain === 'saas') {
    await runSaasCli(argv.slice(1));
    return;
  }

  if (domain === 'status' || domain === 'stage' || domain === 'finalize' || domain === 'smoke') {
    if (domain === 'smoke') {
      await runJwtSmoke(argv);
      return;
    }

    await runRotateJwtCli(argv);
    return;
  }

  fatal(`Unknown domain: ${domain}`);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await resetDb();
  });
