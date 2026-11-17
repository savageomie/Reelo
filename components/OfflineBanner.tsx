import { CloudOff, RefreshCw } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { syncNow, useOfflineQueue } from '@/lib/offlineQueue';
import { Text } from './ui/Text';

/** Small floating pill: offline status and number of changes waiting to sync. */
export function OfflineBanner() {
  const { online, queue, syncing } = useOfflineQueue();
  const insets = useSafeAreaInsets();
  const pending = queue.length;
  if (online && pending === 0) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 72, alignItems: 'center' }}>
      <Animated.View entering={FadeInDown} exiting={FadeOutDown}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={online ? `Sync ${pending} pending changes` : 'Offline'}
          onPress={() => syncNow(true)}
          className="min-h-[40px] flex-row items-center gap-2 rounded-full bg-surface2-dark px-4 py-2"
        >
          {online ? <RefreshCw size={16} color="#F2F3F5" /> : <CloudOff size={16} color="#F2F3F5" />}
          <Text className="text-sm text-white">
            {!online
              ? pending
                ? `Offline · ${pending} change${pending > 1 ? 's' : ''} saved on device`
                : 'Offline · logs will sync later'
              : syncing
                ? 'Syncing…'
                : `${pending} change${pending > 1 ? 's' : ''} waiting · tap to sync`}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
