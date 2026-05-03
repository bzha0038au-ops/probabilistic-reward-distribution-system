import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { SecurityRouteScreen } from './security-route-screen';

type SecurityRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof SecurityRouteScreen>;

export function SecurityRouteContainer(props: SecurityRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
      compactHero
    >
      <SecurityRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
