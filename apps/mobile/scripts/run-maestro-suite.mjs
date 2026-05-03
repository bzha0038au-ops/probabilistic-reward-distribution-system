#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const androidSdkRoot = resolveAndroidSdkPath();
const adbCommand = resolveAdbCommand(androidSdkRoot);

const flows = [
  {
    name: "holdem",
    script: "e2e:maestro:holdem",
    prepare: true,
  },
  {
    name: "prediction-market",
    script: "e2e:maestro:prediction-market",
    prepare: true,
  },
  {
    name: "notifications",
    script: "e2e:maestro:notifications",
    prepare: false,
  },
];

const MAESTRO_RETRY_LIMIT = 2;
const studioProcess = startMaestroStudioWarmup();

try {
  for (const flow of flows) {
    if (flow.prepare) {
      run(pnpmCommand, ["e2e:prepare"], { cwd: appDir });
    }

    runWithRetry(
      flow.name,
      pnpmCommand,
      [flow.script],
      {
        cwd: appDir,
      },
    );
  }
} finally {
  stopMaestroStudioWarmup(studioProcess);
}

function startMaestroStudioWarmup() {
  const shell = process.env.SHELL || "/bin/sh";
  const studio = spawn(shell, ["-lc", "printf '1\\n' | maestro studio --no-window"], {
    cwd: appDir,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });

  studio.unref();
  waitForPort(9999, 15_000);
  return studio;
}

function stopMaestroStudioWarmup(studio) {
  if (!studio?.pid || process.platform === "win32") {
    return;
  }

  try {
    process.kill(-studio.pid, "SIGTERM");
  } catch {
    // Ignore cleanup errors; the next suite run will start a fresh warmup process.
  }
}

function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const result = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}`], {
      cwd: appDir,
      env: process.env,
      stdio: "ignore",
    });

    if (result.status === 0) {
      return;
    }
    sleep(500);
  }

  fail(`Timed out waiting for Maestro Studio on localhost:${port}.`);
}

function resetMaestroDriver() {
  for (const packageName of ["dev.mobile.maestro", "dev.mobile.maestro.test"]) {
    runOptional(adbCommand, ["shell", "am", "force-stop", packageName], {
      cwd: appDir,
    });
  }

  runOptional(adbCommand, ["wait-for-device"], {
    cwd: appDir,
  });

  const readyAt = Date.now() + 1000;
  while (Date.now() < readyAt) {
    // Give Maestro's adb transport a brief window to settle before retrying.
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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
