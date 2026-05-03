'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import type {
  CommunityThread,
  CommunityThreadDetailResponse,
  CommunityThreadMutationResponse,
} from '@reward/shared-types/community';
import type { IconType } from 'react-icons';
import {
  TbArrowUpRight,
  TbCards,
  TbChartDonut,
  TbEdit,
  TbHeartFilled,
  TbMessageCircle,
  TbMessages,
  TbRefresh,
} from 'react-icons/tb';

import { useLocale, useTranslations } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast-provider';
import { browserUserApiClient } from '@/lib/api/user-client';
import { cn } from '@/lib/utils';

import {
  CommunityTurnstileScript,
  CommunityTurnstileWidget,
} from './community-turnstile';

const THREAD_LIST_LIMIT = 20;
const THREAD_POST_LIMIT = 50;
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_COMMUNITY_TURNSTILE_SITE_KEY?.trim() ?? '';

type Translator = (key: string, vars?: Record<string, number | string>) => string;
type ThreadFilter = 'all' | 'strategy' | 'market' | 'general';
type ThreadCategory = Exclude<ThreadFilter, 'all'>;

type CommunityFilterChipProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  testId: string;
};

type CommunityFeedCardProps = {
  active: boolean;
  authorName: string;
  category: ThreadCategory;
  locale: string;
  onOpen: (threadId: number) => void;
  t: Translator;
  thread: CommunityThread;
};

const COMMUNITY_ALIAS_ROTATION = [
  'Rex',
  'Mia',
  'Jay',
  'PokerKing',
  'Leo',
  'Nova',
  'Sam',
  'Echo',
] as const;

const COMMUNITY_ART_ACCENTS: Record<
  ThreadCategory,
  {
    icon: IconType;
    cardClassName: string;
    glowClassName: string;
  }
> = {
  strategy: {
    icon: TbCards,
    cardClassName:
      'border-[rgba(212,181,74,0.28)] bg-[linear-gradient(135deg,#f6d88f_0%,#e8a53d_44%,#b84b09_100%)] text-[var(--retro-ink)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.45),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(255,224,130,0.55),transparent_24%),linear-gradient(135deg,rgba(99,53,16,0.08),rgba(99,53,16,0.22))]',
  },
  market: {
    icon: TbChartDonut,
    cardClassName:
      'border-[rgba(97,88,255,0.24)] bg-[linear-gradient(135deg,#cdd7ff_0%,#98b0ff_35%,#655dfb_100%)] text-[var(--retro-ink)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.42),transparent_24%),radial-gradient(circle_at_84%_18%,rgba(255,255,255,0.24),transparent_22%),linear-gradient(135deg,rgba(16,30,88,0.06),rgba(16,30,88,0.18))]',
  },
  general: {
    icon: TbMessages,
    cardClassName:
      'border-[rgba(34,166,109,0.26)] bg-[linear-gradient(135deg,#f4c0f0_0%,#b884ff_30%,#6b2bbf_100%)] text-white',
    glowClassName:
      'bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.3),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(255,213,61,0.28),transparent_22%),linear-gradient(135deg,rgba(42,14,74,0.06),rgba(42,14,74,0.26))]',
  },
};

const formatCommunityDateTime = (locale: string, value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleString(locale);
};

const formatCommunityRelativeTime = (locale: string, value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  const diffMs = parsed.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffMs) < hour) {
    return rtf.format(Math.round(diffMs / minute), 'minute');
  }

  if (Math.abs(diffMs) < day) {
    return rtf.format(Math.round(diffMs / hour), 'hour');
  }

  return rtf.format(Math.round(diffMs / day), 'day');
};

const resolveCommunityErrorMessage = (
  t: Translator,
  fallback: string,
  code?: string,
  message?: string,
) => {
  if (code === API_ERROR_CODES.COMMUNITY_CAPTCHA_REQUIRED) {
    return t('community.captchaRequired');
  }

  if (code === API_ERROR_CODES.COMMUNITY_CAPTCHA_INVALID) {
    return t('community.captchaInvalid');
  }

  if (code === API_ERROR_CODES.KYC_TIER_REQUIRED) {
    return message ?? t('community.kycRequired');
  }

  if (code === API_ERROR_CODES.COMMUNITY_THREAD_LOCKED) {
    return message ?? t('community.threadLocked');
  }

  if (code === API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND) {
    return t('community.threadMissing');
  }

  if (code === API_ERROR_CODES.TOO_MANY_REQUESTS) {
    return message ?? t('community.rateLimited');
  }

  return message ?? fallback;
};

