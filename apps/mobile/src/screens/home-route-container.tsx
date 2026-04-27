import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { HomeRouteScreen } from './home-route-screen';

type HomeRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof HomeRouteScreen>;

export function HomeRouteContainer(props: HomeRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <HomeRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
