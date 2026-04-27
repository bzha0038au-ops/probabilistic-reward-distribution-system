'use client';

import { useVerifiedGameAccess } from '@/modules/app/components/use-verified-game-access';
import { DrawPanel } from '@/modules/draw/components/draw-panel';

export default function SlotPage() {
  const access = useVerifiedGameAccess();

  return <DrawPanel {...access} />;
}
