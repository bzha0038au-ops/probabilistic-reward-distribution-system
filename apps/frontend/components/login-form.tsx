'use client';

import { useState } from 'react';
import { TbArrowRight } from 'react-icons/tb';

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
  requestFailedMessage: string;
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
  requestFailedMessage,
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
            : requestFailedMessage
        );
        return;
      }

      window.location.assign(payload.redirectTo);
    } catch {
      setErrorMessage(requestFailedMessage);
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
        <Label htmlFor="email" className="text-[var(--retro-ink)]">
          {emailLabel}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={emailPlaceholder}
          autoComplete="email"
          required
          className="retro-field h-12 border-none px-4 text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[var(--retro-ink)]">
          {passwordLabel}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="retro-field h-12 border-none px-4 text-base"
        />
      </div>
      {noticeMessage && (
        <p className="rounded-[1rem] border-2 border-[var(--retro-green)] bg-[#e7fff1] px-4 py-3 text-sm text-[var(--retro-ink)]">
          {noticeMessage}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-[1rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
          {errorMessage}
        </p>
      )}
      <Button type="submit" variant="arcade" className="w-full" disabled={pending}>
        {submitLabel}
        <TbArrowRight className="h-4 w-4" />
        <span aria-live="polite" className="sr-only" role="status">
          {pending ? loadingLabel : idleLabel}
        </span>
      </Button>
    </form>
  );
}
