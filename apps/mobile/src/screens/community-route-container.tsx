import type { ComponentProps } from 'react';

import { AppScreenShell } from './app-screen-shell';
import { CommunityRouteScreen } from './community-route-screen';

type CommunityRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  'children'
> &
  ComponentProps<typeof CommunityRouteScreen>;

export function CommunityRouteContainer(
  props: CommunityRouteContainerProps,
) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <CommunityRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
