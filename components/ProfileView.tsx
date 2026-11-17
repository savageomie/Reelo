import { router } from 'expo-router';
import { BarChart3, BookOpen, Bookmark, ChevronRight, Gift, List as ListIcon, Lock, type LucideIcon } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useUserDiary } from '@/hooks/useDiary';
import { useFilms } from '@/hooks/useFilms';
import { useProfileCounts } from '@/hooks/useProfile';
import { useFollowStatus, useToggleFollow } from '@/hooks/useSocial';
import { useTasteMatch } from '@/hooks/useTaste';
import type { Profile } from '@/lib/types';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';
import { PosterCard } from './PosterCard';
import { PosterRow } from './PosterRow';
import { TasteMatchCard } from './TasteMatchCard';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Section } from './ui/Section';
import { Text } from './ui/Text';

function Stat({ label, value, onPress }: { label: string; value: number | undefined; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value ?? 0} ${label}`}
      onPress={onPress}
      disabled={!onPress}
      className="min-h-[44px] flex-1 items-center justify-center"
    >
      <Text className="text-lg font-bold">{value ?? '–'}</Text>
      <Text variant="caption" className="text-xs">
        {label}
      </Text>
    </Pressable>
  );
}

function NavRow({ icon: Icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 border-b border-line px-4 active:opacity-70 dark:border-line-dark"
    >
      <Icon size={20} color={colors.text} />
      <Text className="flex-1">{label}</Text>
      {detail ? <Text variant="caption">{detail}</Text> : null}
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

interface Props {
  profile: Profile;
  header?: React.ReactNode;
  onRefresh?: () => void;
}

/** Shared by "My profile" (tab) and "Public profile" (user/[username]). */
export function ProfileView({ profile, header, onRefresh }: Props) {
  const me = useUserId();
  const isMe = me === profile.id;
  const counts = useProfileCounts(profile.id);
  const diary = useUserDiary(profile.id);
  const follow = useFollowStatus(isMe ? null : profile.id);
  const toggleFollow = useToggleFollow(profile.id);
  const taste = useTasteMatch(isMe ? null : profile.id);
  const recentIds = (diary.data ?? []).slice(0, 12).map((e) => e.tmdb_id);
  const films = useFilms([...profile.favourites, ...recentIds]);
  const canSee = isMe || !profile.is_private || follow.data === 'accepted';
  const year = new Date().getFullYear();

  const followLabel = follow.data === 'accepted' ? 'Following' : follow.data === 'pending' ? 'Requested' : 'Follow';

  return (
    <ScrollView
      contentContainerClassName="pb-28"
      refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} /> : undefined}
    >
      {header}
      <View className="items-center gap-2 px-4 pt-4">
        <Avatar uri={profile.avatar_url} name={profile.username} size={88} />
        <Text variant="title">{profile.display_name || profile.username}</Text>
        <View className="flex-row items-center gap-1">
          <Text variant="caption">@{profile.username}</Text>
          {profile.is_private ? <Lock size={12} color="#9AA0AC" accessibilityLabel="Private profile" /> : null}
        </View>
        {profile.bio ? <Text className="text-center leading-6">{profile.bio}</Text> : null}
        {isMe ? (
          <Button title="Edit profile" variant="secondary" className="mt-2" onPress={() => router.push('/edit-profile')} />
        ) : (
          <Button
            title={followLabel}
            variant={follow.data === 'none' ? 'primary' : 'secondary'}
            className="mt-2 min-w-[140px]"
            loading={toggleFollow.isPending || follow.isLoading}
            onPress={() => toggleFollow.mutate(follow.data === 'none')}
          />
        )}
      </View>

      <View className="mx-4 mt-5 flex-row rounded-2xl bg-surface py-2 dark:bg-surface-dark">
        <Stat label="Films" value={counts.data?.films} onPress={canSee ? () => router.push({ pathname: '/diary', params: { userId: profile.id } }) : undefined} />
        <Stat label={`In ${year}`} value={counts.data?.thisYear} />
        <Stat label="Followers" value={counts.data?.followers} onPress={() => router.push({ pathname: '/follows/[userId]', params: { userId: profile.id, tab: 'followers' } })} />
        <Stat label="Following" value={counts.data?.following} onPress={() => router.push({ pathname: '/follows/[userId]', params: { userId: profile.id, tab: 'following' } })} />
      </View>

      {!isMe ? (
        <View className="mx-4 mt-4">
          <TasteMatchCard score={taste.data?.score} overlap={taste.data?.overlap} loading={taste.isLoading} username={profile.username} />
        </View>
      ) : null}

      {!canSee ? (
        <View className="mx-4 mt-6 items-center gap-2 rounded-2xl bg-surface p-6 dark:bg-surface-dark">
          <Lock size={28} color="#9AA0AC" />
          <Text variant="heading">This diary is private</Text>
          <Text variant="caption" className="text-center">
            Follow @{profile.username} and once they accept, you’ll see their films and reviews.
          </Text>
        </View>
      ) : (
        <>
          <Section title="Favourite films">
            {profile.favourites.length ? (
              <View className="flex-row justify-between px-4">
                {profile.favourites.map((id) => {
                  const f = films.data?.[id];
                  return <PosterCard key={id} tmdbId={id} title={f?.title ?? '…'} posterPath={f?.poster_path} width={78} size="w185" />;
                })}
              </View>
            ) : (
              <Text variant="caption" className="px-4">
                {isMe ? 'Pick your favourite four in Edit profile.' : 'No favourites picked yet.'}
              </Text>
            )}
          </Section>

          <Section title="Recently watched" actionLabel="Diary" onAction={() => router.push({ pathname: '/diary', params: { userId: profile.id } })}>
            <PosterRow
              loading={diary.isLoading}
              error={diary.isError}
              emptyText="No films logged yet."
              width={92}
              items={recentIds.map((id, i) => {
                const f = films.data?.[id];
                return { tmdb_id: id, title: f?.title ?? '…', poster_path: f?.poster_path ?? null, subtitle: diary.data?.[i]?.watched_on };
              })}
            />
          </Section>

          <View className="mt-6 border-t border-line dark:border-line-dark">
            <NavRow icon={BookOpen} label="Diary" detail={String(counts.data?.films ?? '')} onPress={() => router.push({ pathname: '/diary', params: { userId: profile.id } })} />
            <NavRow icon={Bookmark} label="Watchlist" onPress={() => router.push({ pathname: '/watchlist', params: { userId: profile.id } })} />
            <NavRow icon={ListIcon} label="Lists" detail={String(counts.data?.lists ?? '')} onPress={() => router.push({ pathname: '/lists', params: { userId: profile.id } })} />
            <NavRow icon={BarChart3} label="Stats" onPress={() => router.push({ pathname: '/stats', params: { userId: profile.id } })} />
            {isMe ? <NavRow icon={Gift} label={`${year} Wrapped`} onPress={() => router.push('/wrapped')} /> : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}
