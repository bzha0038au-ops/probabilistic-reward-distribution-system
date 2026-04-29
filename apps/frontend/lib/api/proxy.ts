import { USER_API_ROUTES } from "@reward/user-core";

export const BFF_BASE_PATH = "/api/backend";

type AllowedRoute = {
  auth: boolean;
  methods: readonly string[];
  pattern: RegExp;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactRoute = (
  path: string,
  methods: readonly string[],
  auth: boolean,
): AllowedRoute => ({
  pattern: new RegExp(`^${escapeRegExp(path)}$`),
  methods,
  auth,
});

const childRoute = (
  basePath: string,
  suffixPattern: string,
  methods: readonly string[],
  auth: boolean,
): AllowedRoute => ({
  pattern: new RegExp(`^${escapeRegExp(basePath)}${suffixPattern}$`),
  methods,
  auth,
});

const ALLOWED_BROWSER_ROUTES: readonly AllowedRoute[] = [
  exactRoute(USER_API_ROUTES.fairnessCommit, ["GET"], false),
  exactRoute(USER_API_ROUTES.fairnessReveal, ["GET"], false),
  exactRoute(USER_API_ROUTES.auth.session, ["GET", "DELETE"], true),
  exactRoute(USER_API_ROUTES.auth.realtimeToken, ["GET"], true),
  exactRoute(USER_API_ROUTES.auth.sessions, ["GET"], true),
  exactRoute(USER_API_ROUTES.auth.sessionsRevokeAll, ["POST"], true),
  childRoute(USER_API_ROUTES.auth.sessions, "/[^/]+", ["DELETE"], true),
  exactRoute(USER_API_ROUTES.auth.emailVerificationRequest, ["POST"], true),
  exactRoute(USER_API_ROUTES.auth.phoneVerificationRequest, ["POST"], true),
  exactRoute(USER_API_ROUTES.auth.phoneVerificationConfirm, ["POST"], true),
  exactRoute(USER_API_ROUTES.communityThreads, ["GET", "POST"], true),
  childRoute(USER_API_ROUTES.communityThreads, "/\\d+", ["GET"], true),
  childRoute(USER_API_ROUTES.communityThreads, "/\\d+/posts", ["POST"], true),
  exactRoute(USER_API_ROUTES.wallet, ["GET"], true),
  exactRoute(USER_API_ROUTES.economyLedger, ["GET"], true),
  exactRoute(USER_API_ROUTES.giftEnergy, ["GET"], true),
  exactRoute(USER_API_ROUTES.gifts, ["GET", "POST"], true),
  exactRoute(USER_API_ROUTES.iapProducts, ["GET"], true),
  exactRoute(USER_API_ROUTES.iapPurchasesVerify, ["POST"], true),
  exactRoute(USER_API_ROUTES.giftPackCatalog, ["GET"], true),
  exactRoute(USER_API_ROUTES.giftPackPurchaseComplete, ["POST"], true),
  exactRoute(USER_API_ROUTES.transactions, ["GET"], true),
  exactRoute(USER_API_ROUTES.notifications, ["GET"], true),
  exactRoute(USER_API_ROUTES.notificationSummary, ["GET"], true),
  childRoute(USER_API_ROUTES.notifications, "/\\d+/read", ["POST"], true),
  childRoute(USER_API_ROUTES.notifications, "/read-all", ["POST"], true),
  exactRoute(USER_API_ROUTES.notificationPreferences, ["GET", "PATCH"], true),
  childRoute(USER_API_ROUTES.experiments, "/[^/]+/variant", ["GET"], true),
  exactRoute(USER_API_ROUTES.kycProfile, ["GET", "POST"], true),
  childRoute(USER_API_ROUTES.handHistory, "/[^/]+", ["GET"], true),
  childRoute(
    USER_API_ROUTES.handHistory,
    "/[^/]+/evidence-bundle",
    ["GET"],
    true,
  ),
  exactRoute(USER_API_ROUTES.rewardCenter, ["GET"], true),
  exactRoute(USER_API_ROUTES.rewardClaim, ["POST"], true),
  exactRoute(USER_API_ROUTES.markets, ["GET"], true),
  exactRoute(USER_API_ROUTES.marketPortfolio, ["GET"], true),
  exactRoute(USER_API_ROUTES.marketHistory, ["GET"], true),
  childRoute(USER_API_ROUTES.markets, "/\\d+", ["GET"], true),
  childRoute(USER_API_ROUTES.markets, "/\\d+/positions", ["POST"], true),
  childRoute(
    USER_API_ROUTES.markets,
    "/\\d+/positions/\\d+/sell",
    ["POST"],
    true,
  ),
  childRoute(USER_API_ROUTES.playModes, "/[^/]+", ["GET", "POST"], true),
  exactRoute(USER_API_ROUTES.holdemTables, ["GET", "POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+", ["GET"], true),
  childRoute(
    USER_API_ROUTES.holdemTables,
    "/\\d+/messages",
    ["GET", "POST"],
    true,
  ),
  exactRoute(USER_API_ROUTES.holdemRealtimeObservations, ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/join", ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/leave", ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/presence", ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/start", ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/seat-mode", ["POST"], true),
  childRoute(USER_API_ROUTES.holdemTables, "/\\d+/action", ["POST"], true),
  exactRoute(USER_API_ROUTES.blackjack, ["GET"], true),
  exactRoute(USER_API_ROUTES.blackjackStart, ["POST"], true),
  childRoute(USER_API_ROUTES.blackjack, "/\\d+/action", ["POST"], true),
  exactRoute(USER_API_ROUTES.drawCatalog, ["GET"], true),
  exactRoute(USER_API_ROUTES.drawOverview, ["GET"], true),
  exactRoute(USER_API_ROUTES.quickEight, ["POST"], true),
  exactRoute(USER_API_ROUTES.draw, ["POST"], true),
  exactRoute(USER_API_ROUTES.drawPlay, ["POST"], true),
  exactRoute(USER_API_ROUTES.bankCards, ["GET", "POST"], true),
  childRoute(USER_API_ROUTES.bankCards, "/\\d+/default", ["PATCH"], true),
  exactRoute(USER_API_ROUTES.cryptoDepositChannels, ["GET"], true),
  exactRoute(USER_API_ROUTES.cryptoDeposits, ["POST"], true),
  exactRoute(USER_API_ROUTES.cryptoWithdrawAddresses, ["GET", "POST"], true),
  childRoute(
    USER_API_ROUTES.cryptoWithdrawAddresses,
    "/\\d+/default",
    ["PATCH"],
    true,
  ),
  exactRoute(USER_API_ROUTES.topUps, ["GET", "POST"], true),
  exactRoute(USER_API_ROUTES.withdrawals, ["GET", "POST"], true),
  exactRoute(USER_API_ROUTES.cryptoWithdrawals, ["POST"], true),
] as const;

export const normalizeBackendPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/{2,}/g, "/");
};

export const buildBrowserBackendUrl = (path: string) =>
  `${BFF_BASE_PATH}${normalizeBackendPath(path)}`;

export const resolveBackendProxyRoute = (method: string, path: string) => {
  const normalizedPath = normalizeBackendPath(path);
  const matchedRoute = ALLOWED_BROWSER_ROUTES.find(({ pattern }) =>
    pattern.test(normalizedPath),
  );

  if (!matchedRoute) {
    return {
      matched: false as const,
      normalizedPath,
    };
  }

  return {
    matched: true as const,
    normalizedPath,
    requiresAuth: matchedRoute.auth,
    methods: matchedRoute.methods,
    methodAllowed: matchedRoute.methods.includes(method.toUpperCase()),
  };
};
