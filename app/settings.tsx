import { router } from 'expo-router';
import { ChevronRight, CloudUpload, FileUp, Info, LogOut, Trash2, type LucideIcon } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { signOut } from '@/lib/auth';
import { syncNow, useOfflineQueue } from '@/lib/offlineQueue';
import { kv } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useSettings, type ThemePreference } from '@/store/settings';
import { useTheme } from '@/theme';

function Row({ icon: Icon, label, detail, onPress, danger }: { icon: LucideIcon; label: string; detail?: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 border-b border-line px-4 active:opacity-70 dark:border-line-dark"
    >
      <Icon size={20} color={danger ? colors.danger : colors.text} />
      <Text className={`flex-1 ${danger ? 'text-danger' : ''}`}>{label}</Text>
      {detail ? <Text variant="caption">{detail}</Text> : null}
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function Settings() {
  const { theme, setTheme, hapticsEnabled, setHaptics } = useSettings();
  const { colors } = useTheme();
  const profile = useMyProfile();
  const update = useUpdateProfile();
  const { queue, online, lastSyncedAt } = useOfflineQueue();

  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, diary, reviews, lists, follows and groups. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_my_account');
            if (error) return toast(errorMessage(error), 'error');
            await kv.removeItem('reelo.offline-queue');
            useOfflineQueue.setState({ queue: [] });
            await signOut();
            toast('Account deleted');
            router.replace('/welcome');
          },
        },
      ],
    );

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="pb-16">
      <Text variant="label" className="px-4 pb-2 pt-6">
        Appearance
      </Text>
      <View className="flex-row gap-2 px-4">
        {(['dark', 'light', 'system'] as ThemePreference[]).map((t) => (
          <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} selected={theme === t} onPress={() => setTheme(t)} />
        ))}
      </View>
      <View className="mt-3 min-h-[52px] flex-row items-center justify-between px-4">
        <Text>Haptic feedback</Text>
        <Switch value={hapticsEnabled} onValueChange={setHaptics} accessibilityLabel="Haptic feedback" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>

      <Text variant="label" className="px-4 pb-2 pt-6">
        Privacy
      </Text>
      <View className="min-h-[52px] flex-row items-center justify-between px-4">
        <View className="flex-1 pr-4">
          <Text>Private diary</Text>
          <Text variant="caption" className="text-xs">
            Only followers you approve see your diary, reviews and activity.
          </Text>
        </View>
        <Switch
          value={!!profile.data?.is_private}
          disabled={!profile.data}
          onValueChange={(v) => update.mutate({ is_private: v }, { onError: (e) => toast(errorMessage(e), 'error') })}
          accessibilityLabel="Private diary"
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <Text variant="label" className="px-4 pb-2 pt-6">
        Data
      </Text>
      <View className="border-t border-line dark:border-line-dark">
        <Row
          icon={CloudUpload}
          label="Sync offline changes now"
          detail={`${online ? 'Online' : 'Offline'} · ${queue.length} pending${lastSyncedAt ? ` · last ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}`}
          onPress={() => syncNow(true).then(() => toast(useOfflineQueue.getState().queue.length ? 'Some changes are still waiting' : 'All synced', 'success'))}
        />
        <Row icon={FileUp} label="Import from Letterboxd" onPress={() => router.push('/import')} />
        <Row icon={Info} label="About Reelo & TMDB" onPress={() => router.push('/about')} />
      </View>

      <Text variant="label" className="px-4 pb-2 pt-6">
        Account
      </Text>
      <View className="border-t border-line dark:border-line-dark">
        <Row
          icon={LogOut}
          label="Sign out"
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
        />
        <Row icon={Trash2} label="Delete account and data" onPress={deleteAccount} danger />
      </View>
    </ScrollView>
  );
}
