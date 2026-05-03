const TIKTOK_MINIS_SDK_URL = "https://connect.tiktok-minis.com/drama/sdk.js";

export interface MenuButtonLayout {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LoginResult {
  code?: string | null;
}

interface TikTokAsyncOptions<T> {
  success?: (result: T) => void;
  fail?: (error: unknown) => void;
  complete?: () => void;
}

interface AuthorizeOptions extends TikTokAsyncOptions<LoginResult> {
  scope: string;
}

interface NavigationBarColorOptions {
  frontColor: "#ffffff" | "#000000";
  backgroundColor: string;
}

interface TikTokMinisSDK {
  init(params: { clientKey: string }): void;
  login(options: TikTokAsyncOptions<LoginResult>): void;
  authorize(options: AuthorizeOptions): void;
  canIUse?(feature: string): boolean;
  setNavigationBarColor?(
    options: NavigationBarColorOptions,
    callback?: (result: { is_success?: boolean }) => void,
  ): void;
  getMenuButtonBoundingClientRect?(): MenuButtonLayout;
}

declare global {
  interface Window {
    TTMinis?: TikTokMinisSDK;
  }
}

type InitializeResult =
  | { ok: true; sdk: TikTokMinisSDK }
  | { ok: false; reason: "missing-client-key" | "sdk-load-failed" | "init-failed"; message: string };

let initPromise: Promise<InitializeResult> | null = null;
let initializedClientKey: string | null = null;

export async function initializeTikTokMinis(clientKey: string): Promise<InitializeResult> {
  const normalizedClientKey = normalizeClientKey(clientKey);
  if (!normalizedClientKey) {
    return {
      ok: false,
      reason: "missing-client-key",
      message:
        "Set VITE_TIKTOK_CLIENT_KEY in .env.local and mirror the same value in minis.config.json > dev.clientKey.",
    };
  }

  if (initializedClientKey === normalizedClientKey && window.TTMinis) {
    return { ok: true, sdk: window.TTMinis };
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const sdk = await loadSdk();
    if (!sdk) {
      return {
        ok: false,
        reason: "sdk-load-failed",
        message: "TikTok Minis SDK did not load. Confirm the SDK script is present in index.html.",
      } satisfies InitializeResult;
    }

    try {
      sdk.init({ clientKey: normalizedClientKey });
      initializedClientKey = normalizedClientKey;
      return { ok: true, sdk } satisfies InitializeResult;
    } catch (error: unknown) {
      return {
        ok: false,
        reason: "init-failed",
        message: `TTMinis.init failed: ${formatError(error)}`,
      } satisfies InitializeResult;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function getTikTokMinis(): TikTokMinisSDK | null {
  return window.TTMinis ?? null;
}

function normalizeClientKey(rawValue: string): string {
  const value = rawValue.trim();
  return value && value !== "undefined" ? value : "";
}

async function loadSdk(): Promise<TikTokMinisSDK | null> {
  if (window.TTMinis) {
    return window.TTMinis;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TIKTOK_MINIS_SDK_URL}"]`,
  );

  if (existingScript) {
    return waitForSdk(existingScript);
  }

  const script = document.createElement("script");
  script.src = TIKTOK_MINIS_SDK_URL;
  document.head.append(script);
  return waitForSdk(script);
}

function waitForSdk(script: HTMLScriptElement): Promise<TikTokMinisSDK | null> {
  return new Promise((resolve) => {
    if (window.TTMinis) {
      resolve(window.TTMinis);
      return;
    }

    const finish = () => resolve(window.TTMinis ?? null);

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
