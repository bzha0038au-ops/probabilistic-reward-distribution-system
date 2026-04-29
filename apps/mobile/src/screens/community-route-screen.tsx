import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  CommunityThread,
  CommunityThreadDetailResponse,
} from '@reward/shared-types/community';

import type { MobileCommunityCopy } from '../community-copy';
import { mobileFeedbackTheme, mobilePalette as palette } from '../theme';
import { buildTestId } from '../testing';
import { ActionButton, SectionCard } from '../ui';
import type { MobileStyles } from './types';

type CommunityRouteScreenProps = {
  styles: MobileStyles;
  title: string;
  subtitle: string;
  copy: MobileCommunityCopy;
  threads: CommunityThread[] | null;
  selectedThreadId: number | null;
  threadDetail: CommunityThreadDetailResponse | null;
  loadingThreads: boolean;
  loadingThread: boolean;
  creatingThread: boolean;
  creatingReply: boolean;
  createError: string | null;
  replyError: string | null;
  listError: string | null;
  detailError: string | null;
  threadTitleInput: string;
  threadBodyInput: string;
  replyBodyInput: string;
  formatTimestamp: (value: string | Date | null | undefined) => string;
  onRefresh: () => void;
  onOpenWebCommunity: () => void;
  onSelectThread: (threadId: number) => void;
  onChangeThreadTitle: (value: string) => void;
  onChangeThreadBody: (value: string) => void;
  onCreateThread: () => void;
  onChangeReplyBody: (value: string) => void;
  onCreateReply: () => void;
  verificationCallout?: ReactNode;
};

