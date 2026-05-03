import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;
const adminOrigin =
  process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? 'http://127.0.0.1:5173';
const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
}

if (!apiBaseUrl) {
  throw new Error('PLAYWRIGHT_API_BASE_URL must be set for e2e tests.');
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

const ADMIN_SESSION_COOKIE = 'reward_admin_session';
const CSRF_COOKIE = 'reward_csrf';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN = 'playwright-admin-csrf-token';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PRIZE_ENGINE_SCOPES = [
  'catalog:read',
  'fairness:read',
  'reward:write',
  'ledger:read',
] as const;
const SAAS_ADMIN_PERMISSION_KEYS = ['config.read', 'config.update'] as const;

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { message?: string; code?: string }; requestId?: string };

type AdminSession = {
  token: string;
  secret: string;
};

type CapturedWebhookRequest = {
  body: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

type WebhookReceiver = {
  close: () => Promise<void>;
  url: string;
  waitForRequest: (timeoutMs?: number) => Promise<CapturedWebhookRequest>;
};

const readBody = async <T>(response: Response) =>
  (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

const decodeBase32 = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base32 secret.');
    }

    accumulator = (accumulator << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((accumulator >> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const generateTotpCode = (secret: string, now = Date.now()) => {
  const counter = BigInt(Math.floor(now / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
};

const requestJson = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await readBody<T>(response);
  return { response, body };
};

const expectOk = async <T>(path: string, init: RequestInit = {}) => {
  const { response, body } = await requestJson<T>(path, init);
  if (!response.ok || !body.ok) {
    throw new Error(
      `Request to ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body.data;
};

const waitForRecord = async <T>(
  query: () => Promise<T | null | undefined>,
  label: string,
  timeoutMs = 15_000,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const record = await query();
    if (record) {
      return record;
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${label}.`);
};

const registerAdminAccount = async (
  email: string,
  password: string,
  permissions: readonly string[],
) => {
  await expectOk<{ email: string }>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, birthDate: TEST_BIRTH_DATE }),
  });

  const [user] = await sql<Array<{ id: number }>>`
    select id
    from users
    where email = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error(`Missing admin user for ${email}.`);
  }

  await sql`
    update users
    set role = 'admin', updated_at = now()
    where id = ${user.id}
  `;

  const [admin] = await sql<Array<{ id: number }>>`
    insert into admins (user_id, display_name, is_active)
    values (${user.id}, ${'Playwright SaaS Admin'}, true)
    returning id
  `;

  for (const permissionKey of permissions) {
    await sql`
      insert into admin_permissions (admin_id, permission_key)
      values (${admin.id}, ${permissionKey})
      on conflict (admin_id, permission_key) do nothing
    `;
  }
};

const loginAdmin = async (email: string, password: string, totpCode?: string) =>
  expectOk<{
    token: string;
  }>('/auth/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    }),
  });

const adminRequest = async <T>(payload: {
  path: string;
  token: string;
  method?: string;
  body?: Record<string, unknown>;
  totpCode?: string;
}) => {
  const headers = new Headers({
    cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(payload.token)}; ${CSRF_COOKIE}=${CSRF_TOKEN}`,
    origin: adminOrigin,
    [CSRF_HEADER]: CSRF_TOKEN,
  });

  if (payload.totpCode) {
    headers.set('x-admin-totp-code', payload.totpCode);
  }

  let body: string | undefined;
  if (payload.body) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(payload.body);
  }

  const response = await fetch(`${apiBaseUrl}${payload.path}`, {
    method: payload.method ?? 'GET',
    headers,
    body,
  });
  const envelope = await readBody<T>(response);
  if (!response.ok || !envelope.ok) {
    throw new Error(
      `Admin request to ${payload.path} failed with ${response.status}: ${JSON.stringify(envelope)}`,
    );
  }
  return envelope.data;
};

