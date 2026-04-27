#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const androidDir = path.join(appDir, "android");
const configPath = path.join(appDir, "app.json");

if (process.argv.includes("--help")) {
  console.log(`Android dev-build regression flow

Usage:
  pnpm --dir apps/mobile android:regression

What it does:
  1. Generates android/ with Expo prebuild when needed
  2. Builds the debug APK
  3. Installs it on the first connected Android device or emulator
  4. Reverses Metro port 8081
  5. Launches the Expo dev client deep link

Optional env:
  REWARD_ANDROID_DEV_SERVER_HOST   Defaults to 10.0.2.2
  REWARD_ANDROID_DEV_SERVER_PORT   Defaults to 8081
`);
  process.exit(0);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const packageName = config.expo?.android?.package;
const scheme = config.expo?.scheme;

if (!packageName) {
  fail(`Missing expo.android.package in ${configPath}`);
}

if (!scheme) {
  fail(`Missing expo.scheme in ${configPath}`);
}

const androidSdkPath = resolveAndroidSdkPath();
const adbCommand = resolveAdbCommand(androidSdkPath);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const gradleWrapper = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const devServerHost = process.env.REWARD_ANDROID_DEV_SERVER_HOST || "10.0.2.2";
const devServerPort = process.env.REWARD_ANDROID_DEV_SERVER_PORT || "8081";
const androidEnv = {
  ...process.env,
  ANDROID_HOME: androidSdkPath,
  ANDROID_SDK_ROOT: androidSdkPath
};

ensureAndroidProject();

const deviceSerial = getFirstDeviceSerial();
console.log(`Using Android device: ${deviceSerial}`);

run(gradleWrapper, ["app:assembleDebug", "--console=plain"], {
  cwd: androidDir,
  env: androidEnv
});

if (!existsSync(apkPath)) {
  fail(`Debug APK was not created at ${apkPath}`);
}

run(adbCommand, ["-s", deviceSerial, "install", "-r", apkPath]);
runOptional(adbCommand, ["-s", deviceSerial, "reverse", `tcp:${devServerPort}`, `tcp:${devServerPort}`]);

const devClientUrl = `${scheme}://expo-development-client/?url=${encodeURIComponent(`http://${devServerHost}:${devServerPort}`)}`;
run(adbCommand, [
  "-s",
  deviceSerial,
  "shell",
  "am",
  "start",
  "-W",
  "-a",
  "android.intent.action.VIEW",
  "-d",
  devClientUrl,
  packageName
]);

console.log("");
console.log("Android dev build is installed and launched.");
console.log("If Metro is running, use the in-app 'Use seeded user' button to run the reward-center regression path.");

function ensureAndroidProject() {
  if (existsSync(androidDir)) {
    return;
  }

  console.log("android/ is missing; generating the native Android project with Expo prebuild.");
  run(pnpmCommand, ["exec", "expo", "prebuild", "--platform", "android"], {
    cwd: appDir,
    env: androidEnv
  });
}

function getFirstDeviceSerial() {
  const output = capture(adbCommand, ["devices"]);
  const devices = output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);

  if (devices.length === 0) {
    fail("No Android device detected. Boot an emulator or connect a device, then try again.");
  }

  return devices[0];
}

function resolveAndroidSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk")
  ].filter(Boolean);

  const sdkPath = candidates.find((candidate) => existsSync(candidate));
  if (!sdkPath) {
    fail("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT before running this script.");
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
    env: options.env || process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runOptional(command, args, options = {}) {
  printCommand(command, args, options.cwd);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || appDir,
    env: options.env || process.env
  });

  if (result.status !== 0) {
    console.warn("Optional step failed; continuing.");
  }
}

function capture(command, args, options = {}) {
  printCommand(command, args, options.cwd);
  const result = spawnSync(command, args, {
    cwd: options.cwd || appDir,
    env: options.env || process.env,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout || "";
}

function printCommand(command, args, cwd) {
  const location = cwd ? ` (${cwd})` : "";
  console.log(`\n> ${command} ${args.join(" ")}${location}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
