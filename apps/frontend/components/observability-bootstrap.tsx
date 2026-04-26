'use client';

import { useEffect } from 'react';

import { initFrontendObservability } from '@/lib/observability/client';

export function ObservabilityBootstrap() {
  useEffect(() => {
    initFrontendObservability();
  }, []);

  return null;
}
