import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CurrentLegalDocument } from "@reward/shared-types/legal";

import type { ScreenMode } from "../app-support";
import type { MobileAuthCopy } from "../mobile-copy";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { ActionButton, Field, SectionCard, TextLink } from "../ui";

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

const buildLegalDocumentKey = (
  document: Pick<CurrentLegalDocument, "slug" | "version">,
) => `${document.slug}::${document.version}`;

type MobileAuthCardProps = {
  screen: ScreenMode;
  copy: MobileAuthCopy;
  legalDocuments: CurrentLegalDocument[];
  loadingLegalDocuments: boolean;
  selectedLegalDocumentKeys: string[];
  email: string;
  password: string;
  birthDate: string;
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
  onChangeBirthDate: (value: string) => void;
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

type AuthModeTabsProps = {
  active: "login" | "register";
  copy: MobileAuthCopy;
  onShowLogin: () => void;
  onShowRegister: () => void;
};

type AuthIntroPanelProps = {
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  glyph: string;
  tone?: "warm" | "info";
  supportPills?: string[];
};

function AuthIntroPanel(props: AuthIntroPanelProps) {
  return (
    <View
      style={[
        styles.introCard,
        props.tone === "info" ? styles.introCardInfo : styles.introCardWarm,
      ]}
    >
      <View style={styles.introArtBand} />
      <View style={styles.introBadge}>
        <Text style={styles.introBadgeText}>{props.glyph}</Text>
      </View>
      <View style={styles.introTopRow}>
        <Text style={styles.introEyebrow}>{props.eyebrow}</Text>
        <View style={styles.introPill}>
          <Text style={styles.introPillText}>{props.badge}</Text>
        </View>
      </View>
      <Text style={styles.introTitle}>{props.title}</Text>
      <Text style={styles.introBody}>{props.body}</Text>
      {props.supportPills && props.supportPills.length > 0 ? (
        <View style={styles.introSupportRow}>
          {props.supportPills.map((item) => (
            <View key={item} style={styles.introSupportPill}>
              <Text style={styles.introSupportPillText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AuthModeTabs(props: AuthModeTabsProps) {
  return (
    <View style={styles.segmentedControl}>
      <Pressable
        onPress={props.onShowLogin}
        accessibilityRole="button"
        accessibilityState={{ selected: props.active === "login" }}
        testID="auth-show-login-button"
        style={[
          styles.segmentButton,
          props.active === "login" ? styles.segmentButtonActive : null,
        ]}
      >
        <Text
          style={[
            styles.segmentButtonLabel,
            props.active === "login" ? styles.segmentButtonLabelActive : null,
          ]}
        >
          {props.copy.tabs.login}
        </Text>
      </Pressable>

      <Pressable
        onPress={props.onShowRegister}
        accessibilityRole="button"
        accessibilityState={{ selected: props.active === "register" }}
        testID="auth-show-register-button"
        style={[
          styles.segmentButton,
          props.active === "register" ? styles.segmentButtonActive : null,
        ]}
      >
        <Text
          style={[
            styles.segmentButtonLabel,
            props.active === "register" ? styles.segmentButtonLabelActive : null,
          ]}
        >
          {props.copy.tabs.register}
        </Text>
      </Pressable>
    </View>
  );
}

function AuthFooterLinks(props: {
  left: { label: string; onPress: () => void; disabled?: boolean };
  right: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View style={styles.linkRow}>
      <TextLink
        label={props.left.label}
        onPress={props.left.onPress}
        disabled={props.left.disabled}
      />
      <TextLink
        label={props.right.label}
        onPress={props.right.onPress}
        disabled={props.right.disabled}
      />
    </View>
  );
}

function ForgotPasswordCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.forgotPassword.title}
      subtitle={props.copy.forgotPassword.subtitle}
    >
      <AuthIntroPanel
        eyebrow={props.copy.forgotPassword.title}
        title={props.copy.forgotPassword.title}
        body={props.copy.forgotPassword.subtitle}
        badge={props.copy.forgotPassword.submit}
        glyph="->"
        supportPills={[
          props.copy.forgotPassword.resetLinkReady,
          props.signedIn ? props.copy.backToApp : props.copy.backToSignIn,
        ]}
      />

      <View style={styles.formStack}>
        <Field
          label={props.copy.email}
          value={props.email}
          onChangeText={props.onChangeEmail}
          keyboardType="email-address"
          placeholder={props.copy.emailPlaceholder}
        />
      </View>

      <View style={styles.actionStack}>
        <ActionButton
          label={
            props.submitting
              ? props.copy.forgotPassword.submitting
              : props.copy.forgotPassword.submit
          }
          onPress={props.onRequestPasswordReset}
          disabled={props.submitting}
          fullWidth
        />
      </View>

      <AuthFooterLinks
        left={{
          label: props.copy.forgotPassword.resetLinkReady,
          onPress: props.onShowResetPassword,
        }}
        right={{
          label: props.signedIn ? props.copy.backToApp : props.copy.backToSignIn,
          onPress: props.onReturn,
        }}
      />
    </SectionCard>
  );
}

function ResetPasswordCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.resetPassword.title}
      subtitle={props.copy.resetPassword.subtitle}
    >
      <AuthIntroPanel
        eyebrow={props.copy.resetPassword.title}
        title={props.copy.resetPassword.title}
        body={props.copy.resetPassword.subtitle}
        badge={props.copy.resetPassword.submit}
        glyph="OK"
        supportPills={[props.copy.resetPassword.requestAnotherLink]}
      />

      <View style={styles.formStack}>
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
      </View>

      <View style={styles.actionStack}>
        <ActionButton
          label={
            props.submitting
              ? props.copy.resetPassword.submitting
              : props.copy.resetPassword.submit
          }
          onPress={props.onConfirmPasswordReset}
          disabled={props.submitting}
          fullWidth
        />
      </View>

      <AuthFooterLinks
        left={{
          label: props.copy.resetPassword.requestAnotherLink,
          onPress: props.onShowForgotPassword,
        }}
        right={{
          label: props.signedIn ? props.copy.backToApp : props.copy.backToSignIn,
          onPress: props.onReturn,
        }}
      />
    </SectionCard>
  );
}

function VerifyEmailCard(props: MobileAuthCardProps) {
  return (
    <SectionCard
      title={props.copy.verifyEmail.title}
      subtitle={props.copy.verifyEmail.subtitle}
    >
      <AuthIntroPanel
        eyebrow={props.copy.verifyEmail.title}
        title={props.copy.verifyEmail.title}
        body={props.copy.verifyEmail.subtitle}
        badge={props.copy.verifyEmail.submit}
        glyph="@"
        tone="info"
        supportPills={[
          props.copy.verifyEmail.resend,
          props.signedIn ? props.copy.backToApp : props.copy.backToSignIn,
        ]}
      />

      <View style={styles.formStack}>
        <Field
          label={props.copy.verifyEmail.tokenLabel}
          value={props.verificationTokenInput}
          onChangeText={props.onChangeVerificationTokenInput}
          placeholder={props.copy.verifyEmail.tokenPlaceholder}
        />
      </View>

      <View style={styles.actionStack}>
        <ActionButton
          label={
            props.submitting
              ? props.copy.verifyEmail.submitting
              : props.copy.verifyEmail.submit
          }
          onPress={props.onConfirmEmailVerification}
          disabled={props.submitting}
          fullWidth
        />
      </View>

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
    <SectionCard
      title={props.copy.loginTitle}
      subtitle={props.copy.loginSubtitle}
    >
      <AuthIntroPanel
        eyebrow={props.copy.tabs.login}
        title={props.copy.loginTitle}
        body={props.copy.loginSubtitle}
        badge={props.copy.submit.login}
        glyph="->"
        supportPills={[
          props.copy.forgotPasswordLink,
          props.copy.verifyEmailLink,
          props.showSeededLogin ? props.copy.seededLogin.idle : props.copy.backToSignIn,
        ]}
      />

      <AuthModeTabs
        active="login"
        copy={props.copy}
        onShowLogin={props.onShowLogin}
        onShowRegister={props.onShowRegister}
      />

      <View style={styles.formStack}>
        <Field
          label={props.copy.email}
          value={props.email}
          onChangeText={props.onChangeEmail}
          keyboardType="email-address"
          placeholder={props.copy.emailPlaceholder}
          testID="auth-login-email-input"
        />
        <Field
          label={props.copy.password}
          value={props.password}
          onChangeText={props.onChangePassword}
          secureTextEntry
          onSubmitEditing={props.onLogin}
          returnKeyType="go"
          testID="auth-login-password-input"
        />
      </View>

      <View style={styles.actionStack}>
        <ActionButton
          label={props.submitting ? props.copy.submit.busy : props.copy.submit.login}
          onPress={props.onLogin}
          disabled={props.submitting}
          fullWidth
          testID="auth-login-submit-button"
        />
        {props.showSeededLogin ? (
          <ActionButton
            label={
              props.submitting
                ? props.copy.seededLogin.busy
                : props.copy.seededLogin.idle
            }
            onPress={props.onSeededLogin}
            disabled={props.submitting}
            variant="secondary"
            fullWidth
            testID="auth-login-seeded-button"
          />
        ) : null}
      </View>

      <AuthFooterLinks
        left={{
          label: props.copy.forgotPasswordLink,
          onPress: props.onShowForgotPassword,
        }}
        right={{
          label: props.copy.verifyEmailLink,
          onPress: props.onShowVerifyEmail,
        }}
      />
    </SectionCard>
  );
}

function RegisterCard(props: MobileAuthCardProps) {
  const totalLegalDocuments = props.legalDocuments.length;
  const selectedLegalCount = props.selectedLegalDocumentKeys.length;

  return (
    <SectionCard
      title={props.copy.registerTitle}
      subtitle={props.copy.registerSubtitle}
    >
      <AuthIntroPanel
        eyebrow={props.copy.tabs.register}
        title={props.copy.registerTitle}
        body={props.copy.registerSubtitle}
        badge={props.copy.submit.register}
        glyph="+"
        tone="info"
        supportPills={
          totalLegalDocuments > 0
            ? [
                props.copy.legal.selectedSummary(
                  selectedLegalCount,
                  totalLegalDocuments,
                ),
                props.copy.legal.pendingSummary(totalLegalDocuments),
              ]
            : [props.copy.legal.loading]
        }
      />

      <AuthModeTabs
        active="register"
        copy={props.copy}
        onShowLogin={props.onShowLogin}
        onShowRegister={props.onShowRegister}
      />

      <View style={styles.formStack}>
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
        <Field
          label={props.copy.birthDate}
          value={props.birthDate}
          onChangeText={props.onChangeBirthDate}
          placeholder={props.copy.birthDatePlaceholder}
        />
      </View>

      <View style={styles.legalSection}>
        <View style={styles.legalSectionHeader}>
          <View style={styles.legalSectionCopy}>
            <Text style={styles.legalSectionTitle}>{props.copy.legal.title}</Text>
            <Text style={styles.legalSectionSubtitle}>
              {props.copy.legal.subtitle}
            </Text>
          </View>
          {totalLegalDocuments > 0 ? (
            <View style={styles.legalSummaryColumn}>
              <View style={[styles.legalSummaryPill, styles.legalSummaryPillWarm]}>
                <Text style={styles.legalSummaryPillText}>
                  {props.copy.legal.selectedSummary(
                    selectedLegalCount,
                    totalLegalDocuments,
                  )}
                </Text>
              </View>
              <View style={[styles.legalSummaryPill, styles.legalSummaryPillInfo]}>
                <Text style={styles.legalSummaryPillText}>
                  {props.copy.legal.pendingSummary(totalLegalDocuments)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {props.loadingLegalDocuments ? (
          <Text style={styles.legalHelpText}>{props.copy.legal.loading}</Text>
        ) : props.legalDocuments.length === 0 ? (
          <Text style={styles.legalHelpText}>{props.copy.legal.empty}</Text>
        ) : (
          <View style={styles.legalList}>
            {props.legalDocuments.map((document) => {
              const key = buildLegalDocumentKey(document);
              const selected = props.selectedLegalDocumentKeys.includes(key);

              return (
                <Pressable
                  key={document.id}
                  onPress={() => props.onToggleLegalDocument(key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  style={[
                    styles.legalItem,
                    selected ? styles.legalItemSelected : null,
                  ]}
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
                    <View style={styles.legalItemHeader}>
                      <Text style={styles.legalItemTitle}>
                        {formatLegalSlug(document.slug)}
                      </Text>
                      <Text style={styles.legalItemVersion}>
                        {props.copy.legal.versionLabel(document.version)}
                      </Text>
                    </View>
                    <Text style={styles.legalItemBodyText} numberOfLines={4}>
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
            })}
          </View>
        )}
      </View>

      <View style={styles.actionStack}>
        <ActionButton
          label={
            props.submitting ? props.copy.submit.busy : props.copy.submit.register
          }
          onPress={props.onRegister}
          disabled={props.submitting || props.loadingLegalDocuments}
          fullWidth
        />
      </View>

      <AuthFooterLinks
        left={{
          label: props.copy.forgotPasswordLink,
          onPress: props.onShowForgotPassword,
        }}
        right={{
          label: props.copy.verifyEmailLink,
          onPress: props.onShowVerifyEmail,
        }}
      />
    </SectionCard>
  );
}

export function MobileAuthCard(props: MobileAuthCardProps) {
  if (props.screen === "forgotPassword") {
    return <ForgotPasswordCard {...props} />;
  }

  if (props.screen === "resetPassword") {
    return <ResetPasswordCard {...props} />;
  }

  if (props.screen === "verifyEmail") {
    return <VerifyEmailCard {...props} />;
  }

  if (props.screen === "register") {
    return <RegisterCard {...props} />;
  }

  return <LoginCard {...props} />;
}

const styles = StyleSheet.create({
  introArtBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    borderTopLeftRadius: mobileRadii.xl,
    borderTopRightRadius: mobileRadii.xl,
    backgroundColor: "#ffd0ad",
  },
  introBadge: {
    position: "absolute",
    top: 76,
    alignSelf: "center",
    minWidth: 74,
    height: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 37,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: mobileSpacing.md,
    ...mobileChromeTheme.cardShadow,
  },
  introBadgeText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  introBody: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  introCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: mobileSpacing.xl,
    paddingTop: mobileSpacing["5xl"],
    paddingBottom: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  introCardInfo: {
    backgroundColor: "#f8f8ff",
  },
  introCardWarm: {
    backgroundColor: "#fffdfb",
  },
  introEyebrow: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  introPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  introPillText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  introSupportPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  introSupportPillText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
  },
  introSupportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
  introTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  introTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
    marginTop: 84,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.md,
  },
  segmentButtonActive: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  segmentButtonLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  segmentButtonLabelActive: {
    color: mobileFeedbackTheme.active.accentColor,
  },
  formStack: {
    gap: mobileSpacing.lg,
  },
  actionStack: {
    gap: mobileSpacing.md,
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.lg,
    justifyContent: "space-between",
  },
  legalSection: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  legalSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  legalSectionCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  legalSectionTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  legalSectionSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  legalSummaryColumn: {
    alignItems: "flex-end",
    gap: mobileSpacing.sm,
  },
  legalSummaryPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
  },
  legalSummaryPillWarm: {
    backgroundColor: "#ffe58b",
  },
  legalSummaryPillInfo: {
    backgroundColor: "#dfe1ff",
  },
  legalSummaryPillText: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
  },
  legalHelpText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  legalList: {
    gap: mobileSpacing.md,
  },
  legalItem: {
    flexDirection: "row",
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  legalItemSelected: {
    backgroundColor: "#dfe1ff",
  },
  legalCheckbox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    marginTop: 2,
  },
  legalCheckboxSelected: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  legalCheckboxMark: {
    color: mobileFeedbackTheme.active.accentColor,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  legalItemBody: {
    flex: 1,
    gap: mobileSpacing.sm,
  },
  legalItemHeader: {
    gap: mobileSpacing["2xs"],
  },
  legalItemTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "800",
  },
  legalItemVersion: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  legalItemBodyText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  legalItemHint: {
    color: mobileFeedbackTheme.info.accentColor,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
});
