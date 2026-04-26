'use client';

import { useEffect } from 'react';

const detectEmbeddedWebView = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent;

  return (
    /WebView|; wv\)|\bwv\b/i.test(userAgent) ||
    (/iPhone|iPad|iPod/i.test(userAgent) &&
      /AppleWebKit/i.test(userAgent) &&
      !/Safari/i.test(userAgent))
  );
};

export function WebviewBridge() {
  useEffect(() => {
    const root = document.documentElement;

    const updateViewportMetrics = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;

      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-width', `${width}px`);
    };

    updateViewportMetrics();
    root.dataset.embedded = detectEmbeddedWebView() ? 'true' : 'false';

    const viewport = window.visualViewport;

    viewport?.addEventListener('resize', updateViewportMetrics);
    viewport?.addEventListener('scroll', updateViewportMetrics);
    window.addEventListener('resize', updateViewportMetrics);
    window.addEventListener('orientationchange', updateViewportMetrics);

    return () => {
      viewport?.removeEventListener('resize', updateViewportMetrics);
      viewport?.removeEventListener('scroll', updateViewportMetrics);
      window.removeEventListener('resize', updateViewportMetrics);
      window.removeEventListener('orientationchange', updateViewportMetrics);
    };
  }, []);

  return null;
}
