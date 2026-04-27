import { json, type RequestHandler } from "@sveltejs/kit"
import { API_ERROR_CODES } from "@reward/shared-types/api"

import { LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "$lib/i18n"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export const POST: RequestHandler = async ({ request, cookies }) => {
  const payload = await request.json().catch(() => ({}))
  const locale = payload?.locale as Locale | undefined

  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    return json(
      {
        ok: false,
        error: {
          message: "Unsupported locale.",
          code: API_ERROR_CODES.UNSUPPORTED_LOCALE,
        },
      },
      { status: 400 },
    )
  }

  cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  })

  return json({ ok: true })
}
