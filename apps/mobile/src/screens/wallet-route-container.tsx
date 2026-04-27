import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { WalletRouteScreen } from './wallet-route-screen';

type WalletRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof WalletRouteScreen>;

export function WalletRouteContainer(props: WalletRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <WalletRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
