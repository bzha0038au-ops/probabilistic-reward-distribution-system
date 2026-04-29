'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getBrowserDeviceFingerprint } from '@/lib/device-fingerprint';

type LoginFormProps = {
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  submitLabel: string;
  loadingLabel: string;
  idleLabel: string;
  initialErrorMessage?: string | null;
  noticeMessage?: string | null;
  redirectTo: string;
};

type LoginResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: { message: string; code?: string } };

export function LoginForm({
  emailLabel,
  emailPlaceholder,
  passwordLabel,
  submitLabel,
  loadingLabel,
  idleLabel,
  initialErrorMessage,
  noticeMessage,
  redirectTo,
}: LoginFormProps) {
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    formData.set('redirectTo', redirectTo);

    try {
      const fingerprint = await getBrowserDeviceFingerprint();
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: fingerprint
          ? {
              'x-device-fingerprint': fingerprint,
            }
          : undefined,
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.ok) {
        setErrorMessage(
          payload && payload.ok === false
            ? payload.error.message
            : 'Login request failed.'
        );
        return;
      }

      window.location.assign(payload.redirectTo);
    } catch {
      setErrorMessage('Login request failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      action="/api/auth/login"
      method="post"
      onSubmit={handleSubmit}
      className="flex flex-col space-y-4"
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="space-y-2">
        <Label htmlFor="email">{emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={emailPlaceholder}
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{passwordLabel}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {noticeMessage && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {noticeMessage}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {submitLabel}
        <span aria-live="polite" className="sr-only" role="status">
          {pending ? loadingLabel : idleLabel}
        </span>
      </Button>
    </form>
  );
}
