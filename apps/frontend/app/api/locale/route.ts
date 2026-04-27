import { NextResponse } from "next/server";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { isSupportedLocale } from "@/lib/i18n/messages";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const locale = payload?.locale as string | undefined;

  if (!isSupportedLocale(locale)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Unsupported locale.",
          code: API_ERROR_CODES.UNSUPPORTED_LOCALE,
        },
      },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  return response;
}
