import { notFound } from 'next/navigation';

import { PredictionMarketDetailPage } from '@/modules/markets/components/prediction-market-detail-page';

type MarketDetailPageProps = {
  params: {
    marketId: string;
  };
};

export default function MarketDetailPage({
  params,
}: MarketDetailPageProps) {
  const marketId = Number(params.marketId);

  if (!Number.isInteger(marketId) || marketId <= 0) {
    notFound();
  }

  return <PredictionMarketDetailPage marketId={marketId} />;
}
