import type { ComponentProps } from 'react';

import { KycVerificationCard } from '../sections/kyc-verification-card';
import { SessionSecuritySection } from '../sections/session-security-section';

type SecurityRouteScreenProps = ComponentProps<typeof SessionSecuritySection> & {
  kycProfile: ComponentProps<typeof KycVerificationCard>["profile"];
  loadingKycProfile: ComponentProps<typeof KycVerificationCard>["loading"];
  formatOptionalTimestamp: ComponentProps<
    typeof KycVerificationCard
  >["formatTimestamp"];
  onRefreshKycProfile: ComponentProps<typeof KycVerificationCard>["onRefresh"];
  onOpenKycVerification: ComponentProps<
    typeof KycVerificationCard
  >["onOpenVerification"];
};

export function SecurityRouteScreen(props: SecurityRouteScreenProps) {
  return (
    <>
      <SessionSecuritySection {...props} />
      <KycVerificationCard
        styles={props.styles}
        copy={props.copy.kyc}
        profile={props.kycProfile}
        loading={props.loadingKycProfile}
        playingQuickEight={props.playingQuickEight}
        formatTimestamp={props.formatOptionalTimestamp}
        onRefresh={props.onRefreshKycProfile}
        onOpenVerification={props.onOpenKycVerification}
      />
    </>
  );
}
