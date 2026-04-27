import type { ComponentProps } from 'react';

import { RewardCenterSection } from '../sections/reward-center-section';

type RewardsRouteScreenProps = ComponentProps<typeof RewardCenterSection>;

export function RewardsRouteScreen(props: RewardsRouteScreenProps) {
  return <RewardCenterSection {...props} />;
}
