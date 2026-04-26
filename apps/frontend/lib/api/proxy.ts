export const BFF_BASE_PATH = '/api/backend';

type AllowedRoute = {
  auth: boolean;
  methods: readonly string[];
  pattern: RegExp;
};

const ALLOWED_BROWSER_ROUTES: readonly AllowedRoute[] = [
  { pattern: /^\/stats$/, methods: ['GET'], auth: false },
  { pattern: /^\/fairness\/commit$/, methods: ['GET'], auth: false },
  { pattern: /^\/fairness\/reveal$/, methods: ['GET'], auth: false },
  { pattern: /^\/auth\/user\/session$/, methods: ['GET', 'DELETE'], auth: true },
  { pattern: /^\/auth\/user\/sessions$/, methods: ['GET'], auth: true },
  {
    pattern: /^\/auth\/user\/sessions\/revoke-all$/,
    methods: ['POST'],
    auth: true,
  },
  {
    pattern: /^\/auth\/user\/sessions\/[^/]+$/,
    methods: ['DELETE'],
    auth: true,
  },
  {
    pattern: /^\/auth\/email-verification\/request$/,
    methods: ['POST'],
    auth: true,
  },
  {
    pattern: /^\/auth\/phone-verification\/request$/,
    methods: ['POST'],
    auth: true,
  },
  {
    pattern: /^\/auth\/phone-verification\/confirm$/,
    methods: ['POST'],
    auth: true,
  },
  { pattern: /^\/wallet$/, methods: ['GET'], auth: true },
  { pattern: /^\/transactions$/, methods: ['GET'], auth: true },
  { pattern: /^\/draw$/, methods: ['POST'], auth: true },
  { pattern: /^\/bank-cards$/, methods: ['GET', 'POST'], auth: true },
  { pattern: /^\/bank-cards\/\d+\/default$/, methods: ['PATCH'], auth: true },
  { pattern: /^\/crypto-deposit-channels$/, methods: ['GET'], auth: true },
  { pattern: /^\/crypto-deposits$/, methods: ['POST'], auth: true },
  {
    pattern: /^\/crypto-withdraw-addresses$/,
    methods: ['GET', 'POST'],
    auth: true,
  },
  {
    pattern: /^\/crypto-withdraw-addresses\/\d+\/default$/,
    methods: ['PATCH'],
    auth: true,
  },
  { pattern: /^\/top-ups$/, methods: ['GET', 'POST'], auth: true },
  { pattern: /^\/withdrawals$/, methods: ['GET', 'POST'], auth: true },
] as const;

export const normalizeBackendPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return '/';
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/{2,}/g, '/');
};

export const buildBrowserBackendUrl = (path: string) =>
  `${BFF_BASE_PATH}${normalizeBackendPath(path)}`;

export const resolveBackendProxyRoute = (method: string, path: string) => {
  const normalizedPath = normalizeBackendPath(path);
  const matchedRoute = ALLOWED_BROWSER_ROUTES.find(({ pattern }) =>
    pattern.test(normalizedPath)
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
