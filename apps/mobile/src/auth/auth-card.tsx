import { StyleSheet, View } from 'react-native';

import type { ScreenMode } from '../app-support';
import type { MobileAuthCopy } from '../mobile-copy';
import { ActionButton, Field, SectionCard, TextLink } from '../ui';

type MobileAuthCardProps = {
  screen: ScreenMode;
  copy: MobileAuthCopy;
  email: string;
  password: string;
  resetTokenInput: string;
  newPassword: string;
  verificationTokenInput: string;
  submitting: boolean;
  sendingVerification: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  showSeededLogin: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeResetTokenInput: (value: string) => void;
  onChangeNewPassword: (value: string) => void;
  onChangeVerificationTokenInput: (value: string) => void;
  onShowLogin: () => void;
  onShowRegister: () => void;
  onShowForgotPassword: () => void;
  onShowResetPassword: () => void;
  onShowVerifyEmail: () => void;
  onReturn: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onSeededLogin: () => void;
  onRequestPasswordReset: () => void;
  onConfirmPasswordReset: () => void;
  onConfirmEmailVerification: () => void;
  onRequestEmailVerification: () => void;
};

function ForgotPasswordCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.forgotPassword.title}
      subtitle={props.copy.forgotPassword.subtitle}
    >
      <Field
        label={props.copy.email}
        value={props.email}
        onChangeText={props.onChangeEmail}
        keyboardType="email-address"
        placeholder={props.copy.emailPlaceholder}
      />
      <ActionButton
        label={
          props.submitting
            ? props.copy.forgotPassword.submitting
            : props.copy.forgotPassword.submit
        }
        onPress={props.onRequestPasswordReset}
        disabled={props.submitting}
      />
      <View style={styles.linkRow}>
        <TextLink
          label={props.copy.forgotPassword.resetLinkReady}
          onPress={props.onShowResetPassword}
        />
        <TextLink
          label={props.signedIn ? props.copy.backToApp : props.copy.backToSignIn}
          onPress={props.onReturn}
        />
      </View>
    </SectionCard>
  );
}

function ResetPasswordCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.resetPassword.title}
      subtitle={props.copy.resetPassword.subtitle}
    >
      <Field
        label={props.copy.resetPassword.tokenLabel}
        value={props.resetTokenInput}
        onChangeText={props.onChangeResetTokenInput}
        placeholder={props.copy.resetPassword.tokenPlaceholder}
      />
      <Field
        label={props.copy.resetPassword.passwordLabel}
        value={props.newPassword}
        onChangeText={props.onChangeNewPassword}
        secureTextEntry
      />
      <ActionButton
        label={
          props.submitting
            ? props.copy.resetPassword.submitting
            : props.copy.resetPassword.submit
        }
        onPress={props.onConfirmPasswordReset}
        disabled={props.submitting}
      />
      <View style={styles.linkRow}>
        <TextLink
          label={props.copy.resetPassword.requestAnotherLink}
          onPress={props.onShowForgotPassword}
        />
        <TextLink
          label={props.signedIn ? props.copy.backToApp : props.copy.backToSignIn}
          onPress={props.onReturn}
        />
      </View>
    </SectionCard>
  );
}

function VerifyEmailCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.verifyEmail.title}
      subtitle={props.copy.verifyEmail.subtitle}
    >
      <Field
        label={props.copy.verifyEmail.tokenLabel}
        value={props.verificationTokenInput}
        onChangeText={props.onChangeVerificationTokenInput}
        placeholder={props.copy.verifyEmail.tokenPlaceholder}
      />
      <ActionButton
        label={
          props.submitting ? props.copy.verifyEmail.submitting : props.copy.verifyEmail.submit
        }
        onPress={props.onConfirmEmailVerification}
        disabled={props.submitting}
      />
      <View style={styles.linkRow}>
        {props.signedIn && !props.emailVerified ? (
          <TextLink
            label={
              props.sendingVerification
                ? props.copy.verifyEmail.resending
                : props.copy.verifyEmail.resend
            }
            onPress={props.onRequestEmailVerification}
            disabled={props.sendingVerification}
          />
        ) : null}
        <TextLink
          label={props.signedIn ? props.copy.backToApp : props.copy.backToSignIn}
          onPress={props.onReturn}
        />
      </View>
    </SectionCard>
  );
}

function LoginCard(props: MobileAuthCardProps) {
  return (
    <SectionCard title={props.copy.loginTitle} subtitle={props.copy.loginSubtitle}>
      <View style={styles.segmentedControl}>
        <ActionButton
          label={props.copy.tabs.login}
          onPress={props.onShowLogin}
          variant="primary"
        />
        <ActionButton
          label={props.copy.tabs.register}
          onPress={props.onShowRegister}
          variant="secondary"
        />
      </View>

      <Field
        label={props.copy.email}
        value={props.email}
        onChangeText={props.onChangeEmail}
        keyboardType="email-address"
        placeholder={props.copy.emailPlaceholder}
      />
      <Field
        label={props.copy.password}
        value={props.password}
        onChangeText={props.onChangePassword}
        secureTextEntry
      />

      <ActionButton
        label={props.submitting ? props.copy.submit.busy : props.copy.submit.login}
        onPress={props.onLogin}
        disabled={props.submitting}
      />
      {props.showSeededLogin ? (
        <ActionButton
          label={props.submitting ? 'Signing in seeded user...' : 'Use seeded user'}
          onPress={props.onSeededLogin}
          disabled={props.submitting}
          variant="secondary"
        />
      ) : null}

      <View style={styles.linkRow}>
        <TextLink label={props.copy.forgotPasswordLink} onPress={props.onShowForgotPassword} />
        <TextLink label={props.copy.verifyEmailLink} onPress={props.onShowVerifyEmail} />
      </View>
    </SectionCard>
  );
}

function RegisterCard(props: MobileAuthCardProps) {
  return (
    <SectionCard title={props.copy.registerTitle} subtitle={props.copy.loginSubtitle}>
      <View style={styles.segmentedControl}>
        <ActionButton
          label={props.copy.tabs.login}
          onPress={props.onShowLogin}
          variant="secondary"
        />
        <ActionButton
          label={props.copy.tabs.register}
          onPress={props.onShowRegister}
          variant="primary"
        />
      </View>

      <Field
        label={props.copy.email}
        value={props.email}
        onChangeText={props.onChangeEmail}
        keyboardType="email-address"
        placeholder={props.copy.emailPlaceholder}
      />
      <Field
        label={props.copy.password}
        value={props.password}
        onChangeText={props.onChangePassword}
        secureTextEntry
      />

      <ActionButton
        label={props.submitting ? props.copy.submit.busy : props.copy.submit.register}
        onPress={props.onRegister}
        disabled={props.submitting}
      />

      <View style={styles.linkRow}>
        <TextLink label={props.copy.forgotPasswordLink} onPress={props.onShowForgotPassword} />
        <TextLink label={props.copy.verifyEmailLink} onPress={props.onShowVerifyEmail} />
      </View>
    </SectionCard>
  );
}

export function MobileAuthCard(props: MobileAuthCardProps) {
  if (props.screen === 'forgotPassword') {
    return <ForgotPasswordCard {...props} />;
  }

  if (props.screen === 'resetPassword') {
    return <ResetPasswordCard {...props} />;
  }

  if (props.screen === 'verifyEmail') {
    return <VerifyEmailCard {...props} />;
  }

  if (props.screen === 'register') {
    return <RegisterCard {...props} />;
  }

  return <LoginCard {...props} />;
}

const styles = StyleSheet.create({
  segmentedControl: {
    flexDirection: 'row',
    gap: 12,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
});
