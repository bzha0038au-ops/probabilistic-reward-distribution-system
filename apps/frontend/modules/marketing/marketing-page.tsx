import { CallToAction } from './components/cta';
import { MarketingFooter } from './components/footer';
import { FeatureSection } from './components/features';
import { Hero } from './components/hero';
import { Metrics } from './components/metrics';
import { StackStrip } from './components/stack';
import { getServerMessages } from '@/lib/i18n/server';

export function MarketingPage() {
  const messages = getServerMessages();

  return (
    <main className="min-h-app-screen bg-white text-slate-900">
      <Hero messages={messages} />
      <StackStrip messages={messages} />
      <Metrics messages={messages} />
      <FeatureSection messages={messages} />
      <CallToAction messages={messages} />
      <MarketingFooter messages={messages} />
    </main>
  );
}