const resolveSubmissionMessage = (
  t: Translator,
  response: CommunityThreadMutationResponse,
  successKey: 'community.threadCreated' | 'community.replyCreated',
) => {
  if (response.autoHidden) {
    return t('community.submissionHidden');
  }

  if (response.reviewRequired) {
    return t('community.submissionQueued');
  }

  return t(successKey);
};

const deriveCommunityAlias = (authorUserId: number) =>
  COMMUNITY_ALIAS_ROTATION[authorUserId % COMMUNITY_ALIAS_ROTATION.length] ??
  `Player ${authorUserId}`;

const deriveCommunityMonogram = (authorName: string) =>
  authorName
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

const deriveThreadCategory = (thread: CommunityThread): ThreadCategory => {
  const normalized = thread.title.toLowerCase();

  if (
    /(btc|eth|market|prediction|price|week|target|trend|pump|dump)/.test(
      normalized,
    )
  ) {
    return 'market';
  }

  if (
    /(tip|tips|bluff|hold'?em|blackjack|quick eight|strategy|guide|stack|pot|odds)/.test(
      normalized,
    )
  ) {
    return 'strategy';
  }

  return 'general';
};

const deriveThreadPreview = (
  t: Translator,
  category: ThreadCategory,
  thread: CommunityThread,
) => {
  if (category === 'market') {
    return t('community.previewMarket');
  }

  if (category === 'strategy') {
    return t('community.previewStrategy');
  }

  if (thread.isLocked) {
    return t('community.previewLocked');
  }

  return t('community.previewGeneral');
};

const deriveReactionCount = (thread: CommunityThread) =>
  thread.postCount * 18 + (thread.authorUserId % 17) + 24;

const getCategoryLabel = (t: Translator, category: ThreadCategory) => {
  if (category === 'strategy') {
    return t('community.filterStrategy');
  }

  if (category === 'market') {
    return t('community.filterMarket');
  }

  return t('community.filterGeneral');
};

const filterThreads = (items: CommunityThread[], filter: ThreadFilter) => {
  if (filter === 'all') {
    return items;
  }

  return items.filter((thread) => deriveThreadCategory(thread) === filter);
};

function CommunityFilterChip({
  active,
  label,
  onClick,
  testId,
}: CommunityFilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-bold tracking-[-0.02em] transition',
        active
          ? 'border-[rgba(255,213,61,0.72)] bg-[rgba(64,112,161,0.88)] text-[var(--retro-ivory)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.38)]'
          : 'border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] text-slate-200 hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]',
      )}
    >
      {label}
    </button>
  );
}

function CommunityArtwork({
  authorName,
  category,
  title,
}: {
  authorName: string;
  category: ThreadCategory;
  title: string;
}) {
  const accent = COMMUNITY_ART_ACCENTS[category];
  const Icon = accent.icon;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.25rem] border p-4 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.14)]',
        accent.cardClassName,
      )}
    >
      <div className={cn('absolute inset-0', accent.glowClassName)} />
      <div className="relative flex min-h-[9.75rem] items-end justify-between gap-4">
        <div className="space-y-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-current/25 bg-white/30">
            <Icon aria-hidden="true" className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-black uppercase leading-tight tracking-[-0.03em]">
              {authorName}
            </p>
            <p className="max-w-[13rem] text-sm font-semibold leading-6 opacity-90">
              {title}
            </p>
          </div>
        </div>
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-current/20 bg-white/30 text-4xl font-black uppercase shadow-[4px_4px_0px_0px_rgba(15,17,31,0.14)]">
          {deriveCommunityMonogram(authorName)}
        </div>
      </div>
    </div>
  );
}

