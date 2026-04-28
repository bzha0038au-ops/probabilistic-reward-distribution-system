import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CurrentLegalDocument } from "@reward/shared-types/legal";

import type { ScreenMode } from '../app-support';
import type { MobileAuthCopy } from '../mobile-copy';
import { ActionButton, Field, SectionCard, TextLink } from '../ui';

const formatLegalSlug = (slug: string) =>
  slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildLegalDocumentKey = (document: Pick<CurrentLegalDocument, "slug" | "version">) =>
  `${document.slug}::${document.version}`;

type MobileAuthCardProps = {
  screen: ScreenMode;
  copy: MobileAuthCopy;
  legalDocuments: CurrentLegalDocument[];
  loadingLegalDocuments: boolean;
  selectedLegalDocumentKeys: string[];
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
  onToggleLegalDocument: (key: string) => void;
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

      <View style={styles.legalSection}>
        <Text style={styles.legalSectionTitle}>{props.copy.legal.title}</Text>
        <Text style={styles.legalSectionSubtitle}>
          {props.copy.legal.subtitle}
        </Text>
        {props.loadingLegalDocuments ? (
          <Text style={styles.legalHelpText}>{props.copy.legal.loading}</Text>
        ) : props.legalDocuments.length === 0 ? (
          <Text style={styles.legalHelpText}>{props.copy.legal.empty}</Text>
        ) : (
          props.legalDocuments.map((document) => {
            const key = buildLegalDocumentKey(document);
            const selected = props.selectedLegalDocumentKeys.includes(key);

            return (
              <Pressable
                key={document.id}
                onPress={() => props.onToggleLegalDocument(key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={styles.legalItem}
              >
                <View
                  style={[
                    styles.legalCheckbox,
                    selected ? styles.legalCheckboxSelected : null,
                  ]}
                >
                  {selected ? <Text style={styles.legalCheckboxMark}>✓</Text> : null}
                </View>
                <View style={styles.legalItemBody}>
                  <Text style={styles.legalItemTitle}>
                    {formatLegalSlug(document.slug)}
                  </Text>
                  <Text style={styles.legalItemVersion}>
                    {props.copy.legal.versionLabel(document.version)}
                  </Text>
                  <Text style={styles.legalItemBodyText} numberOfLines={5}>
                    {stripHtml(document.html)}
                  </Text>
                  <Text style={styles.legalItemHint}>
                    {props.copy.legal.checkboxLabel(
                      formatLegalSlug(document.slug),
                      document.version,
                    )}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <ActionButton
        label={props.submitting ? props.copy.submit.busy : props.copy.submit.register}
        onPress={props.onRegister}
        disabled={props.submitting || props.loadingLegalDocuments}
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
  legalSection: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    padding: 14,
  },
  legalSectionTitle: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "700",
  },
  legalSectionSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  legalHelpText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  legalItem: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(15, 23, 42, 0.24)",
    padding: 12,
  },
  legalCheckbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#64748B",
    backgroundColor: "transparent",
    marginTop: 2,
  },
  legalCheckboxSelected: {
    borderColor: "#22C55E",
    backgroundColor: "#22C55E",
  },
  legalCheckboxMark: {
    color: "#020617",
    fontSize: 12,
    fontWeight: "800",
  },
  legalItemBody: {
    flex: 1,
    gap: 4,
  },
  legalItemTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  legalItemVersion: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  legalItemBodyText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
  },
  legalItemHint: {
    color: "#7DD3FC",
    fontSize: 12,
    lineHeight: 18,
  },
});
