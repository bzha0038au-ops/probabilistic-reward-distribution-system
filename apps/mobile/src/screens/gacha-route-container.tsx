import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { GachaRouteScreen } from './gacha-route-screen';

type GachaRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof GachaRouteScreen>;

export function GachaRouteContainer(props: GachaRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <GachaRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
