'use client';

import { useVerifiedGameAccess } from '@/modules/app/components/use-verified-game-access';
import { QuickEightPanel } from '@/modules/quick-eight/components/quick-eight-panel';

export default function QuickEightPage() {
  const access = useVerifiedGameAccess();

  return <QuickEightPanel {...access} />;
}
