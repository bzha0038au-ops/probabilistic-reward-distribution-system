'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserDashboardCopy } from './user-dashboard-copy';
import { SecuritySessionCard } from './user-dashboard-domain-ui';
import type { UserDashboardController } from './use-user-dashboard';
import { resolveUserDashboardBadgeVariant as badgeVariant } from './user-dashboard-utils';

type Translate = (key: string) => string;

type ActivitySectionController = Pick<
  UserDashboardController,
  | 'currentSession'
  | 'sessions'
  | 'refreshing'
  | 'sessionLoading'
  | 'handleRefresh'
  | 'handleRevokeSession'
  | 'handleRevokeAllSessions'
>;

type UserDashboardActivitySectionProps = {
  controller: ActivitySectionController;
  copy: UserDashboardCopy;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatStatus: (value: string | null | undefined) => string;
  showSessionsSection: boolean;
  t: Translate;
};

export function UserDashboardActivitySection({
  controller,
  copy: c,
  formatDateTime,
  formatStatus,
  showSessionsSection,
  t,
}: UserDashboardActivitySectionProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-1">
      {showSessionsSection ? (
        <Card className="retro-panel rounded-[1.85rem] border-none">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-[1.9rem] text-[var(--retro-ink)]">
                  {c.sessionsTitle}
                </CardTitle>
                <CardDescription className="text-[rgba(15,17,31,0.68)]">
                  {c.sessionsDescription}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="arcadeOutline"
                  size="sm"
                  onClick={() => void controller.handleRefresh()}
                  disabled={controller.refreshing}
                >
                  {controller.refreshing ? t('common.loading') : c.refresh}
                </Button>
                <Button
                  type="button"
                  variant="arcade"
                  size="sm"
                  onClick={() => void controller.handleRevokeAllSessions()}
                  disabled={controller.sessionLoading}
                >
                  {controller.sessionLoading
                    ? t('common.loading')
                    : c.signOutEverywhere}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <SecuritySessionCard
              title={c.currentDevice}
              badge={
                <Badge
                  variant={badgeVariant(true)}
                  className="retro-badge retro-badge-gold border-none"
                >
                  {c.currentDevice}
                </Badge>
              }
              userAgent={controller.currentSession.userAgent ?? c.unknown}
              details={
                <>
                  <p>
                    {c.device}: {controller.currentSession.ip ?? c.unknown}
                  </p>
                  <p>
                    {c.createdAt}: {formatDateTime(controller.currentSession.createdAt)}
                  </p>
                  <p>
                    {c.expires}: {formatDateTime(controller.currentSession.expiresAt)}
                  </p>
                </>
              }
            />

            {controller.sessions.length === 0 ? (
              <p className="text-sm text-[rgba(15,17,31,0.56)]">{c.noSessions}</p>
            ) : (
              controller.sessions.map((entry) => (
                <SecuritySessionCard
                  key={entry.sessionId}
                  title={entry.current ? c.currentDevice : c.activeSession}
                  badge={
                    <Badge
                      variant={badgeVariant(entry.current)}
                      className={
                        entry.current
                          ? 'retro-badge retro-badge-gold border-none'
                          : 'retro-badge retro-badge-violet border-none'
                      }
                    >
                      {entry.current ? c.currentDevice : formatStatus(entry.kind)}
                    </Badge>
                  }
                  userAgent={entry.userAgent ?? c.unknown}
                  details={
                    <>
                      <p>
                        {c.device}: {entry.ip ?? c.unknown}
                      </p>
                      <p>
                        {c.createdAt}: {formatDateTime(entry.createdAt)}
                      </p>
                      <p>
                        {c.expires}: {formatDateTime(entry.expiresAt)}
                      </p>
                    </>
                  }
                  action={
                    <Button
                      type="button"
                      variant={entry.current ? 'arcade' : 'arcadeOutline'}
                      size="sm"
                      onClick={() =>
                        void controller.handleRevokeSession(entry.sessionId, entry.current)
                      }
                      disabled={controller.sessionLoading}
                    >
                      {controller.sessionLoading
                        ? t('common.loading')
                        : entry.current
                          ? c.signOutThisDevice
                          : c.revoke}
                    </Button>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
