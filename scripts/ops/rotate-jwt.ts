import { randomBytes } from 'node:crypto';

import {
  fatal,
  getFlagBoolean,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  readManagedSecretFile,
  removeManagedSecretFile,
  secretFingerprint,
  writeManagedSecretFile,
} from './_shared';

type Target = 'admin' | 'user';

type TargetConfig = {
  currentEnvFileKey: string;
  currentFallbackName: string;
  disallowedEnvKeys: string[];
  previousEnvFileKey: string;
  previousFallbackName: string;
  target: Target;
  ttlDefaultSeconds: number;
  ttlEnvKey: string;
};

const TARGET_CONFIG: Record<Target, TargetConfig> = {
  admin: {
    currentEnvFileKey: 'ADMIN_JWT_SECRET_FILE',
    currentFallbackName: 'admin_jwt_secret',
    disallowedEnvKeys: [
      'ADMIN_JWT_SECRET_PREVIOUS',
      'USER_JWT_SECRET',
      'USER_JWT_SECRET_PREVIOUS',
      'AUTH_SECRET',
      'ADMIN_MFA_ENCRYPTION_SECRET',
      'ADMIN_MFA_BREAK_GLASS_SECRET',
    ],
    previousEnvFileKey: 'ADMIN_JWT_SECRET_PREVIOUS_FILE',
    previousFallbackName: 'admin_jwt_secret_previous',
    target: 'admin',
    ttlDefaultSeconds: 60 * 60 * 2,
    ttlEnvKey: 'ADMIN_SESSION_TTL',
  },
  user: {
    currentEnvFileKey: 'USER_JWT_SECRET_FILE',
    currentFallbackName: 'user_jwt_secret',
    disallowedEnvKeys: [
      'USER_JWT_SECRET_PREVIOUS',
      'ADMIN_JWT_SECRET',
      'ADMIN_JWT_SECRET_PREVIOUS',
      'AUTH_SECRET',
      'ADMIN_MFA_ENCRYPTION_SECRET',
      'ADMIN_MFA_BREAK_GLASS_SECRET',
    ],
    previousEnvFileKey: 'USER_JWT_SECRET_PREVIOUS_FILE',
    previousFallbackName: 'user_jwt_secret_previous',
    target: 'user',
    ttlDefaultSeconds: 60 * 60 * 8,
    ttlEnvKey: 'USER_SESSION_TTL',
  },
};

function printUsage() {
  console.log(`Usage:
  pnpm ops:rotate-jwt status [--target admin|user]
  pnpm ops:rotate-jwt stage --target admin|user --value <secret> [--apply]
  pnpm ops:rotate-jwt stage --target admin|user --value-file /secure/path.txt [--apply]
  pnpm ops:rotate-jwt finalize --target admin|user [--apply]

This command uses the repo's existing *_PREVIOUS dual-secret verification path.
By default it prints a guided plan. Add --apply to actually rewrite or remove
the secret files.
`);
}

function resolveTarget(rawTarget: string | undefined): Target {
  if (rawTarget === 'admin' || rawTarget === 'user') {
    return rawTarget;
  }

  fatal('Rotation target must be admin or user. Pass --target admin or --target user.');
}

