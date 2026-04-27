import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { RewardsRouteScreen } from './rewards-route-screen';

type RewardsRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof RewardsRouteScreen>;

export function RewardsRouteContainer(props: RewardsRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <RewardsRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
