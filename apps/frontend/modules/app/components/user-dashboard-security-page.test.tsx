// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { CurrentUserSessionResponse } from '@reward/shared-types/auth';
import type { FormEvent, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { userDashboardCopy } from './user-dashboard-copy';
import { UserDashboardSecurityPage } from './user-dashboard-security-page';

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

const currentSession: CurrentUserSessionResponse = {
  user: {
    id: 42,
    email: 'player@example.com',
    role: 'user',
    emailVerifiedAt: '2026-04-01T00:00:00.000Z',
    phoneVerifiedAt: null,
  },
  session: {
    sessionId: 'session-current',
    kind: 'user',
    role: 'user',
    ip: '203.0.113.5',
    userAgent: 'Safari on Mac',
    createdAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-05-01T00:00:00.000Z',
    expiresAt: '2026-05-10T00:00:00.000Z',
    current: true,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

type SecurityPageController = Parameters<
  typeof UserDashboardSecurityPage
>[0]['controller'];

function buildController(): SecurityPageController {
  return {
    currentSession: currentSession.session,
    sessions: [
      currentSession.session,
      {
        ...currentSession.session,
        current: true,
      },
      {
        sessionId: 'session-other',
        kind: 'user',
        role: 'user',
        ip: '198.51.100.7',
        userAgent: 'Chrome on Windows',
        createdAt: '2026-04-15T00:00:00.000Z',
        lastSeenAt: '2026-05-02T00:00:00.000Z',
        expiresAt: '2026-05-14T00:00:00.000Z',
        current: false,
      },
    ],
    refreshing: false,
    sessionLoading: false,
    phone: '',
    setPhone: vi.fn(),
    phoneCode: '',
    setPhoneCode: vi.fn(),
    emailSubmitting: false,
    phoneRequestSubmitting: false,
    phoneConfirmSubmitting: false,
    handleRefresh: vi.fn(async () => {}),
    handleRevokeSession: vi.fn(async () => {}),
    handleRevokeAllSessions: vi.fn(async () => {}),
    handleSendVerificationEmail: vi.fn(async () => {}),
    handleSendPhoneCode: vi.fn(async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    }),
    handleConfirmPhone: vi.fn(async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    }),
  };
}

describe('UserDashboardSecurityPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the current session out of the revocable session list and shows phone setup when unverified', () => {
    const controller = buildController();

    render(
      <UserDashboardSecurityPage
        controller={controller}
        copy={userDashboardCopy.en}
        emailVerified
        phoneVerified={false}
        formatDateTime={(value) => String(value ?? 'Unknown')}
        formatStatus={(value) => String(value ?? 'Unknown')}
        t={(key) => (key === 'common.loading' ? 'Loading' : key)}
      />,
    );

    expect(screen.getAllByText('Safari on Mac')).toHaveLength(1);
    expect(screen.queryByLabelText(userDashboardCopy.en.phoneLabel)).not.toBeNull();

    const otherSessions = screen.getByTestId('security-other-sessions');
    expect(within(otherSessions).queryByText('Chrome on Windows')).not.toBeNull();
    expect(within(otherSessions).queryByText('Safari on Mac')).toBeNull();
    expect(screen.getAllByRole('button', { name: userDashboardCopy.en.revoke })).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: userDashboardCopy.en.signOutThisDevice }),
    ).not.toBeNull();
  });
});
