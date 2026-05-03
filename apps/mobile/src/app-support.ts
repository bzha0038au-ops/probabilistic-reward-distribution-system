import { DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import { BLACKJACK_CONFIG } from "@reward/shared-types/blackjack";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import type {
  AuthSessionSummary,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import type { BlackjackGameStatus } from "@reward/shared-types/blackjack";
import type {
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
} from "@reward/shared-types/draw";
import type { QuickEightRound } from "@reward/shared-types/quick-eight";
import {
  resolveLocalApiBaseUrl,
  type SupportedUserPlatform,
} from "@reward/user-core";

import type { MobileAppRoute } from "./screens";
import { mobilePalette as palette } from "./theme";

export type ScreenMode =
  | "login"
  | "register"
  | "forgotPassword"
  | "resetPassword"
  | "verifyEmail"
  | "app";

export type AppRoute = MobileAppRoute;

export type AppStackParamList = {
  home: undefined;
  account: undefined;
  wallet: undefined;
  rewards: undefined;
  community: undefined;
  security: undefined;
  notifications: undefined;
  gacha: undefined;
  quickEight: undefined;
  predictionMarket: undefined;
  holdem: undefined;
  blackjack: undefined;
  fairness: undefined;
};

export type WebRoute =
  | "/"
  | "/login"
  | "/register"
  | "/app"
  | "/app/community"
  | "/app/verification"
  | "/app/slot"
  | "/app/gacha"
  | "/app/quick-eight"
  | "/app/holdem"
  | "/app/blackjack"
  | "/app/fairness";

type TimeoutHandle = ReturnType<typeof setTimeout>;

export const AppStack = createNativeStackNavigator<AppStackParamList>();
export const SESSION_RESTORE_TIMEOUT_MS = 8_000;

export const appNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.background,
    border: palette.border,
    card: palette.panel,
    primary: palette.accent,
    text: palette.text,
    notification: palette.accent,
  },
};

export const platform =
  Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";

const normalizeSimulatorLoopbackUrl = (value: string) => {
  if (platform === "ios") {
    return value.replace("://127.0.0.1", "://localhost");
  }

  if (platform === "android") {
    return value
      .replace("://127.0.0.1", "://10.0.2.2")
      .replace("://localhost", "://10.0.2.2");
  }

  return value;
};

const defaultApiBaseUrl = resolveLocalApiBaseUrl(
  platform as SupportedUserPlatform,
);

const defaultWebBaseUrl =
  platform === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

export const seededEmail =
  process.env.EXPO_PUBLIC_WEBVIEW_SEED_EMAIL?.trim() ||
  "mobile.e2e.alice@example.com";

export const seededPassword =
  process.env.EXPO_PUBLIC_WEBVIEW_SEED_PASSWORD?.trim() || "User123!";

export const configuredApiBaseUrl = normalizeSimulatorLoopbackUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || defaultApiBaseUrl,
);

export const configuredWebBaseUrl = normalizeSimulatorLoopbackUrl(
  process.env.EXPO_PUBLIC_WEBVIEW_BASE_URL?.trim() || defaultWebBaseUrl,
).replace(/\/+$/, "");

export const webviewQaEnabled = process.env.EXPO_PUBLIC_WEBVIEW_QA === "1";

export function buildWebUrl(path: WebRoute) {
  return `${configuredWebBaseUrl}${path === "/" ? "" : path}`;
}

export function getAutoLoginScript() {
  const email = JSON.stringify(seededEmail);
  const password = JSON.stringify(seededPassword);

  return `
    (function () {
      const emailInput = document.querySelector('input[name="email"]');
      const passwordInput = document.querySelector('input[name="password"]');
      const form = document.querySelector('form');

      if (!emailInput || !passwordInput || !form) {
        return true;
      }

      emailInput.focus();
      emailInput.value = ${email};
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));

      passwordInput.focus();
      passwordInput.value = ${password};
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

      form.requestSubmit();
      return true;
    })();
  `;
}

export function buildCurrentSessionFallback(
  session: UserSessionResponse,
): AuthSessionSummary {
  return {
    sessionId: session.sessionId ?? "unknown",
    kind: "user",
    role: session.user.role,
    ip: null,
    userAgent: null,
    createdAt: null,
    lastSeenAt: null,
    expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    current: true,
  };
}

export function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return "Unknown";
  }

  return timestamp.toLocaleString();
}

export function formatOptionalTimestamp(value: string | Date | null) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return null;
  }

  return timestamp.toLocaleString();
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeoutHandle: TimeoutHandle | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

export const drawRarityLabels: Record<DrawPrizeRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const drawStockLabels: Record<
  DrawPrizePresentation["stockState"],
  string
> = {
  available: "In stock",
  low: "Low stock",
  sold_out: "Sold out",
};

export const drawStatusLabels: Record<
  DrawPlayResponse["results"][number]["status"],
  string
> = {
  miss: "Miss",
  won: "Won",
  out_of_stock: "Sold out",
  budget_exhausted: "Budget capped",
  payout_limited: "Payout limited",
};

export const quickEightBoardNumbers = Array.from(
  { length: QUICK_EIGHT_CONFIG.boardSize },
  (_, index) => index + 1,
);

export const quickEightStatusLabels: Record<QuickEightRound["status"], string> =
  {
    lost: "Lost",
    won: "Won",
  };

export const blackjackStatusLabels: Record<BlackjackGameStatus, string> = {
  active: "Active",
  player_blackjack: "Blackjack",
  dealer_blackjack: "Dealer blackjack",
  player_bust: "Bust",
  dealer_bust: "Dealer bust",
  player_win: "Win",
  dealer_win: "Dealer win",
  push: "Push",
};

export function isQuickEightStakeValid(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return false;
  }

  return (
    numeric >= Number(QUICK_EIGHT_CONFIG.minStake) &&
    numeric <= Number(QUICK_EIGHT_CONFIG.maxStake)
  );
}

export function formatAmount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortenCommitHash(value: string) {
  return value.length > 16
    ? `${value.slice(0, 8)}...${value.slice(-6)}`
    : value;
}

export function getHighlightPrize(
  results: DrawPlayResponse["results"],
): DrawPrizePresentation | null {
  const ordered: DrawPrizeRarity[] = ["legendary", "epic", "rare", "common"];
  for (const rarity of ordered) {
    const match = results.find(
      (result) => result.prize?.displayRarity === rarity,
    );
    if (match?.prize) {
      return match.prize;
    }
  }

  return results.find((result) => result.prize)?.prize ?? null;
}

export function getHighlightDrawResult(
  results: DrawPlayResponse["results"],
): DrawPlayResponse["results"][number] | null {
  const ordered: DrawPrizeRarity[] = ["legendary", "epic", "rare", "common"];
  for (const rarity of ordered) {
    const match = results.find(
      (result) => result.prize?.displayRarity === rarity,
    );
    if (match) {
      return match;
    }
  }

  return results.find((result) => result.prize) ?? results[0] ?? null;
}

export function normalizeQuickEightNumbers(numbers: number[]) {
  return [...numbers].sort((left, right) => left - right);
}

export function summarizeUserAgent(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

export function isExplicitLinkInput(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("://") || trimmed.startsWith("http");
}
