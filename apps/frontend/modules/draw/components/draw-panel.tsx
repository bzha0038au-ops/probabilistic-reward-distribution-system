'use client';

import { useEffect, useState } from 'react';
import type { DrawResult, WalletBalanceResponse } from '@reward/shared-types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequestClient } from '@/lib/api/client';
import { useTranslations } from '@/components/i18n-provider';

type DrawPanelProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  onBalanceChange?: (balance: string) => void;
  onDrawComplete?: () => void;
};

export function DrawPanel({
  disabled = false,
  disabledReason = null,
  onBalanceChange,
  onDrawComplete,
}: DrawPanelProps) {
  const t = useTranslations();
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshBalance() {
    const response = await apiRequestClient<WalletBalanceResponse>('/wallet');
    if (response.ok) {
      setBalance(response.data.balance ?? '0');
      onBalanceChange?.(response.data.balance ?? '0');
    }
  }

  useEffect(() => {
    (async () => {
      await refreshBalance();
    })();
  }, []);

  async function handleDraw() {
    setLoading(true);
    setError(null);

    const response = await apiRequestClient<DrawResult>('/draw', {
      method: 'POST',
    });

    if (!response.ok) {
      setError(response.error?.message ?? t('draw.errorFallback'));
    } else {
      setResult(response.data);
      await refreshBalance();
      onDrawComplete?.();
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
        <Button
          onClick={handleDraw}
          disabled={loading || disabled}
          className="w-full sm:w-auto"
        >
          {loading ? t('draw.drawing') : t('draw.runDraw')}
        </Button>
        {disabledReason ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {disabledReason}
          </p>
        ) : null}
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
