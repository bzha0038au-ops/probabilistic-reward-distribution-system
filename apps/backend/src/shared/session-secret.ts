import { jwtVerify } from "jose";

import { internalInvariantError } from "./errors";

const encoder = new TextEncoder();

type SessionKind = "admin" | "user";

const SESSION_SECRET_ENV_NAMES: Record<
  SessionKind,
  { current: string; previous: string }
> = {
  admin: {
    current: "ADMIN_JWT_SECRET",
    previous: "ADMIN_JWT_SECRET_PREVIOUS",
  },
  user: {
    current: "USER_JWT_SECRET",
    previous: "USER_JWT_SECRET_PREVIOUS",
  },
};

const readSecret = (name: string) => (process.env[name] ?? "").trim();
const getSessionSecretEnvNames = (kind: SessionKind) => SESSION_SECRET_ENV_NAMES[kind];
const getRequiredSessionSecret = (kind: SessionKind) => {
  const { current } = getSessionSecretEnvNames(kind);
  const secret = readSecret(current);

  if (!secret) {
    throw internalInvariantError(
      `${current} is not set (required for ${kind} sessions).`,
    );
  }

  return secret;
};
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
    throw internalInvariantError(
      `${payload.candidateName} must not match ${payload.compareName}.`,
    );
  }
};

export function getSessionSecret(kind: SessionKind) {
  return encoder.encode(getRequiredSessionSecret(kind));
}

export function getSessionVerificationSecrets(kind: SessionKind) {
  const { previous } = getSessionSecretEnvNames(kind);
  const currentSecret = getRequiredSessionSecret(kind);
  const previousSecret = readSecret(previous);
  const secrets = [currentSecret];

  if (previousSecret && previousSecret !== currentSecret) {
    secrets.push(previousSecret);
  }

  return secrets.map((secret) => encoder.encode(secret));
}

export async function verifySessionJwt(token: string, kind: SessionKind) {
  let lastError: unknown;

  for (const secret of getSessionVerificationSecrets(kind)) {
    try {
      return await jwtVerify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? internalInvariantError(`Unable to verify ${kind} session JWT.`);
}

export function validateSessionSecrets() {
  const adminSecret = readSecret("ADMIN_JWT_SECRET");
  const adminPreviousSecret = readSecret("ADMIN_JWT_SECRET_PREVIOUS");
  const userSecret = readSecret("USER_JWT_SECRET");
  const userPreviousSecret = readSecret("USER_JWT_SECRET_PREVIOUS");
  const webSecret = readSecret("AUTH_SECRET") || readSecret("NEXTAUTH_SECRET");
  const adminMfaSecret = readSecret("ADMIN_MFA_ENCRYPTION_SECRET");
  const adminMfaBreakGlassSecret = readSecret("ADMIN_MFA_BREAK_GLASS_SECRET");
  const activeSessionSecrets = [
    { name: "ADMIN_JWT_SECRET", value: adminSecret },
    {
      name: "ADMIN_JWT_SECRET_PREVIOUS",
      value: adminPreviousSecret,
    },
    { name: "USER_JWT_SECRET", value: userSecret },
    {
      name: "USER_JWT_SECRET_PREVIOUS",
      value: userPreviousSecret,
    },
  ].filter((secret) => secret.value);

  if (!adminSecret || !userSecret) {
    throw internalInvariantError("ADMIN_JWT_SECRET and USER_JWT_SECRET must be set.");
  }

  for (let index = 0; index < activeSessionSecrets.length; index += 1) {
    const candidate = activeSessionSecrets[index];
    for (
      let compareIndex = index + 1;
      compareIndex < activeSessionSecrets.length;
      compareIndex += 1
    ) {
      const compareTo = activeSessionSecrets[compareIndex];
      assertDistinct({
        candidate: candidate.value,
        candidateName: candidate.name,
        compareTo: compareTo.value,
        compareName: compareTo.name,
      });
    }

    assertDistinct({
      candidate: webSecret,
      candidateName: "AUTH_SECRET",
      compareTo: candidate.value,
      compareName: candidate.name,
    });
    assertDistinct({
      candidate: adminMfaSecret,
      candidateName: "ADMIN_MFA_ENCRYPTION_SECRET",
      compareTo: candidate.value,
      compareName: candidate.name,
    });
    assertDistinct({
      candidate: adminMfaBreakGlassSecret,
      candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
      compareTo: candidate.value,
      compareName: candidate.name,
    });
  }
  assertDistinct({
    candidate: adminMfaBreakGlassSecret,
    candidateName: "ADMIN_MFA_BREAK_GLASS_SECRET",
    compareTo: adminMfaSecret,
    compareName: "ADMIN_MFA_ENCRYPTION_SECRET",
  });

  if (process.env.NODE_ENV === "production") {
    if (activeSessionSecrets.some((secret) => secret.value.length < 32)) {
      throw internalInvariantError(
        "JWT secrets must be at least 32 characters in production.",
      );
    }
    if (!adminMfaSecret) {
      throw internalInvariantError(
        "ADMIN_MFA_ENCRYPTION_SECRET must be set in production and must not reuse JWT secrets.",
      );
    }
    if (adminMfaSecret.length < 32) {
      throw internalInvariantError(
        "ADMIN_MFA_ENCRYPTION_SECRET must be at least 32 characters in production.",
      );
    }
    if (!adminMfaBreakGlassSecret) {
      throw internalInvariantError(
        "ADMIN_MFA_BREAK_GLASS_SECRET must be set in production.",
      );
    }
    if (adminMfaBreakGlassSecret.length < 32) {
      throw internalInvariantError(
        "ADMIN_MFA_BREAK_GLASS_SECRET must be at least 32 characters in production.",
      );
    }
  }
}
