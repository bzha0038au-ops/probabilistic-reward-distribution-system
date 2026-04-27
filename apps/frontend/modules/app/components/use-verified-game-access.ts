'use client';

import { useTranslations } from '@/components/i18n-provider';
import { useCurrentUserSession } from './current-session-provider';

export function useVerifiedGameAccess() {
  const t = useTranslations();
  const currentSession = useCurrentUserSession();
  const emailVerified = Boolean(currentSession.user.emailVerifiedAt);

  return {
    disabled: !emailVerified,
    disabledReason: !emailVerified ? t('app.drawLocked') : null,
  };
}
