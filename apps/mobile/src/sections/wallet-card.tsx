import { Text } from 'react-native';

import type { MobileWalletCopy } from '../mobile-copy';
import type { MobileStyles } from '../screens/types';
import { SectionCard } from '../ui';

type WalletCardProps = {
  styles: MobileStyles;
  copy: MobileWalletCopy;
  formattedBalance: string;
};

export function WalletCard(props: WalletCardProps) {
  return (
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      <Text style={props.styles.balanceLabel}>{props.copy.currentBalance}</Text>
      <Text style={props.styles.balanceValue}>{props.formattedBalance}</Text>
    </SectionCard>
  );
}
