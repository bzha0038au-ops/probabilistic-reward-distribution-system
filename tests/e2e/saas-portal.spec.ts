import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL;
const portalBaseUrl = process.env.PLAYWRIGHT_PORTAL_BASE_URL;

const TEST_BIRTH_DATE = '1990-01-01';

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set for e2e tests.');
}

if (!apiBaseUrl) {
  throw new Error('PLAYWRIGHT_API_BASE_URL must be set for e2e tests.');
}

if (!portalBaseUrl) {
  throw new Error('PLAYWRIGHT_PORTAL_BASE_URL must be set for e2e tests.');
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { message?: string; code?: string }; requestId?: string };

type CurrentLegalDocumentsResponse = {
  items: Array<{
    id: number;
    slug: string;
    version: string;
  }>;
};

const readBody = async <T>(response: Response) =>
  (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

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

const registerPortalUser = async (email: string, password: string) => {
  const legalDocuments = await expectOk<CurrentLegalDocumentsResponse>(
    '/legal/current',
  );

  const { response, body } = await requestJson<{ email: string }>(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        birthDate: TEST_BIRTH_DATE,
        legalAcceptances: legalDocuments.items.map((document) => ({
          slug: document.slug,
          version: document.version,
        })),
      }),
    },
  );

  if (!response.ok || !body.ok) {
    throw new Error(
      `Failed to register portal user: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  await sql`
    update users
    set email_verified_at = now(), updated_at = now()
    where email = ${email}
  `;
};

const waitForReportExportCompletion = async (tenantId: number) => {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const [job] = await sql<Array<{ status: string; last_error: string | null }>>`
      select status, last_error
      from saas_report_exports
      where tenant_id = ${tenantId}
      order by id desc
      limit 1
    `;

    if (job?.status === 'completed') {
      return;
    }

    if (job?.status === 'failed') {
      throw new Error(
        `SaaS portal report export failed${job.last_error ? `: ${job.last_error}` : '.'}`,
      );
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for SaaS portal report export for tenant ${tenantId}.`);
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('portal operator can create a workspace, issue a key, and queue an audit export', async ({
  page,
}) => {
  const email = `portal-playwright-${Date.now()}@example.com`;
  const password = 'Password123!';
  const workspaceName = 'Playwright Portal Workspace';
  const keyLabel = 'Portal regression key';

  await registerPortalUser(email, password);

  await page.goto(`${portalBaseUrl}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/portal(?:\?|$)/);
  await expect(page.getByTestId('portal-dashboard-ready')).toBeVisible();
  await expect(page.getByText('Create your first workspace')).toBeVisible();

  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByLabel('Billing email').fill('ops@playwright-portal.example');
  await page.getByRole('button', { name: 'Create workspace' }).click();

  await expect(
    page.getByText('Workspace created. Your sandbox starter key is ready.'),
  ).toBeVisible();
  await expect(page.getByText('Newly issued API key')).toBeVisible();
  await expect(page).toHaveURL(/tenant=\d+/);
  await expect(page).toHaveURL(/project=\d+/);

  const currentUrl = new URL(page.url());
  const tenantId = Number(currentUrl.searchParams.get('tenant'));
  const projectId = Number(currentUrl.searchParams.get('project'));
  const scopedQuery = currentUrl.search;

  expect(Number.isInteger(tenantId) && tenantId > 0).toBe(true);
  expect(Number.isInteger(projectId) && projectId > 0).toBe(true);
  await expect(page.getByLabel('Tenant')).toHaveValue(String(tenantId));
  await expect(page.getByLabel('Project')).toHaveValue(String(projectId));

  await page.goto(`${portalBaseUrl}/portal/keys${scopedQuery}`);
  await expect(page.getByTestId('portal-dashboard-ready')).toBeVisible();
  await expect(page.getByText('API key management')).toBeVisible();
  await page.getByLabel('Key label').fill(keyLabel);
  await page.getByRole('button', { name: 'Issue key' }).click();

  await expect(page.getByText('API key issued.')).toBeVisible();
  await expect(page.getByRole('table').getByText(keyLabel)).toBeVisible();

  await page.goto(`${portalBaseUrl}/portal/reports${scopedQuery}`);
  await expect(page.getByTestId('portal-dashboard-ready')).toBeVisible();
  await expect(page.getByText('Queue audit export')).toBeVisible();
  await page.getByRole('button', { name: 'Queue export' }).click();

  await expect(page.getByText('Report export queued.')).toBeVisible();
  await waitForReportExportCompletion(tenantId);

  await page.reload();
  await expect(page.getByText('Recent export jobs')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();

  await page.goto(`${portalBaseUrl}/portal/docs${scopedQuery}`);
  await expect(page.getByTestId('portal-dashboard-ready')).toBeVisible();
  await expect(page.getByText('Docs and SDK handoff')).toBeVisible();
  await expect(page.getByText('Copy-and-run sandbox snippet')).toBeVisible();
});
