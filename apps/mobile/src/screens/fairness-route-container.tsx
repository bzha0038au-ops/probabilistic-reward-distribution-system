import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { FairnessRouteScreen } from './fairness-route-screen';

type FairnessRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof FairnessRouteScreen>;

export function FairnessRouteContainer(props: FairnessRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <FairnessRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
