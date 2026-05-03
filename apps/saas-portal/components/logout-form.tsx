'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LogoutResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: { message: string; code?: string } };

export function LogoutForm({
  className,
  label,
}: {
  className?: string;
  label: string;
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
    <form onSubmit={handleSubmit}>
      <Button
        type="submit"
        variant="outline"
        className={cn("w-full sm:w-auto", className)}
        disabled={pending}
      >
        {label}
      </Button>
    </form>
  );
}
