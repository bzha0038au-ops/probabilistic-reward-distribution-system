// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PredictionMarketSummary } from '@reward/shared-types/prediction-market';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/i18n-provider';
import { getMessages } from '@/lib/i18n/messages';
import { PredictionMarketsPage } from './prediction-markets-page';

const messages = getMessages('en');

const browserUserApiClientMock = vi.hoisted(() => ({
  listPredictionMarkets: vi.fn(),
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

vi.mock('@/lib/api/user-client', () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const buildMarket = (
  id: number,
  overrides?: Partial<PredictionMarketSummary>,
): PredictionMarketSummary => ({
  id,
  slug: `market-${id}`,
  roundKey: `ROUND-${id}`,
  title: `Market ${id}`,
  description: `Description ${id}`,
  resolutionRules: `Rules ${id}`,
  sourceOfTruth: `Source ${id}`,
  category: 'crypto',
  tags: [`tag-${id}`],
  invalidPolicy: 'refund_all',
  mechanism: 'pari_mutuel',
  vigBps: 250,
  status: 'open',
  outcomes: [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
  ],
  outcomePools: [
    {
      outcomeKey: 'yes',
      label: 'Yes',
      totalStakeAmount: `${100 + id}.00`,
      positionCount: 3 + id,
    },
    {
      outcomeKey: 'no',
      label: 'No',
      totalStakeAmount: `${50 + id}.00`,
      positionCount: 1 + id,
    },
  ],
  totalPoolAmount: `${150 + id}.00`,
  winningOutcomeKey: null,
  winningPoolAmount: null,
  oracle: null,
  oracleBinding: null,
  opensAt: '2026-05-01T00:00:00.000Z',
  locksAt: `2026-05-0${id}T00:00:00.000Z`,
  resolvesAt: '2026-06-01T00:00:00.000Z',
  resolvedAt: null,
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  ...overrides,
});

function renderPredictionMarketsPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <PredictionMarketsPage />
    </I18nProvider>,
  );
}

describe('PredictionMarketsPage', () => {
  beforeEach(() => {
    browserUserApiClientMock.listPredictionMarkets.mockResolvedValue(
      ok([
        buildMarket(2, { title: 'BTC above 100k by Friday?' }),
        buildMarket(1, { title: 'ETH ETF Approval before June?' }),
      ]),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('updates the preview panel when a different market is selected', async () => {
    const user = userEvent.setup();

    renderPredictionMarketsPage();

    await waitFor(() => {
      expect(screen.getByTestId('market-preview-panel').textContent).toContain(
        'ETH ETF Approval before June?',
      );
    });

    await user.click(screen.getByTestId('market-summary-2'));

    await waitFor(() => {
      expect(screen.getByTestId('market-preview-panel').textContent).toContain(
        'BTC above 100k by Friday?',
      );
    });
  });
});
