#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const evidenceDir = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "docs/operations/evidence"),
);
const outputFile = path.resolve(
  process.argv[3] ?? path.join(repoRoot, "docs/operations/dr-drills.md"),
);
const freshnessThresholdDays = 45;

function formatDuration(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds < 0) {
    return "unknown";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(" ");
}

function toUtcDateLabel(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function maybeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferOverallStatus(summary) {
  if (typeof summary.overall_status === "string" && summary.overall_status.length > 0) {
    return summary.overall_status;
  }

  const statuses = [
    summary.restore_status,
    summary.post_restore_checks,
    summary.finance_sanity,
    summary.write_probe,
  ].filter((value) => typeof value === "string" && value.length > 0);

  return statuses.every((value) => value === "passed") ? "passed" : "unknown";
}

function resolveEstimatedRpo(summary) {
  const explicitRpo =
    maybeNumber(summary.estimated_rpo_seconds) ?? maybeNumber(summary.actual_rpo_seconds);
  if (explicitRpo !== null) {
    return explicitRpo;
  }

  if (
    typeof summary.backup_created_at_utc !== "string" ||
    typeof summary.started_at_utc !== "string"
  ) {
    return null;
  }

  const backupCreatedAt = new Date(summary.backup_created_at_utc);
  const startedAt = new Date(summary.started_at_utc);

  if (Number.isNaN(backupCreatedAt.getTime()) || Number.isNaN(startedAt.getTime())) {
    return null;
  }

  const deltaSeconds = Math.floor((startedAt.getTime() - backupCreatedAt.getTime()) / 1000);
  return deltaSeconds >= 0 ? deltaSeconds : 0;
}

function resolveActualRto(summary) {
  return (
    maybeNumber(summary.actual_rto_seconds) ?? maybeNumber(summary.total_duration_seconds)
  );
}

function relativeLink(fromFile, toFile) {
  return path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join("/");
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function loadRecords() {
  const evidenceNames = await fs.readdir(evidenceDir);
  const summaryNames = evidenceNames
    .filter((name) => name.endsWith(".summary.json"))
    .sort((left, right) => left.localeCompare(right));

  const records = [];

  for (const summaryName of summaryNames) {
    const summaryPath = path.join(evidenceDir, summaryName);
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    const reportName = summaryName.replace(/\.summary\.json$/, ".md");
    const reportPath = path.join(evidenceDir, reportName);
    const summaryLink = relativeLink(outputFile, summaryPath);
    const reportLink = relativeLink(outputFile, reportPath);

    records.push({
      summaryName,
      startedAtUtc: typeof summary.started_at_utc === "string" ? summary.started_at_utc : "",
      finishedAtUtc: typeof summary.finished_at_utc === "string" ? summary.finished_at_utc : "",
      backupCreatedAtUtc:
        typeof summary.backup_created_at_utc === "string" ? summary.backup_created_at_utc : "",
      environment:
        typeof summary.drill_environment === "string" && summary.drill_environment.length > 0
          ? summary.drill_environment
          : "unknown",
      result: inferOverallStatus(summary),
      estimatedRpoSeconds: resolveEstimatedRpo(summary),
      actualRtoSeconds: resolveActualRto(summary),
      reportExists: await fileExists(reportPath),
      reportLink,
      summaryLink,
    });
  }

  records.sort((left, right) => right.startedAtUtc.localeCompare(left.startedAtUtc));
  return records;
}

async function buildLedger() {
  const records = await loadRecords();
  const successfulRecords = records.filter((record) => record.result === "passed");
  const latestSuccessfulRecord = successfulRecords[0];

  const lines = [
    "# DR Drills",
    "",
    "This ledger tracks the monthly staging full-database restore drills. The source of truth stays in `docs/operations/evidence/`, and this file is rebuilt from the committed `*.summary.json` outputs.",
    "",
    `- Successful full restore drills on record: ${successfulRecords.length}`,
    `- Latest successful drill (UTC): ${
      latestSuccessfulRecord ? latestSuccessfulRecord.startedAtUtc : "none recorded"
    }`,
    `- Freshness gate: page if the newest committed drill evidence is older than ${freshnessThresholdDays} days`,
    "- Metric definition: estimated RPO is backup age at restore start; actual RTO is restore plus validation wall-clock time.",
    "",
  ];

  if (records.length === 0) {
    lines.push("No restore drill evidence has been committed yet.");
  } else {
    lines.push("| Drill date (UTC) | Environment | Backup created (UTC) | Estimated RPO | Actual RTO | Result | Evidence |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");

    for (const record of records) {
      const reportCell = record.reportExists
        ? `[report](${record.reportLink})`
        : "report missing";
      const summaryCell = `[summary](${record.summaryLink})`;
      lines.push(
        `| ${toUtcDateLabel(record.startedAtUtc)} | ${record.environment} | ${
          record.backupCreatedAtUtc || "unknown"
        } | ${formatDuration(record.estimatedRpoSeconds)} | ${formatDuration(
          record.actualRtoSeconds,
        )} | ${record.result} | ${reportCell} / ${summaryCell} |`,
      );
    }
  }

  lines.push("");

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`${outputFile}\n`);
}

await buildLedger();
