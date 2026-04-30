import assert from "node:assert/strict";
import test from "node:test";

import {
  PORTAL_HOME_PATH,
  PORTAL_LEGAL_PATH,
  buildLegalPath,
  buildLoginPath,
  sanitizeLocalPath,
  sanitizePortalReturnTo,
} from "../lib/navigation";

test("sanitizeLocalPath only keeps local absolute paths", () => {
  assert.equal(
    sanitizeLocalPath("/portal/keys?project=7"),
    "/portal/keys?project=7",
  );
  assert.equal(sanitizeLocalPath("//evil.example/path", "/safe"), "/safe");
  assert.equal(
    sanitizeLocalPath("https://evil.example/path", "/safe"),
    "/safe",
  );
  assert.equal(sanitizeLocalPath("   ", "/safe"), "/safe");
});

test("sanitizePortalReturnTo blocks auth and legal loops", () => {
  assert.equal(sanitizePortalReturnTo("/portal/overview"), "/portal/overview");
  assert.equal(
    sanitizePortalReturnTo("/legal?returnTo=/portal/keys"),
    PORTAL_HOME_PATH,
  );
  assert.equal(
    sanitizePortalReturnTo("/login?callbackUrl=%2Fportal"),
    PORTAL_HOME_PATH,
  );
});

test("buildLoginPath and buildLegalPath preserve only safe destinations", () => {
  assert.equal(
    buildLoginPath("/portal/keys?project=42"),
    "/login?callbackUrl=%2Fportal%2Fkeys%3Fproject%3D42",
  );
  assert.equal(buildLoginPath("//evil.example"), "/login?callbackUrl=%2Fportal");
  assert.equal(
    buildLegalPath("/portal/keys?project=42", "requires_acceptance"),
    `${PORTAL_LEGAL_PATH}?returnTo=%2Fportal%2Fkeys%3Fproject%3D42&error=requires_acceptance`,
  );
  assert.equal(buildLegalPath("/login?callbackUrl=%2Fportal"), PORTAL_LEGAL_PATH);
});
