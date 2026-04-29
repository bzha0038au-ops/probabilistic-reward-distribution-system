"use client";

const DEVICE_FINGERPRINT_STORAGE_KEY = "reward.web.device-seed.v1";

const readSeed = () => window.localStorage.getItem(DEVICE_FINGERPRINT_STORAGE_KEY);

const createSeed = () => {
  const seed =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(DEVICE_FINGERPRINT_STORAGE_KEY, seed);
  return seed;
};

const getSeed = () => readSeed() ?? createSeed();

const encodeHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const fallbackHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};

const hashString = async (value: string) => {
  if (
    typeof crypto !== "undefined" &&
    crypto.subtle &&
    typeof TextEncoder !== "undefined"
  ) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return encodeHex(digest);
  }

  return fallbackHash(value);
};

export async function getBrowserDeviceFingerprint() {
  if (typeof window === "undefined") {
    return null;
  }

  const seed = getSeed();
  const fingerprintPayload = {
    version: 1,
    seed,
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio ?? 1,
    },
  };

  return hashString(JSON.stringify(fingerprintPayload));
}
