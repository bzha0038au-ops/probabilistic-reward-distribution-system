const encoder = new TextEncoder();

type SessionKind = "admin" | "user";

const readSecret = (name: string) => (process.env[name] ?? "").trim();
const assertDistinct = (payload: {
  candidate: string;
  candidateName: string;
  compareTo: string;
  compareName: string;
}) => {
  if (
    payload.candidate &&
    payload.compareTo &&
    payload.candidate === payload.compareTo
  ) {
    throw new Error(
      `${payload.candidateName} must not match ${payload.compareName}.`,
    );
  }
};

export function getSessionSecret(kind: SessionKind) {
  const secret =
    kind === "admin"
      ? readSecret("ADMIN_JWT_SECRET")
      : readSecret("USER_JWT_SECRET");

  if (!secret) {
    throw new Error(
      `${kind.toUpperCase()}_JWT_SECRET is not set (required for ${kind} sessions).`,
    );
  }

  return encoder.encode(secret);
}

export function validateSessionSecrets() {
  const adminSecret = readSecret("ADMIN_JWT_SECRET");
  const userSecret = readSecret("USER_JWT_SECRET");
  const webSecret = readSecret("AUTH_SECRET") || readSecret("NEXTAUTH_SECRET");
  const adminMfaSecret = readSecret("ADMIN_MFA_ENCRYPTION_SECRET");
  const adminMfaBreakGlassSecret = readSecret("ADMIN_MFA_BREAK_GLASS_SECRET");

  if (!adminSecret || !userSecret) {
    throw new Error("ADMIN_JWT_SECRET and USER_JWT_SECRET must be set.");
  }

  assertDistinct({
    candidate: adminSecret,
    candidateName: "ADMIN_JWT_SECRET",
    compareTo: userSecret,
    compareName: "USER_JWT_SECRET",
  });
  assertDistinct({
    candidate: webSecret,
    candidateName: "AUTH_SECRET",
    compareTo: adminSecret,
    compareName: "ADMIN_JWT_SECRET",
  });
  assertDistinct({
    candidate: webSecret,
    candidateName: "AUTH_SECRET",
    compareTo: userSecret,
    compareName: "USER_JWT_SECRET",
  });
  assertDistinct({
    candidate: adminMfaSecret,
    candidateName: "ADMIN_MFA_ENCRYPTION_SECRET",
    compareTo: adminSecret,
    compareName: "ADMIN_JWT_SECRET",
  });
  assertDistinct({
    candidate: adminMfaSecret,
    candidateName: "ADMIN_MFA_ENCRYPTION_SECRET",
    compareTo: userSecret,
    compareName: "USER_JWT_SECRET",
  });
  assertDistinct({
    candidate: adminMfaSecret,
    candidateName: "ADMIN_MFA_ENCRYPTION_SECRET",
    compareTo: webSecret,
    compareName: "AUTH_SECRET",
  });
  assertDistinct({
    candidate: adminMfaBreakGlassSecret,
    candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
    compareTo: adminSecret,
    compareName: "ADMIN_JWT_SECRET",
  });
  assertDistinct({
    candidate: adminMfaBreakGlassSecret,
    candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
    compareTo: userSecret,
    compareName: "USER_JWT_SECRET",
  });
  assertDistinct({
    candidate: adminMfaBreakGlassSecret,
    candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
    compareTo: webSecret,
    compareName: "AUTH_SECRET",
  });
  assertDistinct({
    candidate: adminMfaBreakGlassSecret,
    candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
    compareTo: adminMfaSecret,
    compareName: "ADMIN_MFA_ENCRYPTION_SECRET",
  });

  if (process.env.NODE_ENV === "production") {
    if (adminSecret.length < 32 || userSecret.length < 32) {
      throw new Error(
        "JWT secrets must be at least 32 characters in production.",
      );
    }
    if (!adminMfaSecret) {
      throw new Error(
        "ADMIN_MFA_ENCRYPTION_SECRET must be set in production and must not reuse JWT secrets.",
      );
    }
    if (adminMfaSecret.length < 32) {
      throw new Error(
        "ADMIN_MFA_ENCRYPTION_SECRET must be at least 32 characters in production.",
      );
    }
    if (!adminMfaBreakGlassSecret) {
      throw new Error(
        "ADMIN_MFA_BREAK_GLASS_SECRET must be set in production.",
      );
    }
    if (adminMfaBreakGlassSecret.length < 32) {
      throw new Error(
        "ADMIN_MFA_BREAK_GLASS_SECRET must be at least 32 characters in production.",
      );
    }
  }
}
