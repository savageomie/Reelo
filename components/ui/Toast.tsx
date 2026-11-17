import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Text } from './Text';

type ToastKind = 'info' | 'success' | 'error';

interface ToastState {
  message: string | null;
  kind: ToastKind;
  key: number;
}

const useToastStore = create<ToastState>(() => ({ message: null, kind: 'info', key: 0 }));

export function toast(message: string, kind: ToastKind = 'info') {
  useToastStore.setState((s) => ({ message, kind, key: s.key + 1 }));
}

/** Mounted once in the root layout. */
export function ToastHost() {
  const { message, kind, key } = useToastStore();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => useToastStore.setState({ message: null }), 2600);
    return () => clearTimeout(t);
  }, [message, key]);
  if (!message) return null;
  const tone = kind === 'error' ? 'bg-danger' : kind === 'success' ? 'bg-success' : 'bg-surface2-dark';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}>
      <Animated.View
        key={key}
        entering={FadeInUp.springify()}
        exiting={FadeOutUp}
        className={`rounded-xl px-4 py-3 shadow-lg ${tone}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text className="text-center font-medium text-white">{message}</Text>
      </Animated.View>
    </View>
  );
}
