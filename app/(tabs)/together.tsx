import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Popcorn, Trophy, Vote } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyGroups } from '@/hooks/useGroups';
import { palette } from '@/theme';

const STATUS = {
  picking: { label: 'Adding picks', icon: Popcorn, color: '#0EA5E9' },
  voting: { label: 'Voting live', icon: Vote, color: palette.accent },
  closed: { label: 'Winner picked', icon: Trophy, color: '#22C55E' },
} as const;

/** Watch Together home: your groups + create / join. */
export default function Together() {
  const groups = useMyGroups();

  return (
    <Screen>
      <View className="px-4 pb-3 pt-2">
        {/* Right padding keeps the title/subtitle clear of any top-right overlay button. */}
        <Text variant="title" className="pr-12">
          Watch Together
        </Text>
        <Text variant="caption" className="mt-1 pr-12">
          Pool picks with friends, vote live, and let the app crown tonight’s film.
        </Text>
        <View className="mt-4 flex-row gap-3">
          <Button title="New group" className="flex-1" onPress={() => router.push({ pathname: '/group/new', params: { tab: 'create' } })} />
          <Button title="Join with code" variant="secondary" className="flex-1" onPress={() => router.push({ pathname: '/group/new', params: { tab: 'join' } })} />
        </View>
      </View>
      {groups.isLoading ? (
        <SkeletonRows count={4} />
      ) : groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : (groups.data ?? []).length === 0 ? (
        <EmptyState icon={Popcorn} title="No groups yet" message="Create a group for movie night and share the invite code." />
      ) : (
        <FlashList
          data={groups.data}
          keyExtractor={(g) => g.id}
          onRefresh={() => groups.refetch()}
          refreshing={groups.isRefetching}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item: g }) => {
            const st = STATUS[g.status];
            const Icon = st.icon;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${st.label}`}
                onPress={() => router.push(g.status === 'voting' ? `/group/${g.id}/vote` : g.status === 'closed' ? `/group/${g.id}/result` : `/group/${g.id}`)}
                className="mx-4 mb-3 flex-row items-center gap-4 rounded-2xl bg-surface p-4 active:opacity-80 dark:bg-surface-dark"
              >
                <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${st.color}22` }}>
                  <Icon size={24} color={st.color} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold">{g.name}</Text>
                  <Text variant="caption" className="text-xs">
                    {g.members.length} members · {g.picks.length} picks · {g.voting_mode === 'ranked' ? 'ranked choice' : 'swipe'}
                  </Text>
                </View>
                <Text className="text-xs font-semibold" style={{ color: st.color }}>
                  {st.label}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
