import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Form({
  action,
  children,
  labels,
}: {
  action: string | ((formData: FormData) => void | Promise<void>);
  children: ReactNode;
  labels: {
    emailLabel: string;
    passwordLabel: string;
    emailPlaceholder: string;
  };
}) {
  return (
    <form action={action} className="flex flex-col space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{labels.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={labels.emailPlaceholder}
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{labels.passwordLabel}</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      {children}
    </form>
  );
}
