import type { ComponentProps } from "react";

import { AppScreenShell } from "./app-screen-shell";
import { HoldemRouteScreen } from "./holdem-route-screen";

type HoldemRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  "children"
> &
  ComponentProps<typeof HoldemRouteScreen>;

export function HoldemRouteContainer(props: HoldemRouteContainerProps) {
  const { apiBaseUrl, error, hero, message, ...screenProps } = props;

  return (
    <AppScreenShell
      styles={props.styles}
      hero={hero}
      apiBaseUrl={apiBaseUrl}
      message={message}
      error={error}
    >
      <HoldemRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
