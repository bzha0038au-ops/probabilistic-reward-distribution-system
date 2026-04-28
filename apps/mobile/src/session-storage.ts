import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { UserSessionResponse } from "@reward/shared-types/auth";

const USER_SESSION_STORAGE_KEY = "reward.mobile.user-session";

type StoredUserSession = UserSessionResponse & {
  storedAt: number;
};

const readBrowserStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(USER_SESSION_STORAGE_KEY);
};

const writeBrowserStorage = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_SESSION_STORAGE_KEY, value);
};

const clearBrowserStorage = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
};

const readStoredValue = async () => {
  if (Platform.OS === "web") {
    return readBrowserStorage();
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(USER_SESSION_STORAGE_KEY);
};

const writeStoredValue = async (value: string) => {
  if (Platform.OS === "web") {
    writeBrowserStorage(value);
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.setItemAsync(USER_SESSION_STORAGE_KEY, value);
};

const clearStoredValue = async () => {
  if (Platform.OS === "web") {
    clearBrowserStorage();
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(USER_SESSION_STORAGE_KEY);
};

export async function readStoredUserSession() {
  try {
    const raw = await readStoredValue();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredUserSession> | null;
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.user?.id !== "number" ||
      typeof parsed.user.email !== "string" ||
      (parsed.user.role !== "user" && parsed.user.role !== "admin")
    ) {
      await clearStoredValue();
      return null;
    }

    const storedUser = {
      id: parsed.user.id,
      email: parsed.user.email,
      role: parsed.user.role,
      emailVerifiedAt:
        typeof parsed.user.emailVerifiedAt === "string"
          ? parsed.user.emailVerifiedAt
          : null,
      phoneVerifiedAt:
        typeof parsed.user.phoneVerifiedAt === "string"
          ? parsed.user.phoneVerifiedAt
          : null,
    } satisfies UserSessionResponse["user"];
    const storedLegal =
      parsed.legal &&
      typeof parsed.legal === "object" &&
      typeof parsed.legal.requiresAcceptance === "boolean" &&
      Array.isArray(parsed.legal.items)
        ? {
            requiresAcceptance: parsed.legal.requiresAcceptance,
            items: parsed.legal.items
              .map((item) => {
                if (
                  typeof item !== "object" ||
                  item === null ||
                  typeof item.id !== "number" ||
                  typeof item.slug !== "string" ||
                  typeof item.version !== "string" ||
                  typeof item.effectiveAt !== "string" ||
                  typeof item.accepted !== "boolean"
                ) {
                  return null;
                }

                return {
                  id: item.id,
                  slug: item.slug,
                  version: item.version,
                  effectiveAt: item.effectiveAt,
                  accepted: item.accepted,
                  acceptedAt:
                    typeof item.acceptedAt === "string" ? item.acceptedAt : null,
                };
              })
              .filter(
                (
                  item,
                ): item is NonNullable<
                  UserSessionResponse["legal"]
                >["items"][number] => item !== null,
              ),
          }
        : undefined;

    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      sessionId:
        typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      user: storedUser,
      legal: storedLegal,
    } satisfies UserSessionResponse;
  } catch {
    await clearStoredValue();
    return null;
  }
}

export async function writeStoredUserSession(session: UserSessionResponse) {
  const stored: StoredUserSession = {
    ...session,
    storedAt: Date.now(),
  };

  await writeStoredValue(JSON.stringify(stored));
}

export async function clearStoredUserSession() {
  await clearStoredValue();
}
