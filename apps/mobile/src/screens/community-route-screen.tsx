import { type ReactNode, useMemo, useState } from 'react';
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
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette as palette,
} from '../theme';
import { buildTestId } from '../testing';
import { ActionButton, SectionCard, TextLink } from '../ui';
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

const avatarTones = [
  { backgroundColor: '#172643', color: '#8cb4ff' },
  { backgroundColor: '#35270e', color: '#f7c340' },
  { backgroundColor: '#321518', color: '#ff6245' },
  { backgroundColor: '#11291a', color: '#6fda8a' },
] as const;

function resolveAvatarTone(seed: number) {
  return avatarTones[Math.abs(seed) % avatarTones.length];
}

function buildAvatarLabel(thread: CommunityThread) {
  const firstCharacter = thread.title.trim().charAt(0).toUpperCase();
  return firstCharacter || 'C';
}

function buildThreadPreview(
  thread: CommunityThread,
  selectedThreadId: number | null,
  visiblePosts: CommunityThreadDetailResponse['posts']['items'],
  fallback: string,
) {
  if (thread.id !== selectedThreadId) {
    return fallback;
  }

  const firstVisiblePost = visiblePosts[0]?.body?.trim();
  return firstVisiblePost ? firstVisiblePost : fallback;
}

export function CommunityRouteScreen(props: CommunityRouteScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const selectedThread = props.threadDetail?.thread ?? null;
  const visiblePosts = props.threadDetail?.posts.items ?? [];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredThreads = useMemo(() => {
    if (!props.threads?.length) {
      return [];
    }

    if (!normalizedQuery) {
      return props.threads;
    }

    return props.threads.filter((thread) =>
      thread.title.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, props.threads]);

  const trendingThreads = useMemo(() => {
    if (!props.threads?.length) {
      return [];
    }

    return [...props.threads]
      .sort((left, right) => {
        if (right.postCount !== left.postCount) {
          return right.postCount - left.postCount;
        }

        return (
          new Date(right.lastPostAt).getTime() - new Date(left.lastPostAt).getTime()
        );
      })
      .slice(0, 3);
  }, [props.threads]);

  return (
    <>
      <SectionCard title={props.title}>
        <View style={localStyles.heroCard}>
          <View style={localStyles.heroArtBand} />
          <View style={localStyles.heroBadge}>
            <Text style={localStyles.heroBadgeText}>
              {selectedThread ? buildAvatarLabel(selectedThread) : 'C'}
            </Text>
          </View>
          <View style={localStyles.heroTopRow}>
            <Text style={localStyles.heroEyebrow}>{props.copy.summaryThreadsLabel}</Text>
            <View style={localStyles.heroPill}>
              <Text style={localStyles.heroPillText}>
                {normalizedQuery || props.copy.noneSelected}
              </Text>
            </View>
          </View>
          <Text style={localStyles.heroTitle}>{props.title}</Text>
          <Text style={localStyles.heroBody}>{props.subtitle}</Text>
          <View style={localStyles.heroSummaryRow}>
            <View style={localStyles.heroSummaryCard}>
              <Text style={localStyles.heroSummaryLabel}>
                {props.copy.summaryThreadsLabel}
              </Text>
              <Text style={localStyles.heroSummaryValue}>
                {props.threads?.length ?? 0}
              </Text>
            </View>
            <View style={localStyles.heroSummaryCard}>
              <Text style={localStyles.heroSummaryLabel}>
                {props.copy.summarySelectedLabel}
              </Text>
              <Text style={localStyles.heroSummaryValue}>
                {selectedThread
                  ? buildAvatarLabel(selectedThread)
                  : props.copy.noneSelected}
              </Text>
            </View>
            <View style={localStyles.heroSummaryCard}>
              <Text style={localStyles.heroSummaryLabel}>
                {props.copy.summaryPostsLabel}
              </Text>
              <Text style={localStyles.heroSummaryValue}>
                {selectedThread?.postCount ?? 0}
              </Text>
            </View>
          </View>
        </View>

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={props.copy.searchPlaceholder}
          placeholderTextColor={palette.textMuted}
          style={localStyles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID="community-search-input"
        />

        <View style={localStyles.toolbarRow}>
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
          <TextLink
            label={props.copy.openWeb}
            onPress={props.onOpenWebCommunity}
            disabled={props.creatingThread || props.creatingReply}
            testID="community-open-web-button"
          />
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard title={props.copy.createTitle}>
        <View style={localStyles.composeCard}>
          <View
            style={[
              localStyles.avatarBubble,
              { backgroundColor: mobileFeedbackTheme.info.backgroundColor },
            ]}
          >
            <Text style={localStyles.avatarBubbleText}>ME</Text>
          </View>

          <View style={localStyles.composeBody}>
            <TextInput
              value={props.threadTitleInput}
              onChangeText={props.onChangeThreadTitle}
              placeholder={props.copy.threadTitlePlaceholder}
              placeholderTextColor={palette.textMuted}
              style={localStyles.composeTitleInput}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={160}
              testID="community-thread-title-input"
            />

            <TextInput
              value={props.threadBodyInput}
              onChangeText={props.onChangeThreadBody}
              placeholder={props.copy.threadBodyPlaceholder}
              placeholderTextColor={palette.textMuted}
              style={localStyles.composeBodyInput}
              autoCapitalize="sentences"
              autoCorrect={false}
              multiline
              numberOfLines={5}
              maxLength={5000}
              textAlignVertical="top"
              testID="community-thread-body-input"
            />

            <View style={localStyles.composeActionRow}>
              <View style={localStyles.composeHints}>
                <TopicChip label={props.copy.summaryThreadsLabel} tone="paper" />
                <TopicChip label={props.copy.summaryPostsLabel} tone="paper" />
              </View>
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
            </View>
          </View>
        </View>

        {props.createError ? (
          <View style={localStyles.errorPanel}>
            <Text style={localStyles.errorText}>{props.createError}</Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title={props.copy.listTitle}>
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

        {!props.loadingThreads && !filteredThreads.length ? (
          <View style={localStyles.emptyCard}>
            <Text style={localStyles.emptyTitle}>
              {normalizedQuery || props.copy.listTitle}
            </Text>
            <Text style={localStyles.helperText}>
              {props.threads?.length ? props.copy.searchEmpty : props.copy.noThreads}
            </Text>
          </View>
        ) : null}

        <View style={localStyles.feedList}>
          {filteredThreads.map((thread) => {
            const selected = thread.id === props.selectedThreadId;
            const avatarTone = resolveAvatarTone(thread.authorUserId);
            const preview = buildThreadPreview(
              thread,
              props.selectedThreadId,
              visiblePosts,
              props.copy.tapToOpen,
            );

            return (
              <Pressable
                key={thread.id}
                onPress={() => props.onSelectThread(thread.id)}
                accessibilityRole="button"
                accessibilityLabel={thread.title}
                accessibilityState={{ selected }}
                testID={buildTestId('community-thread-card', thread.id)}
                style={[
                  localStyles.feedCard,
                  selected ? localStyles.feedCardSelected : null,
                ]}
              >
                <View style={localStyles.feedCardHeader}>
                  <View
                    style={[
                      localStyles.avatarBubble,
                      { backgroundColor: avatarTone.backgroundColor },
                    ]}
                  >
                    <Text
                      style={[
                        localStyles.avatarBubbleText,
                        { color: avatarTone.color },
                      ]}
                    >
                      {buildAvatarLabel(thread)}
                    </Text>
                  </View>

                  <View style={localStyles.feedHeaderCopy}>
                    <Text style={localStyles.feedHeaderAuthor}>
                      {props.copy.authorLabel(thread.authorUserId)}
                    </Text>
                    <Text style={localStyles.feedHeaderMeta}>
                      {props.formatTimestamp(thread.lastPostAt)}
                    </Text>
                  </View>

                  <Text style={localStyles.feedOverflow}>...</Text>
                </View>

                <Text style={localStyles.threadTitle}>{thread.title}</Text>
                <Text style={localStyles.threadPreview} numberOfLines={3}>
                  {preview}
                </Text>

                <View style={localStyles.topicRow}>
                  <TopicChip label={props.copy.postCount(thread.postCount)} tone="indigo" />
                  {thread.isLocked ? (
                    <TopicChip label={props.copy.lockedBadge} tone="gold" />
                  ) : null}
                  {thread.postCount >= 4 ? (
                    <TopicChip label={props.copy.hotBadge} tone="paper" />
                  ) : null}
                </View>

                <View style={localStyles.feedFooter}>
                  <Text style={localStyles.feedFooterMeta}>
                    {props.copy.lastActive}: {props.formatTimestamp(thread.lastPostAt)}
                  </Text>
                  <Text style={localStyles.feedFooterStatus}>
                    {selected ? props.copy.selectedBadge : props.copy.tapToOpen}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title={props.copy.trendingTitle}>
        {!trendingThreads.length ? (
          <View style={localStyles.emptyCard}>
            <Text style={localStyles.emptyTitle}>{props.copy.trendingTitle}</Text>
            <Text style={localStyles.helperText}>{props.copy.noThreads}</Text>
          </View>
        ) : (
          <View style={localStyles.trendingCard}>
            {trendingThreads.map((thread, index) => (
              <Pressable
                key={thread.id}
                onPress={() => props.onSelectThread(thread.id)}
                accessibilityRole="button"
                accessibilityLabel={thread.title}
                testID={buildTestId('community-trending-thread', thread.id)}
                style={localStyles.trendingRow}
              >
                <View style={localStyles.trendingRank}>
                  <Text style={localStyles.trendingRankText}>{index + 1}</Text>
                </View>
                <View style={localStyles.trendingCopy}>
                  <Text style={localStyles.trendingMeta}>
                    {props.copy.authorLabel(thread.authorUserId)}
                  </Text>
                  <Text style={localStyles.trendingTitleText} numberOfLines={2}>
                    {thread.title}
                  </Text>
                </View>
                <Text style={localStyles.trendingArrow}>OPEN</Text>
              </Pressable>
            ))}
          </View>
        )}
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
            <View style={localStyles.selectedHeroCard}>
              <View style={localStyles.feedCardHeader}>
                <View
                  style={[
                    localStyles.avatarBubble,
                    { backgroundColor: mobileFeedbackTheme.active.backgroundColor },
                  ]}
                >
                  <Text style={localStyles.avatarBubbleText}>
                    {buildAvatarLabel(selectedThread)}
                  </Text>
                </View>

                <View style={localStyles.feedHeaderCopy}>
                  <Text style={localStyles.feedHeaderAuthor}>
                    {props.copy.authorLabel(selectedThread.authorUserId)}
                  </Text>
                  <Text style={localStyles.feedHeaderMeta}>
                    {props.copy.startedAt}:{' '}
                    {props.formatTimestamp(selectedThread.createdAt)}
                  </Text>
                </View>
              </View>

              <Text style={localStyles.detailTitle}>{selectedThread.title}</Text>

              <View style={localStyles.topicRow}>
                <TopicChip
                  label={props.copy.postCount(selectedThread.postCount)}
                  tone="indigo"
                />
                {selectedThread.isLocked ? (
                  <TopicChip label={props.copy.lockedBadge} tone="gold" />
                ) : null}
              </View>
            </View>

            <View style={localStyles.postList}>
              {visiblePosts.map((post, index) => (
                <View
                  key={post.id}
                  style={[
                    localStyles.postCard,
                    index === 0 ? localStyles.postCardPrimary : null,
                  ]}
                >
                  <View style={localStyles.postHeader}>
                    <Text style={localStyles.postBadge}>
                      {index === 0
                        ? props.copy.originalPostBadge
                        : props.copy.replyBadge}
                    </Text>
                    <Text style={localStyles.postMeta}>
                      {props.copy.authorLabel(post.authorUserId)}
                    </Text>
                  </View>
                  <Text style={localStyles.postBody}>{post.body}</Text>
                  <Text style={localStyles.postMeta}>
                    {props.formatTimestamp(post.createdAt)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={localStyles.replyComposer}>
              <Text style={localStyles.replyLabel}>{props.copy.replyLabel}</Text>
              <TextInput
                value={props.replyBodyInput}
                onChangeText={props.onChangeReplyBody}
                placeholder={
                  selectedThread.isLocked
                    ? props.copy.replyLocked
                    : props.copy.replyPlaceholder
                }
                placeholderTextColor={palette.textMuted}
                style={localStyles.replyInput}
                autoCapitalize="sentences"
                autoCorrect={false}
                multiline
                numberOfLines={4}
                maxLength={5000}
                textAlignVertical="top"
                editable={!selectedThread.isLocked}
                testID="community-reply-body-input"
              />

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
                fullWidth
                testID="community-create-reply-button"
              />
            </View>
          </>
        ) : null}
      </SectionCard>
    </>
  );
}

function TopicChip(props: {
  label: string;
  tone: 'indigo' | 'gold' | 'paper';
}) {
  return (
    <View
      style={[
        localStyles.topicChip,
        props.tone === 'indigo'
          ? localStyles.topicChipIndigo
          : props.tone === 'gold'
            ? localStyles.topicChipGold
            : localStyles.topicChipPaper,
      ]}
    >
      <Text style={localStyles.topicChipText}>{props.label}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  emptyCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  helperText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  heroArtBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#53200e',
  },
  heroBadge: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.accent,
    ...mobileChromeTheme.cardShadow,
  },
  heroBadgeText: {
    color: '#241605',
    fontSize: 20,
    fontWeight: '800',
  },
  heroBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  heroCard: {
    gap: 10,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    paddingHorizontal: 16,
    paddingTop: 110,
    paddingBottom: 16,
    ...mobileChromeTheme.cardShadow,
  },
  heroEyebrow: {
    color: '#fff2cf',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroPill: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroPillText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroSummaryCard: {
    flex: 1,
    gap: 4,
    minWidth: 88,
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...mobileChromeTheme.cardShadowSm,
  },
  heroSummaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroSummaryValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800',
  },
  heroTitle: {
    color: palette.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  heroTopRow: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  searchInput: {
    height: 56,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    color: palette.text,
    paddingHorizontal: 18,
    fontSize: 17,
    ...mobileChromeTheme.cardShadowSm,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  composeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadow,
  },
  avatarBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarBubbleText: {
    color: palette.text,
    fontSize: 19,
    fontWeight: '800',
  },
  composeBody: {
    flex: 1,
    gap: 12,
  },
  composeTitleInput: {
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  composeBodyInput: {
    minHeight: 104,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
  },
  composeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  composeHints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  errorPanel: {
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
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
  feedList: {
    gap: 16,
  },
  feedCard: {
    gap: 10,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadow,
  },
  feedCardSelected: {
    backgroundColor: '#211630',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  feedHeaderAuthor: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  feedHeaderMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  feedOverflow: {
    color: palette.textMuted,
    fontSize: 20,
    fontWeight: '700',
  },
  threadTitle: {
    color: palette.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  threadPreview: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
  },
  topicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  topicChipIndigo: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  topicChipGold: {
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  topicChipPaper: {
    backgroundColor: palette.panelMuted,
  },
  topicChipText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  feedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedFooterMeta: {
    color: palette.textMuted,
    fontSize: 12,
    flex: 1,
  },
  feedFooterStatus: {
    color: palette.accentMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  trendingCard: {
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#5b4514',
    overflow: 'hidden',
    ...mobileChromeTheme.cardShadow,
  },
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: palette.panel,
    borderTopWidth: mobileChromeTheme.borderWidth,
    borderTopColor: palette.border,
  },
  trendingRank: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingRankText: {
    color: '#241605',
    fontSize: 15,
    fontWeight: '800',
  },
  trendingCopy: {
    flex: 1,
    gap: 4,
  },
  trendingMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  trendingTitleText: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  trendingArrow: {
    color: palette.accentMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedHeroCard: {
    gap: 12,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: '#211822',
    padding: 16,
    ...mobileChromeTheme.cardShadow,
  },
  detailTitle: {
    color: palette.text,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '800',
  },
  postList: {
    gap: 14,
  },
  postCard: {
    gap: 10,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  postCardPrimary: {
    backgroundColor: '#35270e',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  postBadge: {
    color: palette.accentMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  postMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  postBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
  },
  replyComposer: {
    gap: 12,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: 14,
  },
  replyLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  replyInput: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
  },
});
