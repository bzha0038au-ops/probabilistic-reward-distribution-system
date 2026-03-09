import type { AdminSessionPayload } from '$lib/server/admin-session';
import type { Locale, Messages } from '$lib/i18n';

declare global {
  namespace App {
    interface Locals {
      admin: AdminSessionPayload | null;
      locale: Locale;
    }

    interface PageData {
      admin?: AdminSessionPayload | null;
      locale?: Locale;
      messages?: Messages;
    }
  }
}

export {};
