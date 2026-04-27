import type { ComponentProps } from 'react';

import { SignedInCard } from '../sections/signed-in-card';

type AccountRouteScreenProps = ComponentProps<typeof SignedInCard>;

export function AccountRouteScreen(props: AccountRouteScreenProps) {
  return <SignedInCard {...props} />;
}
