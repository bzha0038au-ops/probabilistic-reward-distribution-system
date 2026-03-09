'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type DrawResult = {
  id: number;
  status: string;
  rewardAmount: string;
  prizeId: number | null;
};

export function DrawPanel() {
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshBalance() {
    const response = await fetch('/api/wallet');
    if (!response.ok) return;
    const data = await response.json();
    setBalance(data.balance ?? '0');
  }

  useEffect(() => {
    refreshBalance();
  }, []);

  async function handleDraw() {
    setLoading(true);
    setError(null);

    const response = await fetch('/api/draw', { method: 'POST' });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? 'Draw failed');
    } else {
      setResult(payload.data as DrawResult);
      await refreshBalance();
    }

    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draw Console</CardTitle>
        <CardDescription>
          Current balance: <span className="font-semibold">{balance}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleDraw} disabled={loading}>
          {loading ? 'Drawing...' : 'Run Draw'}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
            <div>Status: {result.status}</div>
            <div>Reward Amount: {result.rewardAmount}</div>
            <div>Prize ID: {result.prizeId ?? 'N/A'}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
