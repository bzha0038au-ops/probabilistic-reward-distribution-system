'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SubmitButton({
  children,
  loadingLabel,
  idleLabel,
  className,
}: {
  children: string;
  loadingLabel: string;
  idleLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type={pending ? 'button' : 'submit'}
      variant="arcade"
      className={cn('w-full', className)}
      disabled={pending}
    >
      {children}
      {pending && (
        <svg
          className="ml-2 h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {pending ? loadingLabel : idleLabel}
      </span>
    </Button>
  );
}
