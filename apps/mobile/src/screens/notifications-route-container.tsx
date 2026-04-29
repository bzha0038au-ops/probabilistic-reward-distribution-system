import type { ComponentProps } from "react";

import { AppScreenShell } from "./app-screen-shell";
import { NotificationsRouteScreen } from "./notifications-route-screen";

type NotificationsRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  "children"
> &
  ComponentProps<typeof NotificationsRouteScreen>;

export function NotificationsRouteContainer(
  props: NotificationsRouteContainerProps,
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
      <NotificationsRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
