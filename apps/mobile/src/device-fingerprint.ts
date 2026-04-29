import * as SecureStore from "expo-secure-store";
import { Dimensions, PixelRatio, Platform } from "react-native";

const DEVICE_FINGERPRINT_STORAGE_KEY = "reward.mobile.device-seed.v1";

const readBrowserSeed = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(DEVICE_FINGERPRINT_STORAGE_KEY);
};

const writeBrowserSeed = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DEVICE_FINGERPRINT_STORAGE_KEY, value);
};

const createSeed = () =>
  `${Platform.OS}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readSeed = async () => {
  if (Platform.OS === "web") {
    return readBrowserSeed();
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(DEVICE_FINGERPRINT_STORAGE_KEY);
};

const writeSeed = async (value: string) => {
  if (Platform.OS === "web") {
    writeBrowserSeed(value);
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.setItemAsync(DEVICE_FINGERPRINT_STORAGE_KEY, value);
};

const ensureSeed = async () => {
  const existing = await readSeed();
  if (existing) {
    return existing;
  }

  const created = createSeed();
  await writeSeed(created);
  return created;
};

const hashPart = (value: string, seed: number) => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};

const fallbackHash = (value: string) => {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map((seed) => hashPart(value, seed)).join("");
};

const readIsPad = () => {
  if (!("isPad" in Platform)) {
    return false;
  }

  return Platform.isPad ?? false;
};

export async function getMobileDeviceFingerprint() {
  const seed = await ensureSeed();
  const { width, height } = Dimensions.get("window");
  const payload = {
    version: 1,
    seed,
    platform: Platform.OS,
    isPad: readIsPad(),
    isTV: Platform.isTV ?? false,
    screen: {
      width,
      height,
      scale: PixelRatio.get(),
      fontScale: PixelRatio.getFontScale(),
    },
  };

  return fallbackHash(JSON.stringify(payload));
}
