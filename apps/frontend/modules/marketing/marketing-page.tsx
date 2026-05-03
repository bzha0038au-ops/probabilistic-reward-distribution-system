import { CallToAction } from './components/cta';
import { MarketingFooter } from './components/footer';
import { FeatureSection } from './components/features';
import { Hero } from './components/hero';
import { Metrics } from './components/metrics';
import { StackStrip } from './components/stack';
import { getServerMessages } from '@/lib/i18n/server';

export async function MarketingPage() {
  const messages = await getServerMessages();

  return (
    <main className="landing-shell min-h-app-screen">
      <Hero messages={messages} />
      <Metrics messages={messages} />
      <StackStrip messages={messages} />
      <FeatureSection messages={messages} />
      <CallToAction messages={messages} />
      <MarketingFooter messages={messages} />
    </main>
  );
}
