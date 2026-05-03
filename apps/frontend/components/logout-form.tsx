'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LogoutResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: { message: string; code?: string } };

export function LogoutForm({
  label,
  className,
  buttonClassName,
}: {
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as LogoutResponse | null;

      if (response.ok && payload?.ok) {
        window.location.assign(payload.redirectTo);
        return;
      }

      window.location.assign('/login');
    } catch {
      window.location.assign('/login');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <Button
        type="submit"
        variant="outline"
        className={cn('w-full sm:w-auto', buttonClassName)}
        disabled={pending}
      >
        {label}
      </Button>
    </form>
  );
}
