'use client';

import { useVerifiedGameAccess } from '@/modules/app/components/use-verified-game-access';
import { BlackjackPanel } from '@/modules/blackjack/components/blackjack-panel';

export default function BlackjackPage() {
  const access = useVerifiedGameAccess();

  return <BlackjackPanel {...access} />;
}
