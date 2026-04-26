'use client';

import { useEffect } from 'react';

import { captureFrontendException } from '@/lib/observability/client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureFrontendException(error, {
      tags: {
        kind: 'global_error_boundary',
      },
      extra: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="app-root">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-3xl font-semibold text-slate-900">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-600">
            The app hit an unexpected error. Try reloading this view.
          </p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white"
            onClick={() => reset()}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
