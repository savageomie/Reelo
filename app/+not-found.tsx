import { Stack, router } from 'expo-router';
import { Film } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/States';

export default function NotFound() {
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState icon={Film} title="This page doesn’t exist" message="The link may be broken or the content was removed." actionLabel="Go home" onAction={() => router.replace('/')} />
    </View>
  );
}
