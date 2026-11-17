import { Stack, router, useLocalSearchParams } from 'expo-router';
import { MoreHorizontal, UserX } from 'lucide-react-native';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';

import { ProfileView } from '@/components/ProfileView';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, errorMessage } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useProfileByUsername } from '@/hooks/useProfile';
import { useBlockUser, useReport } from '@/hooks/useSocial';
import { useUserId } from '@/store/auth';

export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useProfileByUsername(username);
  const me = useUserId();
  const block = useBlockUser(profile.data?.id);
  const report = useReport();

  const moderate = () => {
    const p = profile.data;
    if (!p) return;
    const doBlock = () =>
      Alert.alert(`Block @${p.username}?`, 'They won’t see your diary or activity and you won’t see theirs.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            block.mutate(undefined, {
              onSuccess: () => {
                toast(`Blocked @${p.username}`);
                router.back();
              },
              onError: (e) => toast(errorMessage(e), 'error'),
            }),
        },
      ]);
    const doReport = () =>
      report.mutate(
        { target_type: 'user', target_id: p.id, reason: 'Reported from profile' },
        { onSuccess: () => toast('Thanks — report sent', 'success'), onError: (e) => toast(errorMessage(e), 'error') },
      );
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Report', 'Block'], destructiveButtonIndex: 2, cancelButtonIndex: 0 },
        (i) => (i === 1 ? doReport() : i === 2 ? doBlock() : undefined),
      );
    } else {
      Alert.alert(`@${p.username}`, undefined, [
        { text: 'Report', onPress: doReport },
        { text: 'Block', style: 'destructive', onPress: doBlock },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen
        options={{
          title: username ? `@${username}` : '',
          headerRight: () =>
            profile.data && profile.data.id !== me ? <IconButton icon={MoreHorizontal} label="More options" onPress={moderate} /> : null,
        }}
      />
      {profile.isLoading ? (
        <View className="items-center gap-3 p-6">
          <Skeleton width={88} height={88} rounded={44} />
          <Skeleton width={160} height={24} />
          <Skeleton height={60} />
        </View>
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      ) : !profile.data ? (
        <EmptyState icon={UserX} title="User not found" message={`There’s no one called @${username}.`} />
      ) : (
        <ProfileView profile={profile.data} onRefresh={() => profile.refetch()} />
      )}
    </View>
  );
}
