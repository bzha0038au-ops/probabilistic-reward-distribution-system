import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { BlackjackRouteScreen } from './blackjack-route-screen';

type BlackjackRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof BlackjackRouteScreen>;

export function BlackjackRouteContainer(props: BlackjackRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <BlackjackRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
