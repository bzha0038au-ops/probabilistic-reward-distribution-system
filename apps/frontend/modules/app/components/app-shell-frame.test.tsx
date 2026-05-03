// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { CurrentUserSessionResponse } from '@reward/shared-types/auth';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShellFrame, type AppShellNavItem } from './app-shell-frame';

const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/locale-switcher', () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));

vi.mock('@/components/logout-form', () => ({
  LogoutForm: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock('./notifications-bell', () => ({
  NotificationsBell: () => <button type="button">Notifications</button>,
}));

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 42,
    email: 'player@example.com',
    role: 'user',
    emailVerifiedAt: '2026-05-01T00:00:00.000Z',
    phoneVerifiedAt: '2026-05-02T00:00:00.000Z',
  },
  session: {
    sessionId: 'session-42',
    kind: 'user',
    role: 'user',
    ip: null,
    userAgent: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    lastSeenAt: '2026-05-03T00:00:00.000Z',
    expiresAt: '2026-06-03T00:00:00.000Z',
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

const topNav: AppShellNavItem[] = [
  { href: '/app', label: 'Home', icon: 'dashboard', match: 'exact' },
];

const railPrimary: AppShellNavItem[] = [
  { href: '/app/community', label: 'Community', icon: 'community' },
];

const mobileTabs: AppShellNavItem[] = [
  { href: '/app', label: 'Home', icon: 'home', match: 'exact' },
  { href: '/app/markets', label: 'Markets', icon: 'markets', match: 'prefix' },
  {
    href: '/app/holdem',
    label: 'Games',
    icon: 'games',
    prefixes: ['/app/holdem', '/app/blackjack'],
  },
  { href: '/app/community', label: 'Community', icon: 'community', match: 'prefix' },
  {
    href: '/app/profile',
    label: 'Profile',
    icon: 'profile',
    prefixes: ['/app/profile', '/app/security', '/app/wallet'],
  },
];

function renderShell() {
  return render(
    <AppShellFrame
      currentSession={currentSession}
      brandLabel="Prize Pool Engine"
      shellTitle="Player Console"
      signedInAsLabel="Signed in as player@example.com"
      dailySpinLabel="Daily Spin"
      signOutLabel="Sign out"
      topNav={topNav}
      railPrimary={railPrimary}
      mobileTabs={mobileTabs}
    >
      <div>Shell content</div>
    </AppShellFrame>,
  );
}

describe('AppShellFrame', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/app/markets');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the five mobile tabs and marks the active section', () => {
    renderShell();

    const tabBar = screen.getByRole('navigation', { name: 'Mobile tab bar' });
    const homeLink = within(tabBar).getByRole('link', { name: /Home/i });
    const marketsLink = within(tabBar).getByRole('link', { name: /Markets/i });
    const gamesLink = within(tabBar).getByRole('link', { name: /Games/i });
    const communityLink = within(tabBar).getByRole('link', { name: /Community/i });
    within(tabBar).getByRole('link', { name: /Profile/i });

    expect(homeLink).toBeDefined();
    expect(marketsLink.getAttribute('aria-current')).toBe('page');
    expect(communityLink.getAttribute('aria-current')).toBeNull();
    expect(gamesLink.getAttribute('aria-current')).toBeNull();
  });
});
