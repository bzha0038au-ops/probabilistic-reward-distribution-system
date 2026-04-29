import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const IAP_PENDING_STORAGE_KEY = "reward.mobile.iap-pending-purchase";

export type PendingIapPurchaseContext = {
  sku: string;
  idempotencyKey: string;
  deliveryType: "voucher" | "gift_pack";
  recipientUserId: number | null;
  storedAt: number;
};

const readBrowserStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(IAP_PENDING_STORAGE_KEY);
};

const writeBrowserStorage = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(IAP_PENDING_STORAGE_KEY, value);
};

const clearBrowserStorage = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(IAP_PENDING_STORAGE_KEY);
};

const readStoredValue = async () => {
  if (Platform.OS === "web") {
    return readBrowserStorage();
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(IAP_PENDING_STORAGE_KEY);
};

const writeStoredValue = async (value: string) => {
  if (Platform.OS === "web") {
    writeBrowserStorage(value);
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.setItemAsync(IAP_PENDING_STORAGE_KEY, value);
};

const clearStoredValue = async () => {
  if (Platform.OS === "web") {
    clearBrowserStorage();
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(IAP_PENDING_STORAGE_KEY);
};

export async function readPendingIapPurchaseContext() {
  try {
    const raw = await readStoredValue();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingIapPurchaseContext> | null;
    if (
      !parsed ||
      typeof parsed.sku !== "string" ||
      typeof parsed.idempotencyKey !== "string" ||
      (parsed.deliveryType !== "voucher" && parsed.deliveryType !== "gift_pack") ||
      typeof parsed.storedAt !== "number"
    ) {
      await clearStoredValue();
      return null;
    }

    return {
      sku: parsed.sku,
      idempotencyKey: parsed.idempotencyKey,
      deliveryType: parsed.deliveryType,
      recipientUserId:
        typeof parsed.recipientUserId === "number" ? parsed.recipientUserId : null,
      storedAt: parsed.storedAt,
    } satisfies PendingIapPurchaseContext;
  } catch {
    await clearStoredValue();
    return null;
  }
}

export async function writePendingIapPurchaseContext(
  payload: Omit<PendingIapPurchaseContext, "storedAt">,
) {
  await writeStoredValue(
    JSON.stringify({
      ...payload,
      storedAt: Date.now(),
    } satisfies PendingIapPurchaseContext),
  );
}

export async function clearPendingIapPurchaseContext() {
  await clearStoredValue();
}
