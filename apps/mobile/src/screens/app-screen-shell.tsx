import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MobileStyles } from './types';

type AppScreenShellProps = {
  styles: MobileStyles;
  hero: {
    kicker: string;
    title: string;
    subtitle: string;
  };
  apiBaseUrl: string;
  message: string | null;
  error: string | null;
  children: ReactNode;
};

export function AppScreenShell(props: AppScreenShellProps) {
  return (
    <SafeAreaView style={props.styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={props.styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={props.styles.hero}>
          <Text style={props.styles.kicker}>{props.hero.kicker}</Text>
          <Text style={props.styles.title}>{props.hero.title}</Text>
          <Text style={props.styles.subtitle}>{props.hero.subtitle}</Text>
          <Text style={props.styles.endpoint}>API: {props.apiBaseUrl}</Text>
        </View>

        <View style={props.styles.appStack}>{props.children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
