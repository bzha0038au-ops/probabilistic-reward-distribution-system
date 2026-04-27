import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { QuickEightRouteScreen } from './quick-eight-route-screen';

type QuickEightRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof QuickEightRouteScreen>;

export function QuickEightRouteContainer(props: QuickEightRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <QuickEightRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
