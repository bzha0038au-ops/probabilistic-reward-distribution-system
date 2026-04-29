import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  fatal,
  getFlagInteger,
  getFlagString,
  parseArgs,
  primeOpsEnvironment,
  projectRoot,
} from "./_shared";

type DeployEnvironment = "staging" | "production";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type EvidenceSummary = {
  ageDays: number;
  filePath: string;
  recordedAtUtc: string;
};

const DEFAULT_RESTORE_DRILL_MAX_AGE_DAYS = 45;
const DEFAULT_SECRET_ROTATION_MAX_AGE_DAYS = 90;
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const COMMON_ENV_REQUIREMENTS = [
  {
    key: "DEPLOY_HOST",
    description: "Deployment SSH host",
  },
  {
    key: "DEPLOY_USER",
    description: "Deployment SSH user",
  },
  {
    key: "DEPLOY_PATH",
    description: "Deployment root path",
  },
  {
    key: "BACKUP_ALERT_WEBHOOK_URL",
    description: "Backup failure alert webhook",
    kind: "url" as const,
  },
  {
    key: "BACKUP_ENCRYPTION_PASSPHRASE",
    description: "Backup encryption passphrase",
  },
  {
    key: "OFFSITE_STORAGE_URI",
    description: "Offsite backup destination",
  },
  {
    key: "BACKUP_ARCHIVE_S3_URI",
    description: "Readable logical backup archive prefix",
  },
  {
    key: "DEPLOY_TG_BOT_TOKEN",
    description: "Telegram bot token for deploy and ops notifications",
  },
  {
    key: "DEPLOY_TG_PAGE_CHAT_ID",
    description: "Telegram page chat id",
  },
  {
    key: "DEPLOY_TG_DIGEST_CHAT_ID",
    description: "Telegram digest chat id",
  },
  {
    key: "PRIMARY_ONCALL",
    description: "Primary on-call owner",
  },
  {
    key: "SECONDARY_ONCALL",
    description: "Secondary on-call owner",
  },
  {
    key: "BACKUP_OWNER",
    description: "Backup owner",
  },
  {
    key: "RESTORE_APPROVER",
    description: "Restore approver",
  },
  {
    key: "RELEASE_APPROVER",
    description: "Release approver",
  },
  {
    key: "POSTGRES_PITR_ENABLED",
    description: "PITR enable flag",
    kind: "true" as const,
  },
  {
    key: "POSTGRES_PITR_STRATEGY",
    description: "PITR strategy description",
  },
  {
    key: "POSTGRES_PITR_RPO_MINUTES",
    description: "Target PITR RPO in minutes",
    kind: "positive-int" as const,
  },
  {
    key: "POSTGRES_WAL_ARCHIVE_ENABLED",
    description: "WAL archive enable flag",
    kind: "true" as const,
  },
  {
    key: "POSTGRES_WAL_ARCHIVE_URI",
    description: "WAL archive destination",
  },
  {
    key: "HOST_HARDENING_LAST_REVIEW_UTC",
    description: "Latest host-hardening review timestamp",
    kind: "date" as const,
  },
  {
    key: "HOST_PATCH_WINDOW",
    description: "Host patch window / cadence",
  },
  {
    key: "NODE_EXPORTER_JOB",
    description: "node_exporter scrape job",
  },
  {
    key: "POSTGRES_EXPORTER_JOB",
    description: "PostgreSQL exporter scrape job",
  },
  {
    key: "REDIS_EXPORTER_JOB",
    description: "Redis exporter scrape job",
  },
];

const PRODUCTION_ONLY_ENV_REQUIREMENTS = [
  {
    key: "WAF_CDN_PROVIDER",
    description: "Production WAF / CDN provider",
  },
  {
    key: "WAF_CDN_DASHBOARD_URL",
    description: "Production WAF / CDN dashboard URL",
    kind: "url" as const,
  },
  {
    key: "ADMIN_EDGE_ACCESS_POLICY",
    description: "Admin edge access policy identifier",
  },
];

const REQUIRED_ALERT_NAMES = [
  "RewardBackendNotReady",
  "RewardBackend5xxRateHigh",
  "RewardBackendDrawErrorRateHigh",
  "RewardBackendWithdrawalsStuck",
  "RewardBackendPostgresDependencyDown",
  "RewardBackendRedisDependencyDown",
  "RewardPostgresDataVolumeUsage85",
  "RewardRedisMemoryUsage85",
  "RewardHostFilesystemUsage85",
  "RewardHostFilesystemReadOnly",
  "RewardHostInodeUsage85",
];