function formatSeconds(seconds: number) {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

async function readTargetState(target: Target) {
  const config = TARGET_CONFIG[target];
  const current = await readManagedSecretFile({
    envFileKey: config.currentEnvFileKey,
    fallbackName: config.currentFallbackName,
  });
  const previous = await readManagedSecretFile({
    envFileKey: config.previousEnvFileKey,
    fallbackName: config.previousFallbackName,
  });
  const ttlSeconds = Number.parseInt(process.env[config.ttlEnvKey] ?? '', 10) || config.ttlDefaultSeconds;

  return {
    config,
    current,
    previous,
    ttlSeconds,
  };
}

function renderSecretState(label: string, payload: { filePath: string; value: string }) {
  const fingerprint = payload.value ? secretFingerprint(payload.value) : 'missing';
  const pathLabel = payload.filePath || 'unresolved';
  return `${label}: ${fingerprint} (${pathLabel})`;
}

function getNewSecret(args: ReturnType<typeof parseArgs>) {
  const inlineValue = getFlagString(args, 'value')?.trim() || '';
  if (inlineValue) {
    return inlineValue;
  }

  const fileValue = getFlagString(args, 'value-file')?.trim() || '';
  if (fileValue) {
    return fileValue;
  }

  if (getFlagBoolean(args, 'generate')) {
    return randomBytes(48).toString('base64url');
  }

  return '';
}

async function resolveNewSecret(args: ReturnType<typeof parseArgs>) {
  const valueFile = getFlagString(args, 'value-file')?.trim() || '';
  if (!valueFile) {
    return getNewSecret(args);
  }

  const { readFile } = await import('node:fs/promises');
  return (await readFile(valueFile, 'utf8')).trim();
}

function validateNewSecret(target: Target, newSecret: string, state: Awaited<ReturnType<typeof readTargetState>>) {
  if (!newSecret) {
    fatal('Provide --value, --value-file, or --generate for the staged secret.');
  }

  if (newSecret.length < 32) {
    fatal('JWT secrets must be at least 32 characters.');
  }

  if (!state.current.value) {
    fatal(`Current ${target} JWT secret is missing. Refusing to stage rotation.`);
  }

  if (newSecret === state.current.value) {
    fatal('New secret matches the current live secret.');
  }

  for (const envKey of [state.config.currentEnvFileKey.replace(/_FILE$/, ''), ...state.config.disallowedEnvKeys]) {
    const candidate = process.env[envKey]?.trim() || '';
    if (candidate && candidate === newSecret) {
      fatal(`New secret must not match ${envKey}.`);
    }
  }
}

function printStatus(targets: Target[]) {
  return Promise.all(targets.map((target) => readTargetState(target))).then((states) => {
    for (const state of states) {
      console.log(`${state.config.target.toUpperCase()} JWT`);
      console.log(`  ${renderSecretState('current ', state.current)}`);
      console.log(`  ${renderSecretState('previous', state.previous)}`);
      console.log(`  drain window: ${state.ttlSeconds}s (${formatSeconds(state.ttlSeconds)})`);
      console.log(`  mode: ${state.previous.value ? 'rotation_staged' : 'steady'}`);
      console.log('');
    }
  });
}

async function stageRotation(args: ReturnType<typeof parseArgs>) {
  const target = resolveTarget(getFlagString(args, 'target'));
  const state = await readTargetState(target);
  const newSecret = await resolveNewSecret(args);
  validateNewSecret(target, newSecret, state);

  if (state.previous.value && state.previous.value !== state.current.value && !getFlagBoolean(args, 'force')) {
    fatal('A previous secret is already active. Finalize the current rotation first or re-run with --force.');
  }

  const plan = [
    `target=${target}`,
    `current file=${state.current.filePath || 'unresolved'}`,
    `previous file=${state.previous.filePath || 'unresolved'}`,
    `current fingerprint=${secretFingerprint(state.current.value)}`,
    `new fingerprint=${secretFingerprint(newSecret)}`,
    `drain window=${state.ttlSeconds}s (${formatSeconds(state.ttlSeconds)})`,
  ];

  if (!getFlagBoolean(args, 'apply')) {
    console.log('Stage plan');
    console.log(plan.map((line) => `  ${line}`).join('\n'));
    console.log('');
    console.log(`Re-run with --apply to write ${state.config.previousFallbackName} and rotate ${state.config.currentFallbackName}.`);
    console.log(`After deploy and validation, wait ${formatSeconds(state.ttlSeconds)} and run:`);
    console.log(`  pnpm ops:rotate-jwt finalize --target ${target} --apply`);
    return;
  }

  if (!state.current.filePath || !state.previous.filePath) {
    fatal('Unable to resolve writable secret file paths. Set the *_FILE vars or OPS_SECRETS_DIR.');
  }

  await writeManagedSecretFile(state.previous.filePath, state.current.value);
  await writeManagedSecretFile(state.current.filePath, newSecret);

  console.log(`Rotated ${target} JWT secret into dual-secret mode.`);
  console.log(`- previous: ${state.previous.filePath}`);
  console.log(`- current:  ${state.current.filePath}`);
  console.log(`Deploy now, validate login/write/readiness, wait ${formatSeconds(state.ttlSeconds)}, then finalize.`);
}

async function finalizeRotation(args: ReturnType<typeof parseArgs>) {
  const target = resolveTarget(getFlagString(args, 'target'));
  const state = await readTargetState(target);

  if (!state.previous.value) {
    console.log(`No ${target} previous secret is active. Nothing to finalize.`);
    return;
  }

  if (!getFlagBoolean(args, 'apply')) {
    console.log(`Finalize plan for ${target}`);
    console.log(`  remove: ${state.previous.filePath || state.config.previousFallbackName}`);
    console.log('Re-run with --apply after the full session TTL has elapsed and the rotated deploy is healthy.');
    return;
  }

  if (!state.previous.filePath) {
    fatal('Unable to resolve the previous-secret file path.');
  }

  await removeManagedSecretFile(state.previous.filePath);
  console.log(`Removed ${state.previous.filePath}. Deploy once more to drop the fallback verifier.`);
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagBoolean(args, 'help')) {
    printUsage();
    process.exit(0);
  }

  const command = (args.positionals[0] || 'status').trim();

  if (command === 'status') {
    const targetFlag = getFlagString(args, 'target');
    await printStatus(targetFlag ? [resolveTarget(targetFlag)] : ['admin', 'user']);
    process.exit(0);
  }

  if (command === 'stage') {
    await stageRotation(args);
    process.exit(0);
  }

  if (command === 'finalize') {
    await finalizeRotation(args);
    process.exit(0);
  }

  fatal(`Unknown command: ${command}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
