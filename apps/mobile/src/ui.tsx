import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  PlayModeGameKey,
  PlayModeSnapshot,
  PlayModeType,
} from '@reward/shared-types/play-mode';

import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobileLayoutTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileSurfaceTheme,
  mobileTypeScale,
} from './theme';

const playModeOrder: PlayModeType[] = [
  'standard',
  'dual_bet',
  'deferred_double',
  'snowball',
];

export type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'email-address' | 'numeric';
  returnKeyType?: 'done' | 'go' | 'next' | 'send';
  placeholder?: string;
  testID?: string;
};

export function Field(props: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
        placeholder={props.placeholder}
        placeholderTextColor={mobilePalette.textMuted}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        keyboardType={props.keyboardType ?? 'default'}
        returnKeyType={props.returnKeyType}
        autoCorrect={false}
        onSubmitEditing={props.onSubmitEditing}
        testID={props.testID}
      />
    </View>
  );
}

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'gold';
  compact?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function ActionButton(props: ActionButtonProps) {
  const variant = props.variant ?? 'primary';

  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ disabled: props.disabled ?? false }}
      testID={props.testID}
      style={({ pressed }) => [
        styles.button,
        props.fullWidth ? styles.buttonFullWidth : null,
        props.compact ? styles.buttonCompact : null,
        variant === 'secondary'
          ? styles.buttonSecondary
          : variant === 'gold'
            ? styles.buttonGold
          : variant === 'danger'
            ? styles.buttonDanger
            : styles.buttonPrimary,
        props.disabled ? styles.buttonDisabled : null,
        pressed && !props.disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === 'secondary'
            ? styles.buttonLabelSecondary
            : variant === 'danger'
              ? styles.buttonLabelDanger
              : variant === 'primary' || variant === 'gold'
                ? styles.buttonLabelAccent
            : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export type TextLinkProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  testID?: string;
};

export function TextLink(props: TextLinkProps) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled ?? false }}
      testID={props.testID}
    >
      <Text
        style={[
          styles.textLink,
          props.disabled ? styles.textLinkDisabled : null,
          props.tone === 'danger' ? styles.textLinkDanger : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SectionCard(props: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardAccent} />
          <Text style={styles.cardTitle}>{props.title}</Text>
        </View>
        {props.subtitle ? (
          <Text style={styles.cardSubtitle}>{props.subtitle}</Text>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

export type PlayModeCopy = {
  title: string;
  subtitle: string;
  currentLabel: string;
  nextLabel: string;
  streakLabel: string;
  pendingLabel: string;
  carryLabel: string;
  envelopeLabel: string;
  carryActive: string;
  carryIdle: string;
  modes: Record<PlayModeType, string>;
  descriptions: Record<PlayModeGameKey, Record<PlayModeType, string>>;
};

export type PlayModeSelectorProps = {
  copy: PlayModeCopy;
  gameKey: PlayModeGameKey;
  snapshot: PlayModeSnapshot | null;
  onSelect: (type: PlayModeType) => void;
  disabled?: boolean;
};

export function PlayModeSelector(props: PlayModeSelectorProps) {
  return (
    <View style={styles.playModeCard}>
      <Text style={styles.playModeTitle}>{props.copy.title}</Text>
      <Text style={styles.playModeSubtitle}>{props.copy.subtitle}</Text>
      {props.snapshot ? (
        <View style={styles.playModeMetaRow}>
          {props.snapshot.type === 'standard' || props.snapshot.type === 'dual_bet' ? (
            <>
              <Text style={styles.playModeMetaText}>
                {props.copy.currentLabel}: x{props.snapshot.appliedMultiplier}
              </Text>
              <Text style={styles.playModeMetaText}>
                {props.copy.nextLabel}: x{props.snapshot.nextMultiplier}
              </Text>
            </>
          ) : null}
          <Text style={styles.playModeMetaText}>
            {props.copy.streakLabel}: {props.snapshot.streak}
          </Text>
          {props.snapshot.pendingPayoutCount > 0 ? (
            <Text style={styles.playModeMetaText}>
              {props.copy.pendingLabel}: {props.snapshot.pendingPayoutAmount}
            </Text>
          ) : null}
          {props.snapshot.snowballCarryAmount !== '0.00' ? (
            <Text style={styles.playModeMetaText}>
              {props.copy.carryLabel}: {props.snapshot.snowballCarryAmount}
            </Text>
          ) : null}
          {props.snapshot.snowballEnvelopeAmount !== '0.00' ? (
            <Text style={styles.playModeMetaText}>
              {props.copy.envelopeLabel}: {props.snapshot.snowballEnvelopeAmount}
            </Text>
          ) : null}
          <Text style={styles.playModeMetaText}>
            {props.snapshot.carryActive
              ? props.copy.carryActive
              : props.copy.carryIdle}
          </Text>
        </View>
      ) : null}
      <View style={styles.playModeGrid}>
        {playModeOrder.map((mode) => {
          const active = props.snapshot?.type === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => props.onSelect(mode)}
              disabled={props.disabled}
              accessibilityRole="button"
              accessibilityLabel={props.copy.modes[mode]}
              accessibilityState={{
                disabled: props.disabled ?? false,
                selected: active,
              }}
              style={[
                styles.playModeChip,
                active ? styles.playModeChipActive : null,
                props.disabled ? styles.playModeChipDisabled : null,
              ]}
            >
              <Text
                style={[
                  styles.playModeChipLabel,
                  active ? styles.playModeChipLabelActive : null,
                ]}
              >
                {props.copy.modes[mode]}
              </Text>
              <Text
                style={[
                  styles.playModeChipDescription,
                  active ? styles.playModeChipDescriptionActive : null,
                ]}
              >
                {props.copy.descriptions[props.gameKey][mode]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export type ToastTone = 'success' | 'error' | 'info';

export type ToastBannerProps = {
  message: string;
  onDismiss: () => void;
  tone?: ToastTone;
  testID?: string;
};

export function ToastBanner(props: ToastBannerProps) {
  const tone = props.tone ?? 'info';

  return (
    <View pointerEvents="box-none" style={styles.toastViewport}>
      <Pressable
        onPress={props.onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        testID={props.testID}
        style={[
          styles.toastCard,
          tone === 'success'
            ? styles.toastSuccess
            : tone === 'error'
              ? styles.toastError
              : styles.toastInfo,
        ]}
      >
        <Text style={styles.toastKicker}>
          {tone === 'success' ? 'Success' : tone === 'error' ? 'Error' : 'Update'}
        </Text>
        <Text style={styles.toastMessage}>{props.message}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: mobileLayoutTheme.sectionGap,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileLayoutTheme.cardPadding,
    ...mobileChromeTheme.cardShadow,
  },
  cardHeader: {
    gap: mobileSpacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mobileSpacing.sm,
  },
  cardAccent: {
    width: 14,
    height: 14,
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.accent,
  },
  cardTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.hero - 8,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  playModeCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileLayoutTheme.cardPadding,
    ...mobileChromeTheme.cardShadowSm,
  },
  playModeTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: '700',
  },
  playModeSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  playModeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playModeMetaText: {
    color: mobilePalette.textMuted,
    fontSize: 12,
  },
  playModeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playModeChip: {
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    minWidth: '47%',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playModeChipActive: {
    borderColor: mobilePalette.accent,
    backgroundColor: mobilePalette.accent,
  },
  playModeChipDisabled: {
    opacity: 0.55,
  },
  playModeChipLabel: {
    color: mobilePalette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  playModeChipLabelActive: {
    color: mobileSurfaceTheme.primaryTextOnAccent,
  },
  playModeChipDescription: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  playModeChipDescriptionActive: {
    color: mobileSurfaceTheme.primaryTextOnAccent,
  },
  field: {
    gap: mobileSpacing.sm,
  },
  fieldLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: '700',
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: mobileLayoutTheme.fieldHeight,
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.input,
    color: mobilePalette.text,
    paddingHorizontal: mobileSpacing.xl,
    paddingVertical: mobileSpacing.lg,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    ...mobileChromeTheme.cardShadowSm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    minHeight: mobileLayoutTheme.buttonHeight,
    paddingHorizontal: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  buttonCompact: {
    minHeight: mobileLayoutTheme.buttonCompactHeight,
    paddingHorizontal: mobileSpacing.lg,
  },
  buttonFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: mobilePalette.accent,
    borderColor: mobilePalette.border,
  },
  buttonSecondary: {
    backgroundColor: mobilePalette.panelMuted,
    borderColor: mobilePalette.border,
  },
  buttonGold: {
    backgroundColor: mobileFeedbackTheme.warning.backgroundColor,
    borderColor: mobilePalette.border,
  },
  buttonDanger: {
    backgroundColor: mobileFeedbackTheme.dangerButton.backgroundColor,
    borderColor: mobileFeedbackTheme.dangerButton.borderColor,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }, { scale: 0.985 }],
    ...mobileChromeTheme.pressedShadow,
  },
  buttonLabel: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: '800',
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
    textTransform: 'uppercase',
  },
  buttonLabelAccent: {
    color: mobileSurfaceTheme.primaryTextOnAccent,
  },
  buttonLabelSecondary: {
    color: mobilePalette.text,
  },
  buttonLabelDanger: {
    color: '#fff8ef',
  },
  textLink: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: '700',
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  textLinkDisabled: {
    opacity: 0.45,
  },
  textLinkDanger: {
    color: mobileFeedbackTheme.dangerButton.backgroundColor,
  },
  toastViewport: {
    position: 'absolute',
    top: mobileSpacing['3xl'],
    left: mobileSpacing['3xl'],
    right: mobileSpacing['3xl'],
    zIndex: 120,
  },
  toastCard: {
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    paddingHorizontal: mobileSpacing.xl,
    paddingVertical: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadow,
  },
  toastSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  toastError: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  toastInfo: {
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  toastKicker: {
    color: mobilePalette.accentMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: '800',
    letterSpacing: mobileTypeScale.letterSpacing.caps,
    textTransform: 'uppercase',
  },
  toastMessage: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
    fontWeight: '600',
  },
});
