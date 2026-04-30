#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const maestroCommand = process.platform === "win32" ? "maestro.bat" : "maestro";
const appId = process.env.REWARD_MOBILE_APP_ID || "com.anonymous.rewardmobile";
const androidSdkRoot = resolveAndroidSdkPath();
const adbCommand = resolveAdbCommand(androidSdkRoot);

const flows = [
  {
    name: "holdem",
    file: "./e2e/maestro/holdem.yaml",
    prepare: true,
  },
  {
    name: "prediction-market",
    file: "./e2e/maestro/prediction-market.yaml",
    prepare: true,
  },
  {
    name: "notifications",
    file: "./e2e/maestro/notifications.yaml",
    prepare: false,
  },
];

const MAESTRO_RETRY_LIMIT = 2;

for (const flow of flows) {
  if (flow.prepare) {
    run(pnpmCommand, ["e2e:prepare"], { cwd: appDir });
  }

  resetMaestroDriver();
  runWithRetry(
    flow.name,
    maestroCommand,
    ["test", "-e", `REWARD_MOBILE_APP_ID=${appId}`, flow.file],
    {
      cwd: appDir,
    },
  );
}

function resetMaestroDriver() {
  for (const packageName of ["dev.mobile.maestro", "dev.mobile.maestro.test"]) {
    runOptional(adbCommand, ["shell", "am", "force-stop", packageName], {
      cwd: appDir,
    });
  }
}

function resolveAndroidSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  const sdkPath = candidates.find((candidate) => existsSync(candidate));
  if (!sdkPath) {
    fail("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT before running Maestro e2e.");
  }

  return sdkPath;
}

function resolveAdbCommand(androidSdkRoot) {
  const adbName = process.platform === "win32" ? "adb.exe" : "adb";
  const adbFromSdk = path.join(androidSdkRoot, "platform-tools", adbName);
  return existsSync(adbFromSdk) ? adbFromSdk : adbName;
}

function run(command, args, options = {}) {
  printCommand(command, args, options.cwd);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || appDir,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runWithRetry(name, command, args, options = {}) {
  for (let attempt = 1; attempt <= MAESTRO_RETRY_LIMIT; attempt += 1) {
    if (attempt > 1) {
      console.warn(`Retrying Maestro flow "${name}" (${attempt}/${MAESTRO_RETRY_LIMIT})...`);
      resetMaestroDriver();
    }

    printCommand(command, args, options.cwd);
    const result = spawnSync(command, args, {
      stdio: "inherit",
      cwd: options.cwd || appDir,
      env: process.env,
    });

    if (result.status === 0) {
      return;
    }
  }

  process.exit(1);
}

function runOptional(command, args, options = {}) {
  printCommand(command, args, options.cwd);
  spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || appDir,
    env: process.env,
  });
}

function printCommand(command, args, cwd) {
  const location = cwd ? ` (${cwd})` : "";
  console.log(`\n> ${command} ${args.join(" ")}${location}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
