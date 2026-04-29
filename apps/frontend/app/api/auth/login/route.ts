import { NextResponse } from "next/server";
import {
  API_ERROR_CODES,
  normalizeApiErrorCode,
  type ApiErrorCode,
} from "@reward/shared-types/api";
import type { UserSessionResponse } from "@reward/shared-types/auth";

import { USER_API_ROUTES, parseApiResponse } from "@/lib/api/user";
import { buildBackendUrl } from "@/lib/api/server";
import {
  getBackendTokenCookieName,
  getBackendTokenCookieOptions,
} from "@/lib/auth/backend-token-cookie";

const APP_PATH = "/app";

const sanitizeRedirectPath = (
  value: FormDataEntryValue | null,
  requestUrl: string,
) => {
  const redirectTo = typeof value === "string" ? value.trim() : "";

  if (!redirectTo) {
    return APP_PATH;
  }

  if (redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const redirectUrl = new URL(redirectTo);

    if (redirectUrl.origin !== requestOrigin) {
      return APP_PATH;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}` || APP_PATH;
  } catch {
    return APP_PATH;
  }
};

const errorResponse = (error: string, status = 400, code?: ApiErrorCode) =>
  NextResponse.json(
    {
      ok: false,
      error: {
        message: error,
        code:
          status >= 500 ? undefined : (code ?? normalizeApiErrorCode(error)),
      },
    },
    { status },
  );

const successResponse = (redirectTo: string) =>
  NextResponse.json({
    ok: true,
    redirectTo,
  });

const isDocumentFormSubmission = (request: Request) =>
  request.headers.get("sec-fetch-dest") === "document" ||
  request.headers.get("sec-fetch-mode") === "navigate";

const buildAbsoluteUrl = (request: Request, path: string) =>
  new URL(path, request.url);

const buildLoginRedirect = (request: Request, error: string, redirectTo: string) => {
  const target = buildAbsoluteUrl(request, "/login");
  target.searchParams.set("error", error);

  if (redirectTo !== APP_PATH) {
    target.searchParams.set("callbackUrl", redirectTo);
  }

  return target;
};

const documentRedirect = (request: Request, path: string) =>
  NextResponse.redirect(buildAbsoluteUrl(request, path), { status: 303 });

const documentErrorRedirect = (
  request: Request,
  error: string,
  redirectTo: string,
) => NextResponse.redirect(buildLoginRedirect(request, error, redirectTo), { status: 303 });

const withCookie = (response: NextResponse, token: string) => {
  response.cookies.set(
    getBackendTokenCookieName(),
    encodeURIComponent(token),
    getBackendTokenCookieOptions(),
  );

  return response;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizeRedirectPath(formData.get("redirectTo"), request.url);
  const isDocumentSubmit = isDocumentFormSubmission(request);
  const deviceFingerprint = request.headers.get("x-device-fingerprint");

  if (!email || !password) {
    if (isDocumentSubmit) {
      return documentErrorRedirect(
        request,
        "Missing email or password.",
        redirectTo,
      );
    }

    return errorResponse(
      "Missing email or password.",
      400,
      API_ERROR_CODES.MISSING_EMAIL_OR_PASSWORD,
    );
  }

  let result;
  try {
    const response = await fetch(
      buildBackendUrl(USER_API_ROUTES.auth.session),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deviceFingerprint
            ? { "x-device-fingerprint": deviceFingerprint }
            : {}),
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      },
    );

    result = await parseApiResponse<UserSessionResponse>(response);
  } catch {
    if (isDocumentSubmit) {
      return documentErrorRedirect(request, "Login request failed.", redirectTo);
    }

    return errorResponse(
      "Login request failed.",
      502,
      API_ERROR_CODES.LOGIN_REQUEST_FAILED,
    );
  }

  if (!result.ok) {
    if (isDocumentSubmit) {
      return documentErrorRedirect(request, result.error.message, redirectTo);
    }

    return errorResponse(
      result.error.message,
      result.status ?? 401,
      result.error.code,
    );
  }

  if (!result.data?.token) {
    if (isDocumentSubmit) {
      return documentErrorRedirect(request, "CredentialsSignin", redirectTo);
    }

    return errorResponse(
      "CredentialsSignin",
      401,
      API_ERROR_CODES.UNAUTHORIZED,
    );
  }

  if (isDocumentSubmit) {
    return withCookie(documentRedirect(request, redirectTo), result.data.token);
  }

  return withCookie(successResponse(redirectTo), result.data.token);
}