const enableAdminMfa = async (
  email: string,
  password: string,
): Promise<AdminSession> => {
  const login = await loginAdmin(email, password);
  const enrollment = await adminRequest<{
    secret: string;
    enrollmentToken: string;
  }>({
    path: '/admin/mfa/enrollment',
    token: login.token,
    method: 'POST',
    body: {},
  });
  const totpCode = generateTotpCode(enrollment.secret);
  const verification = await adminRequest<{
    token: string;
  }>({
    path: '/admin/mfa/verify',
    token: login.token,
    method: 'POST',
    body: {
      enrollmentToken: enrollment.enrollmentToken,
      totpCode,
    },
  });

  return {
    token: verification.token,
    secret: enrollment.secret,
  };
};

const createWebhookReceiver = async (): Promise<WebhookReceiver> => {
  const requests: CapturedWebhookRequest[] = [];
  const waiters: Array<(request: CapturedWebhookRequest) => void> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => {
      const captured = {
        body: Buffer.concat(chunks).toString('utf8'),
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(',') : (value ?? ''),
          ]),
        ),
        method: request.method ?? 'GET',
        url: request.url ?? '/',
      } satisfies CapturedWebhookRequest;

      requests.push(captured);
      const waiter = waiters.shift();
      waiter?.(captured);

      response.statusCode = 202;
      response.end('accepted');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve webhook receiver address.');
  }

  return {
    url: `http://127.0.0.1:${address.port}/webhooks/reward`,
    waitForRequest: async (timeoutMs = 15_000) => {
      const existing = requests.shift();
      if (existing) {
        return existing;
      }

      return await new Promise<CapturedWebhookRequest>((resolve, reject) => {
        const waiter = (request: CapturedWebhookRequest) => {
          clearTimeout(timer);
          resolve(request);
        };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error('Timed out waiting for outbound webhook request.'));
        }, timeoutMs);

        waiters.push(waiter);
      });
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('admin portal can create an outbound webhook and show worker-delivered reward callbacks', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const now = Date.now();
  const adminEmail = `saas-webhook-admin-${now}@example.com`;
  const adminPassword = 'AdminPassword123!';
  const tenantSlug = `playwright-webhook-${now}`;
  const tenantName = `Playwright Webhook ${now}`;
  const receiverSecret = 'whsec_playwright_e2e';
  const receiver = await createWebhookReceiver();

  try {
    await registerAdminAccount(
      adminEmail,
      adminPassword,
      SAAS_ADMIN_PERMISSION_KEYS,
    );
    const adminSession = await enableAdminMfa(adminEmail, adminPassword);
    const tenant = await adminRequest<{
      id: number;
      bootstrap: {
        sandboxProject: {
          id: number;
          name: string;
        };
      };
    }>({
      path: '/admin/saas/tenants',
      token: adminSession.token,
      method: 'POST',
      totpCode: generateTotpCode(adminSession.secret),
      body: {
        slug: tenantSlug,
        name: tenantName,
      },
    });
    const projectId = tenant.bootstrap.sandboxProject.id;
    const projectName = tenant.bootstrap.sandboxProject.name;

    await adminRequest({
      path: `/admin/saas/projects/${projectId}`,
      token: adminSession.token,
      method: 'PATCH',
      totpCode: generateTotpCode(adminSession.secret),
      body: {
        prizePoolBalance: '25.00',
      },
    });

    const issuedKey = await adminRequest<{
      apiKey: string;
    }>({
      path: `/admin/saas/projects/${projectId}/keys`,
      token: adminSession.token,
      method: 'POST',
      totpCode: generateTotpCode(adminSession.secret),
      body: {
        label: `playwright-${now}`,
        scopes: [...PRIZE_ENGINE_SCOPES],
      },
    });

    await page.goto(`${adminOrigin}/login`);
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);
    await page
      .getByLabel('MFA Code')
      .fill(generateTotpCode(adminSession.secret));
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(
      (url) => url.origin === new URL(adminOrigin).origin && url.pathname !== '/login',
    );

    await page.goto(`${adminOrigin}/saas/webhooks`);
    const createForm = page.getByTestId('saas-outbound-webhook-create-form');
    await expect(createForm).toBeVisible({ timeout: 30_000 });
    const formStepUpCode = generateTotpCode(adminSession.secret);
    await page.locator('input[name="totpCode"]:visible').fill(formStepUpCode);
    await expect(
      createForm.locator('input[type="hidden"][name="totpCode"]'),
    ).toHaveValue(formStepUpCode);
    await createForm.locator('select[name="projectId"]').selectOption(String(projectId));
    await createForm.locator('input[name="url"]').fill(receiver.url);
    await createForm.locator('input[name="secret"]').fill(receiverSecret);
    const createWebhookResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('createOutboundWebhook'),
    );
    await createForm.getByRole('button', { name: 'Create Webhook' }).click();
    const createWebhookResponse = await createWebhookResponsePromise;
    expect(createWebhookResponse.ok()).toBe(true);
    await page.waitForLoadState('networkidle');

    const webhook = await waitForRecord(
      async () => {
        const [row] = await sql<Array<{ id: number }>>`
          select id
          from saas_outbound_webhooks
          where project_id = ${projectId}
            and url = ${receiver.url}
          order by id desc
          limit 1
        `;
        return row ?? null;
      },
      'outbound webhook record',
    );

    const webhookCard = page.getByTestId(
      `saas-outbound-webhook-${webhook.id}`,
    );
    await expect(webhookCard).toContainText(projectName);
    await expect(webhookCard).toContainText('127.0.0.1');
    await expect(webhookCard).toContainText('reward.completed');

    const drawResponse = await requestJson<{
      result: {
        status: string;
        rewardAmount: string;
      };
    }>('/v1/engine/draws?environment=sandbox', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${issuedKey.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        environment: 'sandbox',
        player: {
          playerId: `playwright-webhook-player-${now}`,
          displayName: 'Playwright Webhook Player',
        },
      }),
    });

    expect(drawResponse.response.status).toBe(200);
    expect(drawResponse.body.ok).toBe(true);
    if (!drawResponse.body.ok) {
      throw new Error(
        `Expected successful draw response: ${JSON.stringify(drawResponse.body)}`,
      );
    }
    const drawResult = drawResponse.body.data.result;

    const deliveredRequest = await receiver.waitForRequest();
    expect(deliveredRequest.method).toBe('POST');
    expect(deliveredRequest.url).toBe('/webhooks/reward');
    expect(deliveredRequest.headers['x-reward-webhook-event']).toBe(
      'reward.completed',
    );

    const signatureHeader = deliveredRequest.headers['x-reward-webhook-signature'];
    const signatureMatch = /^t=(\d+),v1=([a-f0-9]+)$/.exec(signatureHeader);
    expect(signatureMatch).toBeTruthy();
    expect(signatureMatch?.[2]).toBe(
      createHmac('sha256', receiverSecret)
        .update(`${signatureMatch?.[1]}.${deliveredRequest.body}`)
        .digest('hex'),
    );

    const deliveredPayload = JSON.parse(deliveredRequest.body) as {
      type: string;
      project: {
        id: number;
        tenantId: number;
      };
      data: {
        result: {
          status: string;
          rewardAmount: string;
        };
      };
    };
    expect(deliveredPayload).toMatchObject({
      type: 'reward.completed',
      project: {
        id: projectId,
        tenantId: tenant.id,
      },
      data: {
        result: {
          status: drawResult.status,
          rewardAmount: drawResult.rewardAmount,
        },
      },
    });

    const deliveredRecord = await waitForRecord(
      async () => {
        const [row] = await sql<
          Array<{
            id: number;
            eventId: string;
            status: string;
            lastHttpStatus: number | null;
            attempts: number;
          }>
        >`
          select
            id,
            event_id as "eventId",
            status,
            last_http_status as "lastHttpStatus",
            attempts
          from saas_outbound_webhook_deliveries
          where project_id = ${projectId}
            and status = 'delivered'
          order by id desc
          limit 1
        `;
        return row ?? null;
      },
      'delivered outbound webhook record',
    );

    expect(deliveredRecord.lastHttpStatus).toBe(202);
    expect(deliveredRecord.attempts).toBe(1);

    await page.reload();
    const deliveryCard = page.getByTestId(
      `saas-outbound-delivery-${deliveredRecord.id}`,
    );
    await expect(deliveryCard).toContainText(projectName);
    await expect(deliveryCard).toContainText(deliveredRecord.eventId);
    await expect(deliveryCard).toContainText('202');
    await expect(deliveryCard).toContainText('delivered');
  } finally {
    await receiver.close().catch(() => undefined);
  }
});
