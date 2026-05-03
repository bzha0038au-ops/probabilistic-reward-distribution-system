"use client";

import { useVerifiedGameAccess } from "@/modules/app/components/use-verified-game-access";
import { DrawPanel } from "./draw-panel";

export function GachaRoutePage() {
  const access = useVerifiedGameAccess();

  return (
    <div data-testid="gacha-route-hero">
      <DrawPanel variant="gacha" {...access} />
    </div>
  );
}
