import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  PlayModeSnapshot,
  PlayModeType,
} from '@reward/shared-types/play-mode';

import { mobileFeedbackTheme, mobilePalette, mobileSurfaceTheme } from './theme';

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
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
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
      style={[
        styles.button,
        props.compact ? styles.buttonCompact : null,
        variant === 'secondary'
          ? styles.buttonSecondary
          : variant === 'danger'
            ? styles.buttonDanger
            : styles.buttonPrimary,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === 'secondary' ? styles.buttonLabelSecondary : null,
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
      <Text style={styles.cardTitle}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.cardSubtitle}>{props.subtitle}</Text> : null}
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
  carryActive: string;
  carryIdle: string;
  modes: Record<PlayModeType, string>;
};

export type PlayModeSelectorProps = {
  copy: PlayModeCopy;
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
          <Text style={styles.playModeMetaText}>
            {props.copy.currentLabel}: x{props.snapshot.appliedMultiplier}
          </Text>
          <Text style={styles.playModeMetaText}>
            {props.copy.nextLabel}: x{props.snapshot.nextMultiplier}
          </Text>
          <Text style={styles.playModeMetaText}>
            {props.copy.streakLabel}: {props.snapshot.streak}
          </Text>
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
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: 18,
  },
  cardTitle: {
    color: mobilePalette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  playModeCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 16,
  },
  playModeTitle: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  playModeSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: mobilePalette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.input,
    color: mobilePalette.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  buttonCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  buttonPrimary: {
    backgroundColor: mobilePalette.accent,
    borderColor: mobilePalette.accent,
  },
  buttonSecondary: {
    backgroundColor: mobilePalette.panelMuted,
    borderColor: mobilePalette.border,
  },
  buttonDanger: {
    backgroundColor: mobileFeedbackTheme.dangerButton.backgroundColor,
    borderColor: mobileFeedbackTheme.dangerButton.borderColor,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: mobileSurfaceTheme.primaryTextOnAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelSecondary: {
    color: mobilePalette.text,
  },
  textLink: {
    color: mobilePalette.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  textLinkDisabled: {
    opacity: 0.45,
  },
  textLinkDanger: {
    color: mobileFeedbackTheme.dangerButton.backgroundColor,
  },
  toastViewport: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    zIndex: 120,
  },
  toastCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  toastMessage: {
    color: mobilePalette.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