const REQUIRED_FILES = [
  "deploy/monitoring/prometheus-alerts.yml",
  "deploy/monitoring/alertmanager-routing.example.yml",
  "docs/deployment-checklist.md",
  "docs/operations/alert-routing.md",
  "docs/operations/backup-and-restore.md",
  "docs/operations/host-hardening.md",
  "docs/operations/on-call-runbook.md",
  "docs/operations/on-call-schedule.md",
  "docs/operations/secret-rotation.md",
];

function printUsage() {
  console.log(`Usage: pnpm ops:release-gate --environment staging|production

Validates that external production-control dependencies are wired into the
repository and current environment before a deploy is allowed to proceed.

Options:
  --environment staging|production
  --restore-max-age-days <n>          Default: ${String(
    DEFAULT_RESTORE_DRILL_MAX_AGE_DAYS,
  )}
  --secret-max-age-days <n>           Default: ${String(
    DEFAULT_SECRET_ROTATION_MAX_AGE_DAYS,
  )}
`);
}

function resolveEnvironment(value: string | undefined): DeployEnvironment {
  if (value === "staging" || value === "production") {
    return value;
  }

  fatal("Release gate requires --environment staging|production.");
}

function readEnvValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

function isTruthy(value: string) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isPositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizeTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}T00:00:00Z`;
  }

  return trimmed;
}

function parseTimestamp(value: string) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return {
    iso: new Date(timestamp).toISOString(),
    timestamp,
  };
}

function parseAlertNames(fileContents: string) {
  const names = new Set<string>();

  for (const match of fileContents.matchAll(/^\s*-\s*alert:\s*([A-Za-z0-9_]+)/gm)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }

  return names;
}

async function readEvidenceSummary(payload: {
  directoryPath: string;
  filePrefix: string;
  maxAgeDays: number;
  fieldCandidates: string[];
}): Promise<EvidenceSummary> {
  const directoryEntries = await readdir(payload.directoryPath, {
    withFileTypes: true,
  });
  const candidates = directoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(payload.filePrefix) &&
        entry.name.endsWith(".summary.json"),
    )
    .map((entry) => path.join(payload.directoryPath, entry.name));

  if (candidates.length === 0) {
    throw new Error(
      `No evidence summaries found for prefix ${payload.filePrefix} in ${payload.directoryPath}.`,
    );
  }

  let latestSummary: EvidenceSummary | null = null;

  for (const filePath of candidates) {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<
      string,
      unknown
    >;

    const recordedAt =
      payload.fieldCandidates
        .map((field) => parsed[field])
        .find((value): value is string => typeof value === "string" && value.trim() !== "") ??
      "";

    const resolved = parseTimestamp(recordedAt);
    if (!resolved) {
      continue;
    }

    const ageDays = Math.floor((Date.now() - resolved.timestamp) / 86_400_000);
    const summary = {
      ageDays,
      filePath,
      recordedAtUtc: resolved.iso,
    };

    if (!latestSummary) {
      latestSummary = summary;
      continue;
    }

    if (resolved.timestamp > Date.parse(latestSummary.recordedAtUtc)) {
      latestSummary = summary;
    }
  }

  if (!latestSummary) {
    throw new Error(
      `Evidence summaries under ${payload.directoryPath} do not expose any supported timestamp fields (${payload.fieldCandidates.join(", ")}).`,
    );
  }

  if (latestSummary.ageDays > payload.maxAgeDays) {
    throw new Error(
      `${path.basename(latestSummary.filePath)} is ${String(
        latestSummary.ageDays,
      )} days old (max ${String(payload.maxAgeDays)}).`,
    );
  }

  return latestSummary;
}

function runEnvChecks(environment: DeployEnvironment) {
  const results: CheckResult[] = [];
  const requirements = [
    ...COMMON_ENV_REQUIREMENTS,
    ...(environment === "production"
      ? PRODUCTION_ONLY_ENV_REQUIREMENTS
      : []),
  ];

  for (const requirement of requirements) {
    const value = readEnvValue(requirement.key);

    if (!value) {
      results.push({
        name: `env:${requirement.key}`,
        ok: false,
        detail: `${requirement.description} is missing.`,
      });
      continue;
    }

    if (requirement.kind === "true" && !isTruthy(value)) {
      results.push({
        name: `env:${requirement.key}`,
        ok: false,
        detail: `${requirement.description} must be a truthy flag, got "${value}".`,
      });
      continue;
    }

    if (requirement.kind === "positive-int" && !isPositiveInteger(value)) {
      results.push({
        name: `env:${requirement.key}`,
        ok: false,
        detail: `${requirement.description} must be a positive integer, got "${value}".`,
      });
      continue;
    }

    if (requirement.kind === "url") {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
      } catch {
        results.push({
          name: `env:${requirement.key}`,
          ok: false,
          detail: `${requirement.description} must be a valid URL, got "${value}".`,
        });
        continue;
      }
    }

    if (requirement.kind === "date" && !parseTimestamp(value)) {
      results.push({
        name: `env:${requirement.key}`,
        ok: false,
        detail: `${requirement.description} must be an ISO-8601 timestamp or YYYY-MM-DD date, got "${value}".`,
      });
      continue;
    }

    results.push({
      name: `env:${requirement.key}`,
      ok: true,
      detail: `${requirement.description} is set.`,
    });
  }

  return results;
}

async function runRepositoryChecks(payload: {
  restoreMaxAgeDays: number;
  secretMaxAgeDays: number;
}) {
  const results: CheckResult[] = [];

  for (const relativeFilePath of REQUIRED_FILES) {
    const absoluteFilePath = path.join(projectRoot, relativeFilePath);

    try {
      await readFile(absoluteFilePath, "utf8");
      results.push({
        name: `file:${relativeFilePath}`,
        ok: true,
        detail: "Found required file.",
      });
    } catch {
      results.push({
        name: `file:${relativeFilePath}`,
        ok: false,
        detail: "Missing required file.",
      });
    }
  }

  const alertsFilePath = path.join(
    projectRoot,
    "deploy/monitoring/prometheus-alerts.yml",
  );
  const alertNames = parseAlertNames(await readFile(alertsFilePath, "utf8"));
  const missingAlerts = REQUIRED_ALERT_NAMES.filter((name) => !alertNames.has(name));
  results.push({
    name: "alerts:required-rules",
    ok: missingAlerts.length === 0,
    detail:
      missingAlerts.length === 0
        ? `All required alert rules are present (${REQUIRED_ALERT_NAMES.length}).`
        : `Missing alert rules: ${missingAlerts.join(", ")}.`,
  });

  const onCallSchedulePath = path.join(
    projectRoot,
    "docs/operations/on-call-schedule.md",
  );
  const onCallSchedule = await readFile(onCallSchedulePath, "utf8");
  results.push({
    name: "docs:on-call-schedule",
    ok: !onCallSchedule.includes("update on rotation"),
    detail: onCallSchedule.includes("update on rotation")
      ? "On-call schedule still contains placeholder roster entries."
      : "On-call schedule does not contain placeholder roster entries.",
  });

  const evidenceDirectoryPath = path.join(projectRoot, "docs/operations/evidence");

  try {
    const restoreSummary = await readEvidenceSummary({
      directoryPath: evidenceDirectoryPath,
      filePrefix: "restore-drill-",
      maxAgeDays: payload.restoreMaxAgeDays,
      fieldCandidates: ["finished_at_utc", "started_at_utc", "local_date"],
    });
    results.push({
      name: "evidence:restore-drill",
      ok: true,
      detail: `${path.basename(restoreSummary.filePath)} recorded at ${restoreSummary.recordedAtUtc} (${String(
        restoreSummary.ageDays,
      )} days old).`,
    });
  } catch (error) {
    results.push({
      name: "evidence:restore-drill",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const secretRotationSummary = await readEvidenceSummary({
      directoryPath: evidenceDirectoryPath,
      filePrefix: "secret-rotation-",
      maxAgeDays: payload.secretMaxAgeDays,
      fieldCandidates: [
        "completed_at_utc",
        "finished_at_utc",
        "performed_at_utc",
        "date",
      ],
    });
    results.push({
      name: "evidence:secret-rotation",
      ok: true,
      detail: `${path.basename(secretRotationSummary.filePath)} recorded at ${secretRotationSummary.recordedAtUtc} (${String(
        secretRotationSummary.ageDays,
      )} days old).`,
    });
  } catch (error) {
    results.push({
      name: "evidence:secret-rotation",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}

function printResults(environment: DeployEnvironment, results: CheckResult[]) {
  const failures = results.filter((result) => !result.ok);
  console.log(`Release gate environment=${environment}`);
  console.log(`Checks: ${String(results.length)} total, ${String(failures.length)} failed`);

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} ${result.detail}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

async function main() {
  await primeOpsEnvironment();

  const args = parseArgs(process.argv.slice(2));
  if (getFlagString(args, "help") || args.flags.get("help") === true) {
    printUsage();
    return;
  }

  const environment = resolveEnvironment(getFlagString(args, "environment"));
  const restoreMaxAgeDays =
    getFlagInteger(args, "restore-max-age-days") ??
    DEFAULT_RESTORE_DRILL_MAX_AGE_DAYS;
  const secretMaxAgeDays =
    getFlagInteger(args, "secret-max-age-days") ??
    DEFAULT_SECRET_ROTATION_MAX_AGE_DAYS;

  const [envChecks, repositoryChecks] = await Promise.all([
    Promise.resolve(runEnvChecks(environment)),
    runRepositoryChecks({
      restoreMaxAgeDays,
      secretMaxAgeDays,
    }),
  ]);

  printResults(environment, [...envChecks, ...repositoryChecks]);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
