export const BFF_BASE_PATH = "/api/backend";

type AllowedRoute = {
  auth: boolean;
  methods: readonly string[];
  pattern: RegExp;
};

const ALLOWED_BROWSER_ROUTES: readonly AllowedRoute[] = [
  { pattern: /^\/portal\/saas\/overview$/, methods: ["GET"], auth: true },
  { pattern: /^\/portal\/saas\/tenants$/, methods: ["POST"], auth: true },
  {
    pattern: /^\/portal\/saas\/invites\/accept$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/reports\/exports$/,
    methods: ["GET", "POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/disputes$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/memberships$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/memberships\/\d+$/,
    methods: ["DELETE"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/invites$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/invites\/\d+\/revoke$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/projects\/\d+\/keys$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/projects\/\d+\/keys\/\d+\/rotate$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/projects\/\d+\/keys\/\d+\/revoke$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/projects\/\d+\/prizes$/,
    methods: ["GET", "POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/projects\/\d+\/prizes\/\d+$/,
    methods: ["PATCH", "DELETE"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/billing\/portal$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/billing\/setup-session$/,
    methods: ["POST"],
    auth: true,
  },
  {
    pattern: /^\/portal\/saas\/tenants\/\d+\/billing\/budget-policy$/,
    methods: ["PATCH"],
    auth: true,
  },
] as const;

export const normalizeBackendPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/{2,}/g, "/");
};

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
