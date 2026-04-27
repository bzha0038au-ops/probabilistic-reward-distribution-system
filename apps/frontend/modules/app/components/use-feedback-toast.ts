'use client';

import { useEffect, useRef } from 'react';

import { useToast } from '@/components/ui/toast-provider';

type UseFeedbackToastOptions = {
  error: string | null;
  errorTitle?: string;
  notice: string | null;
  noticeTitle?: string;
};

export function useFeedbackToast(options: UseFeedbackToastOptions) {
  const { error, errorTitle, notice, noticeTitle } = options;
  const { showToast } = useToast();
  const lastErrorRef = useRef<string | null>(null);
  const lastNoticeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!notice) {
      lastNoticeRef.current = null;
      return;
    }

    if (notice === lastNoticeRef.current) {
      return;
    }

    lastNoticeRef.current = notice;
    showToast({
      title: noticeTitle,
      description: notice,
      tone: 'success',
    });
  }, [notice, noticeTitle, showToast]);

  useEffect(() => {
    if (!error) {
      lastErrorRef.current = null;
      return;
    }

    if (error === lastErrorRef.current) {
      return;
    }

    lastErrorRef.current = error;
    showToast({
      title: errorTitle,
      description: error,
      tone: 'error',
      durationMs: 5200,
    });
  }, [error, errorTitle, showToast]);
}