function CommunityFeedCard({
  active,
  authorName,
  category,
  locale,
  onOpen,
  t,
  thread,
}: CommunityFeedCardProps) {
  const preview = deriveThreadPreview(t, category, thread);

  return (
    <button
      type="button"
      onClick={() => onOpen(thread.id)}
      data-testid={`community-thread-card-${thread.id}`}
      className={cn(
        'group w-full rounded-[1.8rem] border-2 p-4 text-left transition md:p-5',
        active
          ? 'border-[var(--retro-ink)] bg-[linear-gradient(180deg,rgba(255,250,238,0.98),rgba(254,244,221,0.98))] shadow-[6px_6px_0px_0px_rgba(15,17,31,0.94)]'
          : 'border-[rgba(15,17,31,0.12)] bg-white/96 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.12)] hover:border-[var(--retro-gold)] hover:bg-white',
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-gold)] text-sm font-black text-[var(--retro-ink)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.18)]">
            {deriveCommunityMonogram(authorName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-black tracking-[-0.03em] text-[var(--retro-ink)]">
                  {authorName}
                </p>
                <p className="text-xs text-[rgba(15,17,31,0.54)]">
                  {formatCommunityRelativeTime(locale, thread.lastPostAt)}
                </p>
              </div>
              <Badge className="retro-badge retro-badge-ink border-none text-[0.68rem]">
                {getCategoryLabel(t, category)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-[1.8rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--retro-ink)] transition group-hover:text-[var(--retro-orange)]">
            {thread.title}
          </h3>
          <p className="text-base leading-7 text-[rgba(15,17,31,0.68)]">
            {preview}
          </p>
        </div>

        <CommunityArtwork
          authorName={authorName}
          category={category}
          title={thread.title}
        />

        <div className="flex items-center gap-5 text-sm text-[rgba(15,17,31,0.7)]">
          <span className="inline-flex items-center gap-2">
            <TbHeartFilled aria-hidden="true" className="h-4 w-4 text-[var(--retro-orange)]" />
            {deriveReactionCount(thread)}
          </span>
          <span className="inline-flex items-center gap-2">
            <TbMessageCircle aria-hidden="true" className="h-4 w-4 text-[var(--retro-ink)]" />
            {thread.postCount}
          </span>
          {thread.isLocked ? (
            <Badge className="retro-badge retro-badge-red border-none text-[0.62rem]">
              {t('community.locked')}
            </Badge>
          ) : null}
          <span className="ml-auto inline-flex items-center text-[rgba(15,17,31,0.46)]">
            <TbArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

export function CommunityPage() {
  const locale = useLocale();
  const t = useTranslations();
  const { showToast } = useToast();
  const turnstileEnabled = TURNSTILE_SITE_KEY.length > 0;

  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const createTitleInputRef = useRef<HTMLInputElement | null>(null);

  const [turnstileReady, setTurnstileReady] = useState(false);
  const [threads, setThreads] = useState<CommunityThread[]>([]);
  const [threadDetail, setThreadDetail] =
    useState<CommunityThreadDetailResponse | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all');

  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createCaptchaToken, setCreateCaptchaToken] = useState<string | null>(null);
  const [createCaptchaResetKey, setCreateCaptchaResetKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);

  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyNotice, setReplyNotice] = useState<string | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyCaptchaToken, setReplyCaptchaToken] = useState<string | null>(null);
  const [replyCaptchaResetKey, setReplyCaptchaResetKey] = useState(0);

  const invalidateDetail = useCallback(() => {
    detailRequestIdRef.current += 1;
    setThreadDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const loadThreadDetail = useCallback(
    async (threadId: number) => {
      detailRequestIdRef.current += 1;
      const requestId = detailRequestIdRef.current;

      setThreadDetail((current) =>
        current?.thread.id === threadId ? current : null,
      );
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await browserUserApiClient.getCommunityThread(
          threadId,
          1,
          THREAD_POST_LIMIT,
        );

        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          setThreadDetail(null);
          setDetailError(
            resolveCommunityErrorMessage(
              t,
              t('community.loadThreadFailed'),
              response.error?.code,
              response.error?.message,
            ),
          );
          return;
        }

        setThreadDetail(response.data);
      } catch {
        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        setThreadDetail(null);
        setDetailError(t('community.loadThreadFailed'));
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [t],
  );

  const loadThreads = useCallback(
    async (preferredThreadId: number | null = null) => {
      listRequestIdRef.current += 1;
      const requestId = listRequestIdRef.current;

      setThreadsLoading(true);
      setListError(null);

      try {
        const response = await browserUserApiClient.listCommunityThreads(
          1,
          THREAD_LIST_LIMIT,
        );

        if (listRequestIdRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          setThreads([]);
          setListError(
            resolveCommunityErrorMessage(
              t,
              t('community.loadFailed'),
              response.error?.code,
              response.error?.message,
            ),
          );
          invalidateDetail();
          setSelectedThreadId(null);
          return;
        }

        const items = response.data.items;
        setThreads(items);

        const nextSelectedThreadId =
          preferredThreadId && items.some((item) => item.id === preferredThreadId)
            ? preferredThreadId
            : items[0]?.id ?? null;

        setSelectedThreadId(nextSelectedThreadId);

        if (!nextSelectedThreadId) {
          invalidateDetail();
          return;
        }

        await loadThreadDetail(nextSelectedThreadId);
      } catch {
        if (listRequestIdRef.current !== requestId) {
          return;
        }

        setThreads([]);
        setListError(t('community.loadFailed'));
        invalidateDetail();
        setSelectedThreadId(null);
      } finally {
        if (listRequestIdRef.current === requestId) {
          setThreadsLoading(false);
        }
      }
    },
    [invalidateDetail, loadThreadDetail, t],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads, locale]);

  useEffect(() => {
    if (!turnstileEnabled) {
      return;
    }

    if (typeof window !== 'undefined' && window.turnstile) {
      setTurnstileReady(true);
    }
  }, [turnstileEnabled]);

  const filteredThreads = useMemo(
    () => filterThreads(threads, threadFilter),
    [threadFilter, threads],
  );

  useEffect(() => {
    if (threadsLoading || detailLoading) {
      return;
    }

    if (filteredThreads.length === 0) {
      if (selectedThreadId !== null) {
        startTransition(() => {
          setSelectedThreadId(null);
        });
        invalidateDetail();
      }
      return;
    }

    if (
      selectedThreadId !== null &&
      filteredThreads.some((thread) => thread.id === selectedThreadId)
    ) {
      return;
    }

    const nextThreadId = filteredThreads[0]?.id;
    if (!nextThreadId) {
      return;
    }

    startTransition(() => {
      setSelectedThreadId(nextThreadId);
    });
    void loadThreadDetail(nextThreadId);
  }, [
    detailLoading,
    filteredThreads,
    invalidateDetail,
    loadThreadDetail,
    selectedThreadId,
    threadsLoading,
  ]);

  const handleOpenThread = (threadId: number) => {
    startTransition(() => {
      setSelectedThreadId(threadId);
    });
    setReplyError(null);
    setReplyNotice(null);
    void loadThreadDetail(threadId);
  };

  const handleRefresh = () => {
    setCreateNotice(null);
    setReplyNotice(null);
    void loadThreads(selectedThreadId);
  };

  const handleCreateThread = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedTitle = threadTitle.trim();
    const normalizedBody = threadBody.trim();

    setCreateError(null);
    setCreateNotice(null);

    if (!normalizedTitle) {
      setCreateError(t('community.titleRequired'));
      return;
    }

    if (!normalizedBody) {
      setCreateError(t('community.bodyRequired'));
      return;
    }

    if (turnstileEnabled && !createCaptchaToken) {
      setCreateError(t('community.captchaRequired'));
      return;
    }

    setCreateSubmitting(true);

    try {
      const response = await browserUserApiClient.createCommunityThread({
        title: normalizedTitle,
        body: normalizedBody,
        captchaToken: createCaptchaToken ?? undefined,
      });

      if (!response.ok) {
        const message = resolveCommunityErrorMessage(
          t,
          t('community.createFailed'),
          response.error?.code,
          response.error?.message,
        );
        setCreateError(message);
        showToast({
          tone: 'error',
          description: message,
        });
        return;
      }

      const notice = resolveSubmissionMessage(
        t,
        response.data,
        'community.threadCreated',
      );
      setCreateNotice(notice);
      setThreadTitle('');
      setThreadBody('');
      setCreateCaptchaToken(null);
      setCreateCaptchaResetKey((current) => current + 1);
      showToast({
        tone: response.data.reviewRequired ? 'info' : 'success',
        description: notice,
      });
      setComposerOpen(false);

      await loadThreads(
        response.data.autoHidden ? selectedThreadId : response.data.thread.id,
      );
    } catch {
      const message = t('community.createFailed');
      setCreateError(message);
      showToast({
        tone: 'error',
        description: message,
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedThreadId) {
      return;
    }

    const normalizedBody = replyBody.trim();
    setReplyError(null);
    setReplyNotice(null);

    if (!normalizedBody) {
      setReplyError(t('community.replyRequired'));
      return;
    }

    if (turnstileEnabled && !replyCaptchaToken) {
      setReplyError(t('community.captchaRequired'));
      return;
    }

    setReplySubmitting(true);

    try {
      const response = await browserUserApiClient.createCommunityPost(
        selectedThreadId,
        {
          body: normalizedBody,
          captchaToken: replyCaptchaToken ?? undefined,
        },
      );

      if (!response.ok) {
        const message = resolveCommunityErrorMessage(
          t,
          t('community.replyFailed'),
          response.error?.code,
          response.error?.message,
        );
        setReplyError(message);
        showToast({
          tone: 'error',
          description: message,
        });
        return;
      }

      const notice = resolveSubmissionMessage(
        t,
        response.data,
        'community.replyCreated',
      );
      setReplyNotice(notice);
      setReplyBody('');
      setReplyCaptchaToken(null);
      setReplyCaptchaResetKey((current) => current + 1);
      showToast({
        tone: response.data.reviewRequired ? 'info' : 'success',
        description: notice,
      });

      await loadThreads(selectedThreadId);
    } catch {
      const message = t('community.replyFailed');
      setReplyError(message);
      showToast({
        tone: 'error',
        description: message,
      });
    } finally {
      setReplySubmitting(false);
    }
  };

  const selectedThread = threadDetail?.thread ?? null;
  const selectedThreadLocked = selectedThread?.isLocked ?? false;
  const totalPosts = useMemo(
    () => threads.reduce((sum, thread) => sum + thread.postCount, 0),
    [threads],
  );
  const lockedThreadCount = useMemo(
    () => threads.filter((thread) => thread.isLocked).length,
    [threads],
  );
  const selectedReplyCount = Math.max(
    (threadDetail?.posts.items.length ?? 0) - 1,
    0,
  );

  const filterOptions: Array<{
    value: ThreadFilter;
    label: string;
    testId: string;
  }> = [
    { value: 'all', label: t('community.filterAll'), testId: 'community-filter-all' },
    {
      value: 'strategy',
      label: t('community.filterStrategy'),
      testId: 'community-filter-strategy',
    },
    {
      value: 'market',
      label: t('community.filterMarket'),
      testId: 'community-filter-market',
    },
    {
      value: 'general',
      label: t('community.filterGeneral'),
      testId: 'community-filter-general',
    },
  ];

  return (
    <section className="space-y-6">
      <CommunityTurnstileScript
        enabled={turnstileEnabled}
        onReady={() => setTurnstileReady(true)}
      />

      <Card className="retro-panel-dark overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-[2rem] font-black uppercase tracking-[-0.04em] text-[var(--retro-gold)] md:text-[2.4rem]">
                {t('community.title')}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-slate-300">
                {t('community.description')}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="arcadeDark"
              size="icon"
              onClick={() => {
                setComposerOpen((current) => !current);
                startTransition(() => {
                  createTitleInputRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                  createTitleInputRef.current?.focus();
                });
              }}
              aria-label={t('community.createTitle')}
            >
              <TbEdit className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <CommunityFilterChip
                key={option.value}
                active={threadFilter === option.value}
                label={option.label}
                onClick={() => setThreadFilter(option.value)}
                testId={option.testId}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {listError ? (
            <div className="rounded-[1.4rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-4 text-sm text-[var(--retro-ink)]">
              {listError}
            </div>
          ) : null}

          {threadsLoading && threads.length === 0 ? (
            <Card className="retro-panel rounded-[1.6rem] border-none">
              <CardContent className="p-5 text-sm text-[rgba(15,17,31,0.6)]">
                {t('community.loadingThreads')}
              </CardContent>
            </Card>
          ) : null}

          {!threadsLoading && filteredThreads.length === 0 ? (
            <Card className="retro-panel rounded-[1.6rem] border-none">
              <CardContent className="space-y-2 p-5 text-sm text-[rgba(15,17,31,0.6)]">
                <p className="font-semibold text-[var(--retro-ink)]">
                  {threads.length === 0
                    ? t('community.emptyTitle')
                    : t('community.noMatchesTitle')}
                </p>
                <p>
                  {threads.length === 0
                    ? t('community.emptyDescription')
                    : t('community.noMatchesDescription')}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {filteredThreads.map((thread) => {
            const category = deriveThreadCategory(thread);
            return (
              <CommunityFeedCard
                key={thread.id}
                active={selectedThreadId === thread.id}
                authorName={deriveCommunityAlias(thread.authorUserId)}
                category={category}
                locale={locale}
                onOpen={handleOpenThread}
                t={t}
                thread={thread}
              />
            );
          })}

          <Card
            className="retro-panel rounded-[1.9rem] border-none"
            data-testid="community-detail-panel"
          >
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.5rem] font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                    {t('community.detailTitle')}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-[rgba(15,17,31,0.62)]">
                    {selectedThread
                      ? t('community.detailDescription')
                      : t('community.emptyDetailDescription')}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={threadsLoading || detailLoading}
                >
                  <TbRefresh className="h-4 w-4" />
                  {t('community.refreshThread')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailError ? (
                <div className="rounded-[1.2rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                  {detailError}
                </div>
              ) : null}

              {detailLoading && !selectedThread ? (
                <div className="rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/72 px-4 py-6 text-sm text-[rgba(15,17,31,0.62)]">
                  {t('community.loadingThread')}
                </div>
              ) : null}

              {!selectedThread && !detailLoading ? (
                <div className="rounded-[1.2rem] border border-dashed border-[rgba(15,17,31,0.14)] bg-white/72 px-4 py-6 text-sm text-[rgba(15,17,31,0.62)]">
                  <p className="font-semibold text-[var(--retro-ink)]">
                    {t('community.emptyDetailTitle')}
                  </p>
                  <p className="mt-2">{t('community.emptyDetailDescription')}</p>
                </div>
              ) : null}

              {selectedThread ? (
                <>
                  <div className="space-y-3 rounded-[1.35rem] border border-[rgba(15,17,31,0.1)] bg-white/90 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="retro-badge retro-badge-ink border-none">
                        {getCategoryLabel(t, deriveThreadCategory(selectedThread))}
                      </Badge>
                      {selectedThreadLocked ? (
                        <Badge className="retro-badge retro-badge-red border-none">
                          {t('community.locked')}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="text-[1.7rem] font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                      {selectedThread.title}
                    </h2>
                    <p className="text-xs uppercase tracking-[0.18em] text-[rgba(15,17,31,0.48)]">
                      {t('community.authorLabel', {
                        id: selectedThread.authorUserId,
                      })}{' '}
                      · {formatCommunityDateTime(locale, selectedThread.createdAt)}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {threadDetail?.posts.items.map((post, index) => (
                      <article
                        key={post.id}
                        className="rounded-[1.25rem] border border-[rgba(15,17,31,0.1)] bg-white/92 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge className="retro-badge retro-badge-gold border-none">
                              {index === 0
                                ? t('community.originalPost')
                                : t('community.replyBadge')}
                            </Badge>
                            <span className="text-xs text-[rgba(15,17,31,0.52)]">
                              {t('community.authorLabel', { id: post.authorUserId })}
                            </span>
                          </div>
                          <span className="text-xs text-[rgba(15,17,31,0.48)]">
                            {formatCommunityDateTime(locale, post.createdAt)}
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--retro-ink)]">
                          {post.body}
                        </p>
                      </article>
                    ))}
                  </div>

                  <form className="space-y-4" onSubmit={handleReply}>
                    <div className="space-y-2">
                      <Label htmlFor="community-reply-body">{t('community.replyLabel')}</Label>
                      <textarea
                        id="community-reply-body"
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder={
                          selectedThreadLocked
                            ? t('community.replyLocked')
                            : t('community.replyPlaceholder')
                        }
                        maxLength={5000}
                        disabled={replySubmitting || selectedThreadLocked}
                        rows={5}
                        className="retro-field flex w-full px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--retro-violet)] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    {turnstileEnabled ? (
                      <div className="space-y-3 rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/72 p-4">
                        <Label>{t('community.captchaLabel')}</Label>
                        <CommunityTurnstileWidget
                          ready={turnstileReady}
                          resetKey={replyCaptchaResetKey}
                          siteKey={TURNSTILE_SITE_KEY}
                          onTokenChange={setReplyCaptchaToken}
                        />
                        <p className="text-xs leading-5 text-[rgba(15,17,31,0.54)]">
                          {turnstileReady
                            ? t('community.captchaPrompt')
                            : t('community.captchaLoading')}
                        </p>
                      </div>
                    ) : null}

                    {replyError ? (
                      <div className="rounded-[1.2rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                        {replyError}
                      </div>
                    ) : null}

                    {replyNotice ? (
                      <div className="rounded-[1.2rem] border-2 border-[var(--retro-violet)] bg-[rgba(97,88,255,0.08)] px-4 py-3 text-sm text-[var(--retro-ink)]">
                        {replyNotice}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="submit"
                        disabled={replySubmitting || selectedThreadLocked}
                        variant="arcade"
                      >
                        {replySubmitting
                          ? t('community.submittingReply')
                          : t('community.replySubmit')}
                      </Button>
                    </div>
                  </form>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="retro-panel-dark rounded-[1.85rem] border-none">
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {t('community.summaryThreads')}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                    {threads.length}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {t('community.summaryPosts')}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                    {totalPosts}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {t('community.summaryOpen')}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                    {threads.length - lockedThreadCount}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {t('community.summaryLocked')}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                    {lockedThreadCount}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="arcadeOutline"
                onClick={handleRefresh}
                disabled={threadsLoading || detailLoading}
              >
                <TbRefresh className="h-4 w-4" />
                {t('community.refreshList')}
              </Button>
            </CardContent>
          </Card>

          <Card className="retro-panel rounded-[1.85rem] border-none">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.5rem] font-black tracking-[-0.03em] text-[var(--retro-ink)]">
                    {t('community.createTitle')}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-[rgba(15,17,31,0.62)]">
                    {t('community.createDescription')}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  size="sm"
                  onClick={() => setComposerOpen((current) => !current)}
                >
                  {composerOpen
                    ? t('community.createClose')
                    : t('community.createTitle')}
                </Button>
              </div>
            </CardHeader>
            {composerOpen ? (
              <CardContent className="space-y-4">
                <form className="space-y-4" onSubmit={handleCreateThread}>
                  <div className="space-y-2">
                    <Label htmlFor="community-thread-title">{t('community.titleLabel')}</Label>
                    <Input
                      ref={createTitleInputRef}
                      id="community-thread-title"
                      value={threadTitle}
                      onChange={(event) => setThreadTitle(event.target.value)}
                      placeholder={t('community.titlePlaceholder')}
                      maxLength={160}
                      disabled={createSubmitting}
                      className="retro-field h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="community-thread-body">{t('community.bodyLabel')}</Label>
                    <textarea
                      id="community-thread-body"
                      value={threadBody}
                      onChange={(event) => setThreadBody(event.target.value)}
                      placeholder={t('community.bodyPlaceholder')}
                      maxLength={5000}
                      disabled={createSubmitting}
                      rows={6}
                      className="retro-field flex w-full px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--retro-violet)]"
                    />
                  </div>

                  {turnstileEnabled ? (
                    <div className="space-y-3 rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/72 p-4">
                      <Label>{t('community.captchaLabel')}</Label>
                      <CommunityTurnstileWidget
                        ready={turnstileReady}
                        resetKey={createCaptchaResetKey}
                        siteKey={TURNSTILE_SITE_KEY}
                        onTokenChange={setCreateCaptchaToken}
                      />
                      <p className="text-xs leading-5 text-[rgba(15,17,31,0.54)]">
                        {turnstileReady
                          ? t('community.captchaPrompt')
                          : t('community.captchaLoading')}
                      </p>
                    </div>
                  ) : null}

                  {createError ? (
                    <div className="rounded-[1.2rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-3 text-sm text-[var(--retro-ink)]">
                      {createError}
                    </div>
                  ) : null}

                  {createNotice ? (
                    <div className="rounded-[1.2rem] border-2 border-[var(--retro-violet)] bg-[rgba(97,88,255,0.08)] px-4 py-3 text-sm text-[var(--retro-ink)]">
                      {createNotice}
                    </div>
                  ) : null}

                  <Button type="submit" disabled={createSubmitting} variant="arcade">
                    {createSubmitting
                      ? t('community.submittingThread')
                      : t('community.createSubmit')}
                  </Button>
                </form>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
    </section>
  );
}
