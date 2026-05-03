import { StyleSheet, Text, View } from 'react-native';

import type { MobileVerificationCalloutCopy } from '../mobile-copy';
import { mobileChromeTheme, mobilePalette } from '../theme';
import { ActionButton } from '../ui';

type VerificationCalloutProps = {
  copy: MobileVerificationCalloutCopy;
  sendingVerification: boolean;
  onRequestVerification: () => void;
  onOpenVerification: () => void;
};

export function VerificationCallout(props: VerificationCalloutProps) {
  return (
    <View style={styles.callout}>
      <Text style={styles.title}>{props.copy.title}</Text>
      <Text style={styles.subtitle}>{props.copy.subtitle}</Text>
      <View style={styles.actions}>
        <ActionButton
          label={
            props.sendingVerification ? props.copy.sending : props.copy.send
          }
          onPress={props.onRequestVerification}
          disabled={props.sendingVerification}
          compact
        />
        <ActionButton
          label={props.copy.open}
          onPress={props.onOpenVerification}
          variant="secondary"
          compact
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: '#fff3c2',
    padding: 16,
    gap: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  title: {
    color: mobilePalette.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
