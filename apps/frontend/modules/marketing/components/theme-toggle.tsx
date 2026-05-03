'use client';

import { useEffect, useState } from 'react';
import { TbMoon, TbSun } from 'react-icons/tb';

type LandingTheme = 'light' | 'dark';

const STORAGE_KEY = 'reward-landing-theme';

const resolveInitialTheme = (): LandingTheme => {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme: LandingTheme) => {
  document.documentElement.dataset.landingTheme = theme;
};

export function LandingThemeToggle({
  lightLabel,
  darkLabel,
}: {
  lightLabel: string;
  darkLabel: string;
}) {
  const [theme, setTheme] = useState<LandingTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const currentLabel = theme === 'dark' ? darkLabel : lightLabel;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={theme === 'dark'}
      aria-label={currentLabel}
      title={currentLabel}
      className="landing-theme-button"
    >
      <span className="landing-theme-button-icon grid h-7 w-7 place-items-center rounded-full">
        {theme === 'dark' ? <TbMoon className="h-4 w-4" /> : <TbSun className="h-4 w-4" />}
      </span>
      <span suppressHydrationWarning>{mounted ? currentLabel : lightLabel}</span>
    </button>
  );
}
