'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type LogoutResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: { message: string } };

export function LogoutForm({ label }: { label: string }) {
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
      <Button type="submit" variant="outline" className="w-full sm:w-auto" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
