'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserDashboardCopy } from './user-dashboard-copy';
import type { UserDashboardController } from './use-user-dashboard';
import { resolveUserDashboardBadgeVariant as badgeVariant } from './user-dashboard-utils';

type Translate = (key: string) => string;

type ActivitySectionController = Pick<
  UserDashboardController,
  | 'currentSession'
  | 'transactions'
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
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatStatus: (value: string | null | undefined) => string;
  showSessionsSection: boolean;
  showTransactionsSection: boolean;
  t: Translate;
};

export function UserDashboardActivitySection({
  controller,
  copy: c,
  formatAmount,
  formatDateTime,
  formatStatus,
  showSessionsSection,
  showTransactionsSection,
  t,
}: UserDashboardActivitySectionProps) {
  return (
    <section
      className={`grid gap-6 ${
        showTransactionsSection && showSessionsSection
          ? 'xl:grid-cols-[1.15fr,0.85fr]'
          : 'xl:grid-cols-1'
      }`}
    >
      {showTransactionsSection ? (
        <Card>
          <CardHeader>
            <CardTitle>{c.transactionsTitle}</CardTitle>
            <CardDescription>{c.transactionsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {controller.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noTransactions}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{c.type}</TableHead>
                    <TableHead>{c.amount}</TableHead>
                    <TableHead>{c.before}</TableHead>
                    <TableHead>{c.after}</TableHead>
                    <TableHead>{c.reference}</TableHead>
                    <TableHead>{c.createdAt}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controller.transactions.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatStatus(entry.entryType)}</TableCell>
                      <TableCell>{formatAmount(entry.amount)}</TableCell>
                      <TableCell>{formatAmount(entry.balanceBefore)}</TableCell>
                      <TableCell>{formatAmount(entry.balanceAfter)}</TableCell>
                      <TableCell>
                        {entry.referenceType && entry.referenceId
                          ? `${formatStatus(entry.referenceType)} #${entry.referenceId}`
                          : c.unknown}
                      </TableCell>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showSessionsSection ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{c.sessionsTitle}</CardTitle>
                <CardDescription>{c.sessionsDescription}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void controller.handleRefresh()}
                  disabled={controller.refreshing}
                >
                  {controller.refreshing ? t('common.loading') : c.refresh}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-950">{c.currentDevice}</p>
              <p className="mt-1 break-all text-slate-500">
                {c.expires}: {formatDateTime(controller.currentSession.expiresAt)}
              </p>
            </div>

            {controller.sessions.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noSessions}</p>
            ) : (
              controller.sessions.map((entry) => (
                <div
                  key={entry.sessionId}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">
                        {entry.current ? c.currentDevice : c.activeSession}
                      </p>
                      <p className="mt-1 break-all text-slate-500">
                        {entry.userAgent ?? c.unknown}
                      </p>
                    </div>
                    <Badge variant={badgeVariant(entry.current)}>
                      {entry.current ? c.currentDevice : formatStatus(entry.kind)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-slate-500">
                    <p>
                      {c.device}: {entry.ip ?? c.unknown}
                    </p>
                    <p>
                      {c.createdAt}: {formatDateTime(entry.createdAt)}
                    </p>
                    <p>
                      {c.expires}: {formatDateTime(entry.expiresAt)}
                    </p>
                  </div>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant={entry.current ? 'destructive' : 'outline'}
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
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
