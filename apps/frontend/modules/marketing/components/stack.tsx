import { Badge } from '@/components/ui/badge';
import type { Messages } from '@/lib/i18n/messages';

import { Section } from './section';

export function StackStrip({ messages }: { messages: Messages }) {
  const stack = messages.marketing.stack;
  return (
    <Section
      className="py-12"
      align="center"
      title={stack.title}
      description={stack.description}
    >
      <div className="flex flex-wrap justify-center gap-3">
        {stack.items.map((item) => (
          <Badge key={item} variant="secondary" className="px-3 py-1 text-sm">
            {item}
          </Badge>
        ))}
      </div>
    </Section>
  );
}
