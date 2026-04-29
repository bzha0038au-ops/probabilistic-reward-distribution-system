export const PORTAL_HOME_PATH = "/portal";
export const PORTAL_LEGAL_PATH = "/legal";
export const PORTAL_LOGIN_PATH = "/login";

export const sanitizeLocalPath = (
  value: string | null | undefined,
  fallback = PORTAL_HOME_PATH,
) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
};

export const sanitizePortalReturnTo = (
  value: string | null | undefined,
  fallback = PORTAL_HOME_PATH,
) => {
  const sanitized = sanitizeLocalPath(value, fallback);
  if (
    sanitized === PORTAL_LEGAL_PATH ||
    sanitized.startsWith(`${PORTAL_LEGAL_PATH}?`) ||
    sanitized === PORTAL_LOGIN_PATH ||
    sanitized.startsWith(`${PORTAL_LOGIN_PATH}?`)
  ) {
    return fallback;
  }

  return sanitized;
};

export const buildLoginPath = (callbackUrl?: string | null) => {
  const sanitized = sanitizeLocalPath(callbackUrl, PORTAL_HOME_PATH);
  return `${PORTAL_LOGIN_PATH}?callbackUrl=${encodeURIComponent(sanitized)}`;
};

export const buildLegalPath = (returnTo?: string | null, error?: string | null) => {
  const params = new URLSearchParams();
  const sanitizedReturnTo = sanitizePortalReturnTo(returnTo, PORTAL_HOME_PATH);

  if (sanitizedReturnTo !== PORTAL_HOME_PATH) {
    params.set("returnTo", sanitizedReturnTo);
  }
  if (error) {
    params.set("error", error);
  }

  const query = params.toString();
  return query ? `${PORTAL_LEGAL_PATH}?${query}` : PORTAL_LEGAL_PATH;
};
