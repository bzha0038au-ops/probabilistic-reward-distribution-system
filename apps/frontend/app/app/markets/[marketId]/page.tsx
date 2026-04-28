import { notFound } from 'next/navigation';

import { PredictionMarketDetailPage } from '@/modules/markets/components/prediction-market-detail-page';

type MarketDetailPageProps = {
  params: Promise<{
    marketId: string;
  }>;
};

export default async function MarketDetailPage({
  params,
}: MarketDetailPageProps) {
  const { marketId: marketIdParam } = await params;
  const marketId = Number(marketIdParam);

  if (!Number.isInteger(marketId) || marketId <= 0) {
    notFound();
  }

  return <PredictionMarketDetailPage marketId={marketId} />;
}
