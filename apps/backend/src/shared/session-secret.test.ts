import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  getSessionSecret,
  validateSessionSecrets,
  verifySessionJwt,
} from "./session-secret";

const ORIGINAL_ENV = { ...process.env };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
  it("verifies current and previous session JWTs while keeping signing on the current secret", async () => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_JWT_SECRET = "admin-secret-current-1234567890";
    process.env.ADMIN_JWT_SECRET_PREVIOUS = "admin-secret-previous-1234567890";
    process.env.USER_JWT_SECRET = "user-secret-current-1234567890";
    process.env.USER_JWT_SECRET_PREVIOUS = "user-secret-previous-1234567890";

    const signToken = async (secret: string, subject: string) =>
      new SignJWT({ role: "user" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(encoder.encode(secret));

    expect(decoder.decode(getSessionSecret("user"))).toBe(
      process.env.USER_JWT_SECRET,
    );
    expect(decoder.decode(getSessionSecret("admin"))).toBe(
      process.env.ADMIN_JWT_SECRET,
    );

    await expect(
      verifySessionJwt(
        await signToken(process.env.USER_JWT_SECRET ?? "", "42"),
        "user",
      ),
    ).resolves.toMatchObject({
      payload: expect.objectContaining({ sub: "42" }),
    });

    await expect(
      verifySessionJwt(
        await signToken(process.env.USER_JWT_SECRET_PREVIOUS ?? "", "99"),
        "user",
      ),
    ).resolves.toMatchObject({
      payload: expect.objectContaining({ sub: "99" }),
    });

    await expect(
      verifySessionJwt(
        await signToken(process.env.ADMIN_JWT_SECRET_PREVIOUS ?? "", "7"),
        "admin",
      ),
    ).resolves.toMatchObject({
      payload: expect.objectContaining({ sub: "7" }),
    });
  });

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

  it("rejects reused current or previous JWT secrets", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_JWT_SECRET = "a".repeat(32);
    process.env.ADMIN_JWT_SECRET_PREVIOUS = "b".repeat(32);
    process.env.USER_JWT_SECRET = "c".repeat(32);
    process.env.USER_JWT_SECRET_PREVIOUS = "a".repeat(32);
    process.env.ADMIN_MFA_ENCRYPTION_SECRET = "d".repeat(32);
    process.env.ADMIN_MFA_BREAK_GLASS_SECRET = "e".repeat(32);

    expect(() => validateSessionSecrets()).toThrow(
      "ADMIN_JWT_SECRET must not match USER_JWT_SECRET_PREVIOUS.",
    );
  });
});
