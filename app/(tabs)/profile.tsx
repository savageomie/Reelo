import { router } from 'expo-router';
import { Bell, Settings } from 'lucide-react-native';
import { View } from 'react-native';

import { ProfileView } from '@/components/ProfileView';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyProfile } from '@/hooks/useProfile';
import { useUnreadCount } from '@/hooks/useSocial';
import { queryClient } from '@/lib/queryClient';

export default function MyProfile() {
  const profile = useMyProfile();
  const unread = useUnreadCount();

  const header = (
    <View className="flex-row items-center justify-between px-2">
      <Text variant="title" className="pl-2">
        Profile
      </Text>
      <View className="flex-row">
        <View>
          <IconButton icon={Bell} label={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications')} />
          {unread ? <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent" /> : null}
        </View>
        <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
      </View>
    </View>
  );

  return (
    <Screen>
      {profile.isLoading ? (
        <View className="items-center gap-3 p-6">
          <Skeleton width={88} height={88} rounded={44} />
          <Skeleton width={160} height={24} />
          <Skeleton height={60} />
          <Skeleton height={140} />
        </View>
      ) : profile.isError || !profile.data ? (
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      ) : (
        <ProfileView
          profile={profile.data}
          header={header}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
            queryClient.invalidateQueries({ queryKey: ['diary'] });
          }}
        />
      )}
    </Screen>
  );
}
