'use client';

import { useCurrentUserSession } from './current-session-provider';
import { UserDashboard, type UserDashboardView } from './user-dashboard';

type UserDashboardPageProps = {
  view?: UserDashboardView;
};

export function UserDashboardPage({
  view = 'overview',
}: UserDashboardPageProps) {
  const currentSession = useCurrentUserSession();

  return <UserDashboard initialCurrentSession={currentSession} view={view} />;
}
