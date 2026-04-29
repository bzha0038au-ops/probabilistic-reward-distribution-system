'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import type {
  CommunityThread,
  CommunityThreadDetailResponse,
  CommunityThreadMutationResponse,
} from '@reward/shared-types/community';

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

const formatCommunityDateTime = (locale: string, value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleString(locale);
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

const renderThreadMeta = (t: Translator, thread: CommunityThread) => [
  t('community.postCount', { count: thread.postCount }),
  t('community.authorLabel', { id: thread.authorUserId }),
];

export function CommunityPage() {
  const locale = useLocale();
  const t = useTranslations();
  const { showToast } = useToast();
  const turnstileEnabled = TURNSTILE_SITE_KEY.length > 0;

  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const [turnstileReady, setTurnstileReady] = useState(false);
  const [threads, setThreads] = useState<CommunityThread[]>([]);
  const [threadDetail, setThreadDetail] =
    useState<CommunityThreadDetailResponse | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createCaptchaToken, setCreateCaptchaToken] = useState<string | null>(null);
  const [createCaptchaResetKey, setCreateCaptchaResetKey] = useState(0);

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

  const loadThreadDetail = useCallback(async (threadId: number) => {
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
  }, [t]);

  const loadThreads = useCallback(async (preferredThreadId: number | null = null) => {
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
  }, [invalidateDetail, loadThreadDetail, t]);

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

  const handleOpenThread = (threadId: number) => {
    setSelectedThreadId(threadId);
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

      await loadThreads(response.data.autoHidden ? selectedThreadId : response.data.thread.id);
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

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
      <CommunityTurnstileScript
        enabled={turnstileEnabled}
        onReady={() => setTurnstileReady(true)}
      />

      <div className="space-y-6">
        <Card className="border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_42%),rgba(255,255,255,0.04)] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-3xl">{t('community.title')}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
              {t('community.description')}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-cyan-300/30 bg-cyan-400/12 text-cyan-50 hover:bg-cyan-400/12">
                {t('community.antiSpamBadge')}
              </Badge>
              <Badge className="border-amber-300/30 bg-amber-400/12 text-amber-50 hover:bg-amber-400/12">
                {t('community.reviewBadge')}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]">
          <CardHeader>
            <CardTitle>{t('community.createTitle')}</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              {t('community.createDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreateThread}>
              <div className="space-y-2">
                <Label htmlFor="community-thread-title" className="text-slate-100">
                  {t('community.titleLabel')}
                </Label>
                <Input
                  id="community-thread-title"
                  value={threadTitle}
                  onChange={(event) => setThreadTitle(event.target.value)}
                  placeholder={t('community.titlePlaceholder')}
                  maxLength={160}
                  disabled={createSubmitting}
                  className="rounded-2xl border-white/10 bg-slate-950/50 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="community-thread-body" className="text-slate-100">
                  {t('community.bodyLabel')}
                </Label>
                <textarea
                  id="community-thread-body"
                  value={threadBody}
                  onChange={(event) => setThreadBody(event.target.value)}
                  placeholder={t('community.bodyPlaceholder')}
                  maxLength={5000}
                  disabled={createSubmitting}
                  rows={6}
                  className="flex w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                />
              </div>

              {turnstileEnabled ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <Label className="text-slate-100">
                    {t('community.captchaLabel')}
                  </Label>
                  <CommunityTurnstileWidget
                    ready={turnstileReady}
                    resetKey={createCaptchaResetKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onTokenChange={setCreateCaptchaToken}
                  />
                  <p className="text-xs leading-5 text-slate-400">
                    {turnstileReady
                      ? t('community.captchaPrompt')
                      : t('community.captchaLoading')}
                  </p>
                </div>
              ) : null}

              {createError ? (
                <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm text-rose-50">
                  {createError}
                </div>
              ) : null}

              {createNotice ? (
                <div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm text-cyan-50">
                  {createNotice}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                >
                  {createSubmitting
                    ? t('community.submittingThread')
                    : t('community.createSubmit')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={threadsLoading || detailLoading}
                  className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                >
                  {t('community.refreshList')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]">
          <CardHeader>
            <CardTitle>{t('community.listTitle')}</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              {t('community.listDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {listError ? (
              <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm text-rose-50">
                {listError}
              </div>
            ) : null}

            {threadsLoading && threads.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-300">
                {t('community.loadingThreads')}
              </div>
            ) : null}

            {!threadsLoading && threads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-6 text-sm text-slate-300">
                <p className="font-medium text-slate-100">{t('community.emptyTitle')}</p>
                <p className="mt-2 leading-6 text-slate-400">
                  {t('community.emptyDescription')}
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleOpenThread(thread.id)}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-4 text-left transition',
                    selectedThreadId === thread.id
                      ? 'border-cyan-300/45 bg-cyan-400/12 shadow-[0_18px_60px_rgba(34,211,238,0.12)]'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/[0.05]',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-50">
                          {thread.title}
                        </p>
                        {thread.isLocked ? (
                          <Badge className="border-amber-300/30 bg-amber-400/12 text-amber-50 hover:bg-amber-400/12">
                            {t('community.locked')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {renderThreadMeta(t, thread).join(' · ')}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatCommunityDateTime(locale, thread.lastPostAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <CardTitle>{t('community.detailTitle')}</CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                {selectedThread
                  ? t('community.detailDescription')
                  : t('community.emptyDetailDescription')}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRefresh}
              disabled={threadsLoading || detailLoading}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {t('community.refreshThread')}
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {detailError ? (
              <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm text-rose-50">
                {detailError}
              </div>
            ) : null}

            {detailLoading && !selectedThread ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-300">
                {t('community.loadingThread')}
              </div>
            ) : null}

            {!selectedThread && !detailLoading ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-6 text-sm text-slate-300">
                <p className="font-medium text-slate-100">
                  {t('community.emptyDetailTitle')}
                </p>
                <p className="mt-2 leading-6 text-slate-400">
                  {t('community.emptyDetailDescription')}
                </p>
              </div>
            ) : null}

            {selectedThread ? (
              <>
                <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold text-slate-50">
                          {selectedThread.title}
                        </h2>
                        {selectedThreadLocked ? (
                          <Badge className="border-amber-300/30 bg-amber-400/12 text-amber-50 hover:bg-amber-400/12">
                            {t('community.locked')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {renderThreadMeta(t, selectedThread).join(' · ')}
                      </p>
                    </div>

                    <div className="text-right text-xs text-slate-400">
                      <p>{t('community.startedAt')}</p>
                      <p className="mt-1 text-slate-300">
                        {formatCommunityDateTime(locale, selectedThread.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {threadDetail?.posts.items.map((post, index) => (
                    <article
                      key={post.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/5">
                            {index === 0
                              ? t('community.originalPost')
                              : t('community.replyBadge')}
                          </Badge>
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            {t('community.authorLabel', { id: post.authorUserId })}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {formatCommunityDateTime(locale, post.createdAt)}
                        </span>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
                        {post.body}
                      </p>
                    </article>
                  ))}
                </div>

                <form className="space-y-4" onSubmit={handleReply}>
                  <div className="space-y-2">
                    <Label htmlFor="community-reply-body" className="text-slate-100">
                      {t('community.replyLabel')}
                    </Label>
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
                      className="flex w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  {turnstileEnabled ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <Label className="text-slate-100">
                        {t('community.captchaLabel')}
                      </Label>
                      <CommunityTurnstileWidget
                        ready={turnstileReady}
                        resetKey={replyCaptchaResetKey}
                        siteKey={TURNSTILE_SITE_KEY}
                        onTokenChange={setReplyCaptchaToken}
                      />
                      <p className="text-xs leading-5 text-slate-400">
                        {turnstileReady
                          ? t('community.captchaPrompt')
                          : t('community.captchaLoading')}
                      </p>
                    </div>
                  ) : null}

                  {replyError ? (
                    <div className="rounded-2xl border border-rose-300/30 bg-rose-400/12 px-4 py-3 text-sm text-rose-50">
                      {replyError}
                    </div>
                  ) : null}

                  {replyNotice ? (
                    <div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm text-cyan-50">
                      {replyNotice}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={replySubmitting || selectedThreadLocked}
                      className="rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                    >
                      {replySubmitting
                        ? t('community.submittingReply')
                        : t('community.replySubmit')}
                    </Button>
                    {selectedThreadLocked ? (
                      <p className="self-center text-sm text-amber-200">
                        {t('community.replyLocked')}
                      </p>
                    ) : null}
                  </div>
                </form>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
