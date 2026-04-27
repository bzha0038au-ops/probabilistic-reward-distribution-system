import type { ComponentProps } from 'react';

import { WalletCard } from '../sections/wallet-card';

type WalletRouteScreenProps = ComponentProps<typeof WalletCard>;

export function WalletRouteScreen(props: WalletRouteScreenProps) {
  return <WalletCard {...props} />;
}
