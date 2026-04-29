'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile?: {
      remove: (widgetId?: string) => void;
      render: (
        container: HTMLElement,
        options: {
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          sitekey: string;
          theme?: 'auto' | 'dark' | 'light';
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type CommunityTurnstileScriptProps = {
  enabled: boolean;
  onReady: () => void;
};

type CommunityTurnstileWidgetProps = {
  ready: boolean;
  resetKey: number;
  siteKey: string;
  onTokenChange: (token: string | null) => void;
};

export function CommunityTurnstileScript({
  enabled,
  onReady,
}: CommunityTurnstileScriptProps) {
  if (!enabled) {
    return null;
  }

  return (
    <Script
      id="community-turnstile-script"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onLoad={onReady}
    />
  );
}

export function CommunityTurnstileWidget({
  ready,
  resetKey,
  siteKey,
  onTokenChange,
}: CommunityTurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastResetKeyRef = useRef(resetKey);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) {
      return;
    }

    if (!widgetIdRef.current) {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token) => onTokenChange(token),
        'expired-callback': () => onTokenChange(null),
        'error-callback': () => onTokenChange(null),
      });
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onTokenChange, ready, siteKey]);

  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) {
      return;
    }

    lastResetKeyRef.current = resetKey;

    if (!widgetIdRef.current || !window.turnstile) {
      return;
    }

    window.turnstile.reset(widgetIdRef.current);
    onTokenChange(null);
  }, [onTokenChange, resetKey]);

  return <div ref={containerRef} className="min-h-[66px]" />;
}
