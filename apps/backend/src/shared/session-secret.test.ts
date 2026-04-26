import { afterEach, describe, expect, it } from "vitest";

import { validateSessionSecrets } from "./session-secret";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("validateSessionSecrets", () => {
  it("allows local fallback when the dedicated admin MFA secret is unset outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_JWT_SECRET = "admin-secret-1234567890";
    process.env.USER_JWT_SECRET = "user-secret-1234567890";
    delete process.env.ADMIN_MFA_ENCRYPTION_SECRET;
    delete process.env.ADMIN_MFA_BREAK_GLASS_SECRET;

    expect(() => validateSessionSecrets()).not.toThrow();
  });

  it("rejects a production config that reuses or omits the dedicated MFA secret", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_JWT_SECRET = "a".repeat(32);
    process.env.USER_JWT_SECRET = "b".repeat(32);
    process.env.ADMIN_MFA_ENCRYPTION_SECRET = "";
    process.env.ADMIN_MFA_BREAK_GLASS_SECRET = "c".repeat(32);

    expect(() => validateSessionSecrets()).toThrow(
      "ADMIN_MFA_ENCRYPTION_SECRET must be set in production",
    );

    process.env.ADMIN_MFA_ENCRYPTION_SECRET = process.env.ADMIN_JWT_SECRET;
    expect(() => validateSessionSecrets()).toThrow(
      "ADMIN_MFA_ENCRYPTION_SECRET must not match ADMIN_JWT_SECRET.",
    );
  });

  it("requires a dedicated production break-glass secret", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_JWT_SECRET = "a".repeat(32);
    process.env.USER_JWT_SECRET = "b".repeat(32);
    process.env.ADMIN_MFA_ENCRYPTION_SECRET = "c".repeat(32);
    delete process.env.ADMIN_MFA_BREAK_GLASS_SECRET;

    expect(() => validateSessionSecrets()).toThrow(
      "ADMIN_MFA_BREAK_GLASS_SECRET must be set in production.",
    );
  });
});
