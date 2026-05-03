import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { setTimeout as delay } from 'node:timers/promises';

const databaseUrl = process.env.TEST_DATABASE_URL;
const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
}

const waitForNotificationPayload = async (payload: {
  kind: string;
  recipient: string;
  timeoutMs?: number;
}) => {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });
  const deadline = Date.now() + (payload.timeoutMs ?? 10_000);

  try {
    while (Date.now() < deadline) {
      const rows = await sql<Array<{ payload: Record<string, unknown> | string }>>`
        select payload
        from notification_deliveries
        where kind = ${payload.kind}
          and recipient = ${payload.recipient}
        order by id desc
        limit 1
      `;

      const value = rows[0]?.payload;
      if (typeof value === 'string') {
        return JSON.parse(value) as Record<string, unknown>;
      }

      if (value && typeof value === 'object') {
        return value;
      }

      await delay(200);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  throw new Error(
    `Timed out waiting for ${payload.kind} notification for ${payload.recipient}.`,
  );
};

test.describe.configure({ mode: 'serial' });

test('user can register, verify email, and sign in through the browser', async ({
  page,
}) => {
  const email = `playwright-${Date.now()}@example.com`;
  const password = 'Password123!';

  await page.goto('/register');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Birth Date').fill(TEST_BIRTH_DATE);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 30_000 });
  await expect(
    page.getByText('Account created. Check your email to verify it.'),
  ).toBeVisible();

  const notification = await waitForNotificationPayload({
    kind: 'email_verification',
    recipient: email,
  });
  const verificationUrl = String(notification.verificationUrl ?? '');

  expect(verificationUrl).toContain('/verify-email?token=');

  await page.goto(verificationUrl);
  await page.getByRole('button', { name: 'Verify Email' }).click();

  await page.waitForURL(/\/login\?verified=1$/, { timeout: 30_000 });
  await expect(
    page.getByText('Email verified. You can continue signing in.'),
  ).toBeVisible();

  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL(/\/app$/, { timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Sign Out', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open slot machine' }),
  ).toBeVisible();
});
