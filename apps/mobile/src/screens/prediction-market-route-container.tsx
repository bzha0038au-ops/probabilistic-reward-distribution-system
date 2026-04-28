import type { ComponentProps } from "react";

import { AppScreenShell } from "./app-screen-shell";
import { PredictionMarketRouteScreen } from "./prediction-market-route-screen";

type PredictionMarketRouteContainerProps = Omit<
  ComponentProps<typeof AppScreenShell>,
  "children"
> &
  ComponentProps<typeof PredictionMarketRouteScreen>;

export function PredictionMarketRouteContainer(
  props: PredictionMarketRouteContainerProps,
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
      <PredictionMarketRouteScreen {...screenProps} />
    </AppScreenShell>
  );
}
