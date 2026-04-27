import type { ComponentProps } from 'react';

import { MobileFairnessVerifier } from '../fairness';

type FairnessRouteScreenProps = ComponentProps<typeof MobileFairnessVerifier>;

export function FairnessRouteScreen(props: FairnessRouteScreenProps) {
  return <MobileFairnessVerifier {...props} />;
}
