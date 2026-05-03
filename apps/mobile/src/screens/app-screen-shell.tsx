import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTransitionProgress } from 'react-native-screens';
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
  compactHero?: boolean;
  children: ReactNode;
};

export function AppScreenShell(props: AppScreenShellProps) {
  const chineseLocale = usesChineseCopy(props.hero);
  const environmentLabel = resolveShellEnvironment(props.apiBaseUrl, chineseLocale);
  const environmentTitle = chineseLocale ? '环境' : 'Environment';
  const feedbackLabel = props.error
    ? chineseLocale
      ? '需要处理'
      : 'Needs attention'
    : props.message
      ? chineseLocale
        ? '最近更新'
        : 'Latest update'
      : chineseLocale
        ? '当前状态'
        : 'Session status';
  const feedbackValue =
    props.error ??
    props.message ??
    (chineseLocale ? '已准备好开始' : 'Ready for play');

  return (
    <SafeAreaView style={props.styles.safeArea}>
      <StatusBar style="light" />
      <TransitionProgressSubscription />
      <ScrollView
        contentContainerStyle={props.styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            props.styles.hero,
            props.compactHero ? props.styles.heroCompact : null,
          ]}
        >
          <View style={props.styles.heroOrbWarm} />
          <View style={props.styles.heroOrbCool} />

          <View style={props.styles.heroHeader}>
            <Text style={props.styles.kicker}>{props.hero.kicker}</Text>
            <Text style={props.styles.endpoint}>{environmentLabel}</Text>
          </View>
          <Text
            style={[
              props.styles.title,
              props.compactHero ? props.styles.titleCompact : null,
            ]}
          >
            {props.hero.title}
          </Text>
          <Text
            style={[
              props.styles.subtitle,
              props.compactHero ? props.styles.subtitleCompact : null,
            ]}
          >
            {props.hero.subtitle}
          </Text>

          {props.compactHero ? (
            props.error || props.message ? (
              <View
                style={[
                  props.styles.heroCompactNotice,
                  props.error ? props.styles.heroFeedbackDanger : null,
                ]}
              >
                <Text style={props.styles.heroFeedbackLabel}>{feedbackLabel}</Text>
                <Text style={props.styles.heroFeedbackValue}>{feedbackValue}</Text>
              </View>
            ) : null
          ) : (
            <View style={props.styles.heroMetaRow}>
              <View style={props.styles.heroMetaCard}>
                <Text style={props.styles.heroMetaLabel}>{environmentTitle}</Text>
                <Text style={props.styles.heroMetaValue}>{environmentLabel}</Text>
              </View>
              <View
                style={[
                  props.styles.heroFeedbackCard,
                  props.error ? props.styles.heroFeedbackDanger : null,
                ]}
              >
                <Text style={props.styles.heroFeedbackLabel}>{feedbackLabel}</Text>
                <Text style={props.styles.heroFeedbackValue}>{feedbackValue}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={props.styles.appStack}>{props.children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TransitionProgressSubscription() {
  const { closing, goingForward, progress } = useTransitionProgress();

  useEffect(() => {
    const noop = () => undefined;
    const listenerIds = [
      progress.addListener(noop),
      closing.addListener(noop),
      goingForward.addListener(noop),
    ];

    return () => {
      progress.removeListener(listenerIds[0]);
      closing.removeListener(listenerIds[1]);
      goingForward.removeListener(listenerIds[2]);
    };
  }, [closing, goingForward, progress]);

  return null;
}

function resolveShellEnvironment(apiBaseUrl: string, chineseLocale: boolean) {
  const normalized = apiBaseUrl.toLowerCase();

  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    return chineseLocale ? '本地沙盒' : 'Local sandbox';
  }

  if (normalized.includes('staging') || normalized.includes('preview')) {
    return chineseLocale ? '预览环境' : 'Preview network';
  }

  return chineseLocale ? '正式环境' : 'Live network';
}

function usesChineseCopy(hero: AppScreenShellProps['hero']) {
  return /[\u3400-\u9fff]/u.test(
    `${hero.kicker} ${hero.title} ${hero.subtitle}`,
  );
}
