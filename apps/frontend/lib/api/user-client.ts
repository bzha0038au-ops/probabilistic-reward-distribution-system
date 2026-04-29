'use client';

import { createUserApiClient } from '@reward/user-core';

import { getBrowserDeviceFingerprint } from '@/lib/device-fingerprint';
import { getClientLocale } from '@/lib/i18n/client';
import { BFF_BASE_PATH } from './proxy';

export const browserUserApiClient = createUserApiClient({
  baseUrl: BFF_BASE_PATH,
  getLocale: () => getClientLocale(),
  getExtraHeaders: async () => {
    const fingerprint = await getBrowserDeviceFingerprint();
    return fingerprint
      ? {
          "x-device-fingerprint": fingerprint,
        }
      : undefined;
  },
});
