import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { AccountRouteScreen } from './account-route-screen';

type AccountRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof AccountRouteScreen>;

export function AccountRouteContainer(props: AccountRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <AccountRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
