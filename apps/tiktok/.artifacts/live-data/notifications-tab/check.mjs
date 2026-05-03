import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/Users/bill/.codex/skills/develop-web-game/scripts/node_modules/playwright/index.mjs';

const outputDir = '/Users/bill/project/reward system/apps/tiktok/.artifacts/live-data/notifications-tab';
await fs.mkdir(outputDir, { recursive: true });

const currentSession = {
  user: {
    id: 7,
    email: 'demo@reward.local',
    role: 'user',
    emailVerifiedAt: '2026-05-01T09:00:00.000Z',
    phoneVerifiedAt: '2026-05-04T10:05:00.000Z',
  },
  session: {
    sessionId: 'session-1',
    kind: 'user',
    role: 'user',
    ip: '127.0.0.1',
    userAgent: 'Mock Safari',
    createdAt: '2026-05-01T09:00:00.000Z',
    lastSeenAt: '2026-05-04T10:20:00.000Z',
    expiresAt: '2026-05-05T10:20:00.000Z',
    current: true,
  },
  legal: { requiresAcceptance: false, items: [] },
};

const walletBalance = {
  balance: {
    withdrawableBalance: '48.00',
    bonusBalance: '12.00',
    lockedBalance: '3.00',
    totalBalance: '63.00',
  },
  assets: [],
  legacy: {
    withdrawableBalance: '48.00',
    bonusBalance: '12.00',
    lockedBalance: '3.00',
    totalBalance: '63.00',
  },
};

const economyLedger = [];
const rewardCenter = { summary: { bonusBalance: '12.00', streakDays: 3, todayDailyClaimed: false, availableMissionCount: 1, claimedMissionCount: 2 }, missions: [] };
const drawOverview = {
  drawEnabled: true,
  balance: '63.00',
  drawCost: '2.00',
  maxBatchCount: 5,
  recommendedBatchCount: 3,
  pity: { enabled: true, currentStreak: 2, threshold: 10, boostPct: 12, maxBoostPct: 25, active: false, drawsUntilBoost: 8 },
  playMode: { type: 'standard', appliedMultiplier: 1, nextMultiplier: 1, streak: 0, lastOutcome: null, carryActive: false, pendingPayoutAmount: '0.00', pendingPayoutCount: 0, snowballCarryAmount: '0.00', snowballEnvelopeAmount: '0.00' },
  fairness: { epoch: 4, epochSeconds: 900, commitHash: 'commit-1' },
  prizes: [], featuredPrizes: [],
};
const sessions = { items: [currentSession.session] };
const mfaStatus = { mfaEnabled: true, largeWithdrawalThreshold: '200.00' };
let notifications = [
  { id: 301, userId: 7, kind: 'security_alert', title: 'New device detected', body: 'A fresh Safari session signed in from Sydney.', data: null, readAt: null, createdAt: '2026-05-04T10:10:00.000Z', updatedAt: '2026-05-04T10:10:00.000Z' },
  { id: 302, userId: 7, kind: 'withdrawal_status_changed', title: 'Withdrawal settled', body: 'Your $48 withdrawal cleared manual review.', data: null, readAt: '2026-05-04T09:45:00.000Z', createdAt: '2026-05-04T09:30:00.000Z', updatedAt: '2026-05-04T09:45:00.000Z' },
  { id: 303, userId: 7, kind: 'prediction_market_settled', title: 'Market settled', body: 'Your east-side forecast paid out overnight.', data: null, readAt: null, createdAt: '2026-05-04T08:00:00.000Z', updatedAt: '2026-05-04T08:00:00.000Z' },
];
let notificationPreferences = {
  items: [
    { id: 1, userId: 7, kind: 'security_alert', channel: 'email', enabled: true, createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:00:00.000Z' },
    { id: 2, userId: 7, kind: 'security_alert', channel: 'sms', enabled: false, createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:00:00.000Z' },
    { id: 3, userId: 7, kind: 'withdrawal_status_changed', channel: 'email', enabled: true, createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:00:00.000Z' },
    { id: 4, userId: 7, kind: 'prediction_market_settled', channel: 'in_app', enabled: true, createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:00:00.000Z' },
  ],
};

const ok = (data) => ({ ok: true, data, requestId: 'req-1', traceId: 'trace-1', status: 200 });
const notificationSummary = () => ({ unreadCount: notifications.filter((item) => !item.readAt).length, latestCreatedAt: notifications[0]?.createdAt ?? null });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 1100 } });
await context.addInitScript(() => {
  localStorage.setItem('last-chance-user-token', 'token-1');
  localStorage.setItem('last-chance-remembered-email', 'demo@reward.local');
});
const page = await context.newPage();
const consoleMessages = [];
page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));

await page.route('**/api/user/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname.replace('/api/user', '') || '/';
  const method = request.method().toUpperCase();
  let data;
  if (method === 'GET' && pathname === '/auth/user/session') data = currentSession;
  else if (method === 'GET' && pathname === '/wallet') data = walletBalance;
  else if (method === 'GET' && pathname === '/economy/ledger') data = economyLedger;
  else if (method === 'GET' && pathname === '/notifications') data = { items: notifications };
  else if (method === 'GET' && pathname === '/notifications/summary') data = notificationSummary();
  else if (method === 'POST' && pathname === '/notifications/read-all') {
    const updatedCount = notifications.filter((item) => !item.readAt).length;
    notifications = notifications.map((item) => ({ ...item, readAt: item.readAt ?? '2026-05-04T10:30:00.000Z', updatedAt: '2026-05-04T10:30:00.000Z' }));
    data = { updatedCount };
  } else if (method === 'GET' && pathname === '/notification-preferences') data = notificationPreferences;
  else if (method === 'PATCH' && pathname === '/notification-preferences') {
    const body = JSON.parse(request.postData() || '{}');
    for (const mutation of body.items || []) {
      notificationPreferences = {
        items: notificationPreferences.items.map((entry) =>
          entry.kind === mutation.kind && entry.channel === mutation.channel
            ? { ...entry, enabled: mutation.enabled, updatedAt: '2026-05-04T10:31:00.000Z' }
            : entry,
        ),
      };
    }
    data = notificationPreferences;
  } else if (method === 'GET' && pathname === '/rewards/center') data = rewardCenter;
  else if (method === 'GET' && pathname === '/auth/user/sessions') data = sessions;
  else if (method === 'GET' && pathname === '/draw/overview') data = drawOverview;
  else if (method === 'GET' && pathname === '/auth/user/mfa/status') data = mfaStatus;
  else {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: `Unhandled route: ${method} ${pathname}` }, requestId: 'req-404' }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
});

async function capture(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await fs.writeFile(path.join(outputDir, `${name}.json`), JSON.stringify(state, null, 2));
  await fs.writeFile(path.join(outputDir, `${name}-console.json`), JSON.stringify(consoleMessages, null, 2));
}

await page.goto('http://localhost:3005/#/notifications', { waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const raw = window.render_game_to_text?.();
  if (!raw) return false;
  const state = JSON.parse(raw);
  return state?.activeTab === 'notifications' && state?.live?.notificationCount >= 3;
});
await capture('notifications-tab-before-actions');
await page.click('[data-action="set-notification-filter"][data-filter="security"]');
await page.click('[data-action="toggle-notification-unread-only"]');
await page.click('[data-action="toggle-notification-preference"][data-kind="security_alert"][data-channel="sms"]');
await page.waitForTimeout(250);
await capture('notifications-tab-after-actions');
await browser.close();