export function CommunityRouteScreen(props: CommunityRouteScreenProps) {
  const selectedThread = props.threadDetail?.thread ?? null;
  const visiblePosts = props.threadDetail?.posts.items ?? [];

  return (
    <>
      <SectionCard title={props.title} subtitle={props.subtitle}>
        <View style={props.styles.routeSummaryRow}>
          <SummaryCard
            styles={props.styles}
            label={props.copy.summaryThreadsLabel}
            value={String(props.threads?.length ?? 0)}
          />
          <SummaryCard
            styles={props.styles}
            label={props.copy.summarySelectedLabel}
            value={selectedThread?.title ?? props.copy.noneSelected}
          />
          <SummaryCard
            styles={props.styles}
            label={props.copy.summaryPostsLabel}
            value={String(selectedThread?.postCount ?? 0)}
          />
        </View>

        <View style={props.styles.inlineActions}>
          <ActionButton
            label={props.loadingThreads ? props.copy.refreshing : props.copy.refresh}
            onPress={props.onRefresh}
            disabled={
              props.loadingThreads ||
              props.loadingThread ||
              props.creatingThread ||
              props.creatingReply
            }
            variant="secondary"
            compact
            testID="community-refresh-button"
          />
          <ActionButton
            label={props.copy.openWeb}
            onPress={props.onOpenWebCommunity}
            disabled={props.creatingThread || props.creatingReply}
            variant="secondary"
            compact
            testID="community-open-web-button"
          />
        </View>

        <Text style={localStyles.helperText}>{props.copy.webFallback}</Text>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard
        title={props.copy.createTitle}
        subtitle={props.copy.createSubtitle}
      >
        <View style={props.styles.field}>
          <Text style={props.styles.fieldLabel}>{props.copy.threadTitleLabel}</Text>
          <TextInput
            value={props.threadTitleInput}
            onChangeText={props.onChangeThreadTitle}
            placeholder={props.copy.threadTitlePlaceholder}
            placeholderTextColor={palette.textMuted}
            style={localStyles.input}
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={160}
            testID="community-thread-title-input"
          />
        </View>

        <View style={props.styles.field}>
          <Text style={props.styles.fieldLabel}>{props.copy.threadBodyLabel}</Text>
          <TextInput
            value={props.threadBodyInput}
            onChangeText={props.onChangeThreadBody}
            placeholder={props.copy.threadBodyPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={localStyles.multilineInput}
            autoCapitalize="sentences"
            autoCorrect={false}
            multiline
            numberOfLines={5}
            maxLength={5000}
            textAlignVertical="top"
            testID="community-thread-body-input"
          />
        </View>

        {props.createError ? (
          <View style={localStyles.errorPanel}>
            <Text style={localStyles.errorText}>{props.createError}</Text>
          </View>
        ) : null}

        <ActionButton
          label={
            props.creatingThread
              ? props.copy.submittingThread
              : props.copy.submitThread
          }
          onPress={props.onCreateThread}
          disabled={props.creatingThread || props.creatingReply}
          compact
          testID="community-create-thread-button"
        />
      </SectionCard>

      <SectionCard
        title={props.copy.listTitle}
        subtitle={props.copy.listSubtitle}
      >
        {props.listError ? (
          <View style={localStyles.errorPanel}>
            <Text style={localStyles.errorText}>{props.listError}</Text>
          </View>
        ) : null}

        {props.loadingThreads && !props.threads ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>{props.copy.loadingThreads}</Text>
          </View>
        ) : null}

        {!props.loadingThreads && !(props.threads?.length ?? 0) ? (
          <Text style={localStyles.helperText}>{props.copy.noThreads}</Text>
        ) : null}

        <View style={localStyles.threadList}>
          {props.threads?.map((thread) => {
            const selected = thread.id === props.selectedThreadId;
            return (
              <Pressable
                key={thread.id}
                onPress={() => props.onSelectThread(thread.id)}
                accessibilityRole="button"
                accessibilityLabel={thread.title}
                accessibilityState={{ selected }}
                testID={buildTestId('community-thread-card', thread.id)}
                style={[
                  localStyles.threadCard,
                  selected ? localStyles.threadCardSelected : null,
                ]}
              >
                <View style={localStyles.threadHeader}>
                  <Text style={localStyles.threadTitle}>{thread.title}</Text>
                  {thread.isLocked ? (
                    <View style={localStyles.lockedBadge}>
                      <Text style={localStyles.lockedBadgeText}>
                        {props.copy.lockedBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={localStyles.threadMeta}>
                  {props.copy.authorLabel(thread.authorUserId)} ·{' '}
                  {props.copy.postCount(thread.postCount)}
                </Text>
                <Text style={localStyles.threadMeta}>
                  {props.copy.lastActive}: {props.formatTimestamp(thread.lastPostAt)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title={props.copy.detailTitle}>
        {props.detailError ? (
          <View style={localStyles.errorPanel}>
            <Text style={localStyles.errorText}>{props.detailError}</Text>
          </View>
        ) : null}

        {props.loadingThread && !props.threadDetail ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>{props.copy.loadingThread}</Text>
          </View>
        ) : null}

        {!selectedThread && !props.loadingThread ? (
          <Text style={localStyles.helperText}>{props.copy.detailEmpty}</Text>
        ) : null}

        {selectedThread ? (
          <>
            <View style={localStyles.detailHero}>
              <View style={localStyles.threadHeader}>
                <Text style={localStyles.detailTitle}>{selectedThread.title}</Text>
                {selectedThread.isLocked ? (
                  <View style={localStyles.lockedBadge}>
                    <Text style={localStyles.lockedBadgeText}>
                      {props.copy.lockedBadge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={localStyles.threadMeta}>
                {props.copy.authorLabel(selectedThread.authorUserId)} ·{' '}
                {props.copy.postCount(selectedThread.postCount)}
              </Text>
              <Text style={localStyles.threadMeta}>
                {props.copy.startedAt}:{' '}
                {props.formatTimestamp(selectedThread.createdAt)}
              </Text>
            </View>

            <View style={localStyles.postList}>
              {visiblePosts.map((post, index) => (
                <View key={post.id} style={localStyles.postCard}>
                  <View style={localStyles.threadHeader}>
                    <Text style={localStyles.postBadge}>
                      {index === 0
                        ? props.copy.originalPostBadge
                        : props.copy.replyBadge}
                    </Text>
                    <Text style={localStyles.threadMeta}>
                      {props.copy.authorLabel(post.authorUserId)}
                    </Text>
                  </View>
                  <Text style={localStyles.postBody}>{post.body}</Text>
                  <Text style={localStyles.threadMeta}>
                    {props.formatTimestamp(post.createdAt)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={props.styles.field}>
              <Text style={props.styles.fieldLabel}>{props.copy.replyLabel}</Text>
              <TextInput
                value={props.replyBodyInput}
                onChangeText={props.onChangeReplyBody}
                placeholder={
                  selectedThread.isLocked
                    ? props.copy.replyLocked
                    : props.copy.replyPlaceholder
                }
                placeholderTextColor={palette.textMuted}
                style={localStyles.multilineInput}
                autoCapitalize="sentences"
                autoCorrect={false}
                multiline
                numberOfLines={4}
                maxLength={5000}
                textAlignVertical="top"
                editable={!selectedThread.isLocked}
                testID="community-reply-body-input"
              />
            </View>

            {props.replyError ? (
              <View style={localStyles.errorPanel}>
                <Text style={localStyles.errorText}>{props.replyError}</Text>
              </View>
            ) : null}

            <ActionButton
              label={
                props.creatingReply
                  ? props.copy.submittingReply
                  : props.copy.submitReply
              }
              onPress={props.onCreateReply}
              disabled={
                selectedThread.isLocked ||
                props.creatingThread ||
                props.creatingReply
              }
              compact
              testID="community-create-reply-button"
            />
          </>
        ) : null}
      </SectionCard>
    </>
  );
}

function SummaryCard(props: {
  styles: MobileStyles;
  label: string;
  value: string;
}) {
  return (
    <View style={props.styles.routeSummaryCard}>
      <Text style={props.styles.routeSummaryLabel}>{props.label}</Text>
      <Text style={props.styles.routeSummaryValue}>{props.value}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  helperText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    lineHeight: 21,
  },
  errorPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: mobileFeedbackTheme.danger.accentColor,
    fontSize: 13,
    lineHeight: 19,
  },
  threadList: {
    gap: 12,
  },
  threadCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  threadCardSelected: {
    borderColor: palette.accent,
    backgroundColor: '#11324c',
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  threadTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  detailTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },
  threadMeta: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  lockedBadge: {
    borderRadius: 999,
    backgroundColor: mobileFeedbackTheme.warning.backgroundColor,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.warning.borderColor,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockedBadgeText: {
    color: mobileFeedbackTheme.warning.accentColor,
    fontSize: 11,
    fontWeight: '700',
  },
  detailHero: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  postList: {
    gap: 12,
  },
  postCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  postBadge: {
    color: palette.accentMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  postBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
  },
});
