import { expect, test } from '@playwright/test';

const saasStatusBaseUrl = process.env.PLAYWRIGHT_SAAS_STATUS_BASE_URL;

if (!saasStatusBaseUrl) {
  throw new Error('PLAYWRIGHT_SAAS_STATUS_BASE_URL must be set for e2e tests.');
}

test('saas status page renders aggregated runtime health without crashing', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.goto(saasStatusBaseUrl);

  await expect(
    page.getByRole('heading', {
      name: 'Public runtime health for the prize engine control plane.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Reward SaaS Status').first()).toBeVisible();
  await expect(page.getByText(/Last sampled .* UTC/)).toBeVisible();
  await expect(
    page.getByText('Public status data is temporarily unavailable.'),
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
