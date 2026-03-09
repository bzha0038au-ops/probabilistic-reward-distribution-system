'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequestClient } from '@/lib/api/client';
import { useTranslations } from '@/components/i18n-provider';

type DrawResult = {
  id: number;
  status: string;
  rewardAmount: string;
  prizeId: number | null;
};

export function DrawPanel() {
  const t = useTranslations();
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureUserSession() {
    await fetch('/api/auth/user-session', { method: 'POST' });
  }

  async function refreshBalance() {
    const response = await apiRequestClient<{ balance: string }>('/wallet', {
      credentials: 'include',
    });
    if (response.ok) {
      setBalance(response.data.balance ?? '0');
    }
  }

  useEffect(() => {
    (async () => {
      await ensureUserSession();
      await refreshBalance();
    })();
  }, []);

  async function handleDraw() {
    setLoading(true);
    setError(null);

    await ensureUserSession();
    const response = await apiRequestClient<DrawResult>('/draw', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      setError(response.error?.message ?? t('draw.errorFallback'));
    } else {
      setResult(response.data);
      await refreshBalance();
    }

    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('draw.title')}</CardTitle>
        <CardDescription>
          {t('draw.currentBalance')}: <span className="font-semibold">{balance}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleDraw} disabled={loading}>
          {loading ? t('draw.drawing') : t('draw.runDraw')}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
            <div>
              {t('draw.statusLabel')}: {result.status}
            </div>
            <div>
              {t('draw.rewardLabel')}: {result.rewardAmount}
            </div>
            <div>
              {t('draw.prizeLabel')}: {result.prizeId ?? t('draw.na')}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
