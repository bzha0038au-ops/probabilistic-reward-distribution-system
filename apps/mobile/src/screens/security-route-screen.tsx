import type { ComponentProps } from 'react';

import { SessionSecuritySection } from '../sections/session-security-section';

type SecurityRouteScreenProps = ComponentProps<typeof SessionSecuritySection>;

export function SecurityRouteScreen(props: SecurityRouteScreenProps) {
  return <SessionSecuritySection {...props} />;
}
