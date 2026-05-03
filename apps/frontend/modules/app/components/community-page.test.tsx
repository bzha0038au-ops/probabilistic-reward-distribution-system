// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CommunityThread,
  CommunityThreadDetailResponse,
} from '@reward/shared-types/community';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/i18n-provider';
import { getMessages } from '@/lib/i18n/messages';
import { CommunityPage } from './community-page';

const messages = getMessages('en');

const browserUserApiClientMock = vi.hoisted(() => ({
  listCommunityThreads: vi.fn(),
  getCommunityThread: vi.fn(),
  createCommunityThread: vi.fn(),
  createCommunityPost: vi.fn(),
}));

const showToastMock = vi.fn();

vi.mock('@/lib/api/user-client', () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

vi.mock('@/components/ui/toast-provider', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock('./community-turnstile', () => ({
  CommunityTurnstileScript: () => null,
  CommunityTurnstileWidget: () => <div data-testid="mock-turnstile" />,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const buildThread = (
  id: number,
  overrides?: Partial<CommunityThread>,
): CommunityThread => ({
  id,
  authorUserId: 100 + id,
  title: `Thread ${id}`,
  status: 'visible',
  isLocked: false,
  postCount: 2 + id,
  lastPostAt: `2026-05-0${id}T10:00:00.000Z`,
  lockedAt: null,
  hiddenAt: null,
  createdAt: `2026-05-0${id}T09:00:00.000Z`,
  updatedAt: `2026-05-0${id}T10:00:00.000Z`,
  ...overrides,
});

const threads: CommunityThread[] = [
  buildThread(1, { title: 'Open strategy board', postCount: 6 }),
  buildThread(2, { title: 'Locked fairness thread', isLocked: true, lockedAt: '2026-05-02T09:30:00.000Z' }),
  buildThread(3, { title: 'Market watchlist', postCount: 9 }),
];

const details = new Map<number, CommunityThreadDetailResponse>([
  [
    1,
    {
      thread: threads[0],
      posts: {
        items: [
          {
            id: 11,
            threadId: 1,
            authorUserId: 101,
            body: 'Opening take for thread one.',
            status: 'visible',
            hiddenAt: null,
            deletedAt: null,
            createdAt: '2026-05-01T09:00:00.000Z',
            updatedAt: '2026-05-01T09:00:00.000Z',
          },
          {
            id: 12,
            threadId: 1,
            authorUserId: 202,
            body: 'Reply on thread one.',
            status: 'visible',
            hiddenAt: null,
            deletedAt: null,
            createdAt: '2026-05-01T09:30:00.000Z',
            updatedAt: '2026-05-01T09:30:00.000Z',
          },
        ],
        page: 1,
        limit: 50,
        hasNext: false,
      },
    },
  ],
  [
    2,
    {
      thread: threads[1],
      posts: {
        items: [
          {
            id: 21,
            threadId: 2,
            authorUserId: 102,
            body: 'Locked thread opening post.',
            status: 'visible',
            hiddenAt: null,
            deletedAt: null,
            createdAt: '2026-05-02T09:00:00.000Z',
            updatedAt: '2026-05-02T09:00:00.000Z',
          },
        ],
        page: 1,
        limit: 50,
        hasNext: false,
      },
    },
  ],
  [
    3,
    {
      thread: threads[2],
      posts: {
        items: [
          {
            id: 31,
            threadId: 3,
            authorUserId: 103,
            body: 'Market thread opening post.',
            status: 'visible',
            hiddenAt: null,
            deletedAt: null,
            createdAt: '2026-05-03T09:00:00.000Z',
            updatedAt: '2026-05-03T09:00:00.000Z',
          },
          {
            id: 32,
            threadId: 3,
            authorUserId: 204,
            body: 'Second reply for thread three.',
            status: 'visible',
            hiddenAt: null,
            deletedAt: null,
            createdAt: '2026-05-03T09:40:00.000Z',
            updatedAt: '2026-05-03T09:40:00.000Z',
          },
        ],
        page: 1,
        limit: 50,
        hasNext: false,
      },
    },
  ],
]);

function renderCommunityPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <CommunityPage />
    </I18nProvider>,
  );
}

describe('CommunityPage', () => {
  beforeEach(() => {
    browserUserApiClientMock.listCommunityThreads.mockResolvedValue(
      ok({
        items: threads,
        page: 1,
        limit: 20,
        hasNext: false,
      }),
    );
    browserUserApiClientMock.getCommunityThread.mockImplementation(
      async (threadId: number) => ok(details.get(threadId)!),
    );
    browserUserApiClientMock.createCommunityThread.mockResolvedValue(ok({}));
    browserUserApiClientMock.createCommunityPost.mockResolvedValue(ok({}));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('switches the detail panel to the market thread when the market filter is selected', async () => {
    const user = userEvent.setup();

    renderCommunityPage();

    const detailPanel = await screen.findByTestId('community-detail-panel');

    await waitFor(() => {
      expect(within(detailPanel).queryByText('Open strategy board')).not.toBeNull();
    });

    await user.click(screen.getByTestId('community-filter-market'));

    await waitFor(() => {
      expect(screen.queryByTestId('community-thread-card-1')).toBeNull();
      expect(screen.queryByTestId('community-thread-card-2')).toBeNull();
      expect(screen.queryByTestId('community-thread-card-3')).not.toBeNull();
      expect(within(detailPanel).queryByText('Market watchlist')).not.toBeNull();
    });
  });

  it('loads a different thread into the detail panel when a new thread card is opened', async () => {
    const user = userEvent.setup();

    renderCommunityPage();

    const detailPanel = await screen.findByTestId('community-detail-panel');

    await waitFor(() => {
      expect(within(detailPanel).queryByText('Open strategy board')).not.toBeNull();
    });

    await user.click(screen.getByTestId('community-thread-card-3'));

    await waitFor(() => {
      expect(within(detailPanel).queryByText('Market watchlist')).not.toBeNull();
      expect(
        within(detailPanel).queryByText('Second reply for thread three.'),
      ).not.toBeNull();
      expect(browserUserApiClientMock.getCommunityThread).toHaveBeenCalledWith(
        3,
        1,
        50,
      );
    });
  });
});
