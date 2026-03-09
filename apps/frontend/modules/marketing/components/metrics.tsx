import { Section } from './section';
import type { Messages } from '@/lib/i18n/messages';

export function Metrics({ messages }: { messages: Messages }) {
  return (
    <Section className="py-12">
      <div className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:grid-cols-3">
        {messages.marketing.metrics.map((metric) => (
          <div key={metric.label} className="space-y-2">
            <p className="text-3xl font-semibold text-slate-900">
              {metric.value}
            </p>
            <p className="text-sm font-semibold text-slate-700">
              {metric.label}
            </p>
            <p className="text-sm text-slate-500">{metric.detail}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
